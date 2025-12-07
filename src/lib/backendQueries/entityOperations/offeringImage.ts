// File: src/lib/backendQueries/entityOperations/offeringImage.ts

import {
  ImageSchema,
  OfferingImageJunctionForCreateSchema,
  OfferingImageJunctionSchema,
  type Image,
  type OfferingImageView,
  type WholesalerItemOffering
} from "$lib/domain/domainTypes";
import { validateEntityBySchema } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import { error } from "@sveltejs/kit";
import type { Transaction } from "mssql";
import { cascadeDeleteOfferingImage } from "../cascadingDeleteOperations";
import { db } from "../db";
import { checkOfferingImageDependencies } from "../dependencyChecks";
import { insertRecordWithTransaction, updateRecordWithTransaction } from "../genericEntityOperations";
import { TransWrapper } from "../transactionWrapper";
import { DeleteCascadeBlockedError } from "./entityErrors";
import type { DeleteResult } from "./entityOpsResultTypes";
import { insertImage, loadImageById, validateFingerprintFields } from "./image";
import { getProductTypeIdForOffering, loadOfferingCoalesceProdDef } from "./offering";
import { createPromptFingerprint } from "$lib/domain";
import { assertDefined } from "$lib/utils/assertions";

/**
 * Extracts all Image fields from source, with optional coalescing from offering.
 * 
 * 100% Schema-driven: Uses ImageSchema.shape to determine ALL image fields.
 * Wartungsfrei: New fields are automatically included!
 * Junction fields are automatically excluded (not in ImageSchema.shape).
 * 
 * @param source - OfferingImageView or Partial<Image>
 * @param offeringForCoalesce - Optional: Offering to coalesce missing fields from
 * @returns Partial<Image> with only Image fields (no junction fields)
 */
function extractImageFields(
  source: Partial<OfferingImageView> | Partial<Image>,
  offeringForCoalesce?: WholesalerItemOffering
): Partial<Image> {
  // ⚠️ BLACKLIST: DB-generated fields that must NEVER be extracted from client/offering
  const blacklist = new Set(['image_id', 'created_at', 'offering_image_id']);

  const imageKeys = Object.keys(ImageSchema.shape) as (keyof Image)[];
  const result: any = {};

  for (const key of imageKeys) {
    // Skip blacklisted fields
    if (blacklist.has(key as string)) {
      continue;
    }

    // Priority 1: Take from source if defined
    if (key in source && (source as any)[key] !== undefined && (source as any)[key] !== null) {
      result[key] = (source as any)[key];
    }
    // Priority 2: Coalesce from offering if available
    else if (offeringForCoalesce && key in offeringForCoalesce) {
      result[key] = (offeringForCoalesce as any)[key];
    }
  }

  return result as Partial<Image>;
}

// ===== TYPES =====

/**
 * Options for loading offering images
 */
export type LoadOfferingImagesOptions = {
  is_explicit?: boolean; // Filter by explicit flag
};

/**
 * Loads all images for a specific offering.
 * Uses the view_offering_images view to join offering_images with images.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param offeringId - The offering_id to load images for or undefined for all
 * @param options - Optional filters (e.g., is_explicit)
 * @returns Array of OfferingImageView records
 */
export async function loadOfferingImages(
  transaction: Transaction | null,
  offeringId?: number,
  options?: LoadOfferingImagesOptions
): Promise<OfferingImageView[]> {
  log.debug("loadOfferingImages", { offeringId, options });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    let query = `
      SELECT *
      FROM dbo.view_offering_images oi
    `;

    const request = transWrapper.request();

    if (offeringId) {
      query += ` WHERE oi.offering_id = @offeringId`;
      request.input('offeringId', offeringId);
    }

    if (options?.is_explicit !== undefined) {
      query += ` AND oi.explicit = @isExplicit`;
      request.input('isExplicit', options.is_explicit ? 1 : 0);
    }

    query += ` ORDER BY oi.sort_order ASC, oi.offering_image_id ASC`;

    const images = (await request.query(query)).recordset;
    await transWrapper.commit();
    log.debug("Offering images loaded", { offeringId, count: images.length });
    return images;

  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Insert a new offering image.
 * Creates the image (via insertImage) and the junction entry.
 * Set explicit = true for explicit images.
 * 
 * @param transaction 
 * @param inputData 
 * @param offering 
 * @returns 
 */
export async function insertOfferingImageFromOffering(
  transaction: Transaction | null,
  inputData: Partial<OfferingImageView>,
  offering: WholesalerItemOffering
): Promise<OfferingImageView> {
  log.debug("insertOfferingImage - validating");

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    const offeringId = inputData.offering_id;

    if (!offeringId) {
      throw error(400, "offering_id is required to create an offering image");
    }

    // Get product_type_id from offering (via product_def → category)
    const productTypeId = await getProductTypeIdForOffering(transWrapper.trans, offeringId);

    // Set it in inputData BEFORE merge!
    inputData.product_type_id = productTypeId;

    log.debug(`insertOfferingImageFromOffering ### offering:%O`, offering);

    // NOW merge - validation will work!
    const imageData = mergePartialImgageDataFromOffering(inputData, offering);

    // Note: Fingerprint calculation happens in insertImage (for all images, including direct inserts)
    // TODO: Optimize: Check if image with filehash already exists.
    const createdImage = await insertImage(transWrapper.trans, imageData);

    // 2. Create junction entry
    const junctionData = {
      offering_id: inputData.offering_id,
      image_id: createdImage.image_id,
      is_primary: inputData.is_primary ?? false,
      sort_order: inputData.sort_order ?? 0,
    };

    const validation = validateEntityBySchema(OfferingImageJunctionForCreateSchema, junctionData);
    if (!validation.isValid) {
      const errorResponse = {
        success: false,
        message: "Validation failed for offering image junction.",
        errors: validation.errors,
      };
      log.warn("Validation failed", errorResponse);
      throw error(400, JSON.stringify(errorResponse));
    }

    const insertedJunction = (await insertRecordWithTransaction(
      OfferingImageJunctionForCreateSchema,
      validation.sanitized as any,
      transWrapper.trans
    )) as OfferingImageView;

    await transWrapper.commit();

    // Combine image and junction data
    const result: OfferingImageView = {
      ...createdImage,
      offering_image_id: insertedJunction.offering_image_id,
      offering_id: insertedJunction.offering_id,
      is_primary: insertedJunction.is_primary,
      sort_order: insertedJunction.sort_order
    };

    log.debug("Offering image inserted successfully", {
      offering_image_id: result.offering_image_id,
      image_id: result.image_id,
    });

    return result;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Merge the image data with that from the offering. If fields are not set, use those from offering.
 * ⚠️ NOTE: We sanitize inputData through validateEntityBySchema(ImageSchema.partial(), imageData).
 * This removes unwanted fields not belonging to "Image".
 * 
 * @param inputData 
 * @param offering 
 * @returns a new OfferingImageView object.
 */
export function mergePartialImgageDataFromOffering(
  inputData: Partial<OfferingImageView> | undefined,
  offering: WholesalerItemOffering
): Partial<Image> {

  inputData = inputData || {};

  // Remove fields that must NOT be set by client (DB-generated)
  delete (inputData as any).image_id;
  delete (inputData as any).created_at;
  delete (inputData as any).offering_image_id;

  // Schema-driven extraction + coalescing - automatically handles ALL fields!
  const imageData = extractImageFields(inputData, offering);

  // Override explicit field (special handling for default value)
  if (inputData.explicit !== undefined) {
    imageData.explicit = inputData.explicit;
  } else {
    imageData.explicit = true;
  }

  // ⚠️ Validate and sanitize to remove Junction fields (E.g. for In-Memory operations that do not use "Image.insertImage")
  const validation = validateEntityBySchema(ImageSchema.partial(), imageData);
  if (!validation.isValid) {
    log.warn("mergeImgageDataFromOffering: Validation failed", validation.errors);
    throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
  }

  // Validate fingerprint fields (Fail-Fast)
  validateFingerprintFields(validation.sanitized as Partial<Image>);

  return validation.sanitized as Partial<Image>;
}

/**
 * Insert a new offering image.
 * Creates the image (via insertImage) and the junction entry.
 * Sets explicit = true for explicit images.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param data - Unvalidated data containing both image and junction fields
 * @returns Created OfferingImageView record
 * @throws Error 400 if validation fails
 */
export async function insertOfferingImage(
  transaction: Transaction | null,
  inputData: Partial<OfferingImageView>
): Promise<OfferingImageView> {
  log.debug("insertOfferingImage - validating");

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    const offeringId = inputData.offering_id;
    if (!offeringId) {
      throw error(400, "offering_id is required to create an offering image");
    }
    const offering = await loadOfferingCoalesceProdDef(transWrapper.trans, offeringId);
    const offeringImageView = await insertOfferingImageFromOffering(transWrapper.trans, inputData, offering);
    await transWrapper.commit();
    return offeringImageView;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Update an existing offering image junction entry.
 * Optionally updates the associated image as well.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param junctionId - The offering_image_id to update
 * @param data - Partial data for junction and/or image
 * @returns Updated OfferingImageView record
 * @throws Error 400 if validation fails, Error 404 if not found
 */
export async function updateOfferingImage(
  transaction: Transaction | null,
  junctionId: number,
  inputData: Partial<OfferingImageView>
): Promise<OfferingImageView> {
  log.debug("updateOfferingImage - validating", { junctionId });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    // 1. Load existing junction entry
    const existingRequest = transWrapper.request();
    existingRequest.input('junctionId', junctionId);
    const existingResult = await existingRequest.query(
      'SELECT * FROM dbo.offering_images WHERE offering_image_id = @junctionId'
    );

    if (existingResult.recordset.length === 0) {
      throw error(404, `Offering image with ID ${junctionId} not found.`);
    }

    const existingJunction = existingResult.recordset[0] as OfferingImageView;
    const imageId = existingJunction.image_id;

    // 2. Update image if image fields are provided
    // Use extractImageFields() to automatically get ALL image fields (wartungsfrei!)
    let updatedImage: Image | null = null;
    const imageUpdateData = extractImageFields(inputData);

    // If offering changes, update product_type_id from new offering
    if (inputData.offering_id !== undefined && inputData.offering_id !== existingJunction.offering_id) {
      const newProductTypeId = await getProductTypeIdForOffering(transWrapper.trans, inputData.offering_id);
      imageUpdateData.product_type_id = newProductTypeId;
    }

    if (Object.keys(imageUpdateData).length > 0) {
      const { updateImage } = await import("./image");
      updatedImage = await updateImage(transWrapper.trans, imageId, imageUpdateData);
    }

    // 3. Update junction entry if junction fields are provided
    if (inputData.is_primary !== undefined || inputData.sort_order !== undefined) {
      const junctionUpdateData: Partial<OfferingImageView> = {};
      if (inputData.is_primary !== undefined) junctionUpdateData.is_primary = inputData.is_primary;
      if (inputData.sort_order !== undefined) junctionUpdateData.sort_order = inputData.sort_order;

      const validation = validateEntityBySchema(OfferingImageJunctionSchema.partial(), junctionUpdateData);
      if (!validation.isValid) {
        const errorResponse = {
          success: false,
          message: "Validation failed for offering image junction update.",
          errors: validation.errors,
        };
        log.warn("Validation failed", errorResponse);
        throw error(400, JSON.stringify(errorResponse));
      }

      const sanitizedUpdate = validation.sanitized as Partial<OfferingImageView>;
      await updateRecordWithTransaction(
        OfferingImageJunctionSchema,
        junctionId,
        "offering_image_id",
        sanitizedUpdate,
        transWrapper.trans
      );
    }

    // 4. Load updated junction entry
    const loadRequest = transWrapper.request();
    loadRequest.input('junctionId', junctionId);
    const loadResult = await loadRequest.query(
      'SELECT * FROM dbo.offering_images WHERE offering_image_id = @junctionId'
    );
    const updatedJunction = loadResult.recordset[0] as OfferingImageView;

    // 5. Load image (use updated if available, otherwise load fresh)
    const finalImage = updatedImage || await loadImageById(transWrapper.trans, imageId);
    if (!finalImage) {
      throw error(404, `Image with ID ${imageId} not found.`);
    }

    await transWrapper.commit();

    // Combine image and junction data
    const result: OfferingImageView = {
      ...finalImage,
      offering_image_id: updatedJunction.offering_image_id,
      offering_id: updatedJunction.offering_id,
      is_primary: updatedJunction.is_primary,
      sort_order: updatedJunction.sort_order,
      ...(updatedJunction.created_at ? { offering_image_created_at: updatedJunction.created_at } : {}),
    };

    log.debug("Offering image updated successfully", {
      offering_image_id: result.offering_image_id,
    });

    return result;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Deletes an offering image junction entry.
 * Optionally deletes the associated image based on cascade/forceCascade flags.
 *
 * Logic:
 * - cascade = false: Only delete junction entry (image remains)
 * - cascade = true: Delete junction + image if explicit = true (soft dependency)
 * - forceCascade = true: Delete junction + image even if explicit = false (hard dependency)
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param junctionId - The offering_image_id to delete
 * @param cascade - If true, delete image if explicit = true (soft dependency)
 * @param forceCascade - If true, delete image even if explicit = false (hard dependency)
 * @returns Deleted OfferingImageJunction record
 * @throws Error 404 if not found
 */
export async function deleteOfferingImage(
  transaction: Transaction | null,
  junctionId: number,
  cascade: boolean = false,
  forceCascade: boolean = false
): Promise<DeleteResult<Partial<OfferingImageView>>> {

  log.debug("deleteOfferingImage", { junctionId, cascade, forceCascade });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();


  try {
    // === CHECK DEPENDENCIES =====================================================================
    const { hard: hardDependencies, soft: softDependencies } = await checkOfferingImageDependencies(junctionId, transWrapper.trans);
    log.info(`Offering image dependencies:`, { hard: hardDependencies, soft: softDependencies });

    let cascade_available = true;
    if (hardDependencies.length > 0) {
      cascade_available = false;
    }
    // If we have soft dependencies without cascade
    // or we have hard dependencies without forceCascade => Return error code.
    if ((softDependencies.length > 0 && !cascade) || (hardDependencies.length > 0 && !forceCascade)) {
      throw new DeleteCascadeBlockedError(hardDependencies, softDependencies, cascade_available);
    }

    // === DELETE =================================================================================

    const cascadeDeleteResult = await cascadeDeleteOfferingImage(junctionId, cascade || forceCascade, transWrapper.trans);
    const deleteResult = { ...cascadeDeleteResult, hardDependencies, softDependencies };

    await transWrapper.commit();
    log.info(`Transaction committed.`);

    // === RETURN RESPONSE ========================================================================

    log.info(`Offering image deleted.`, { deletedResult: deleteResult });
    return deleteResult;

  } catch (err) {
    transWrapper.rollback();
    log.error(`Transaction failed, rolling back.`, { error: err });
    throw err; // Re-throw to be caught by the outer catch block
  }
}

/**
 * Loads a single offering image by junction ID.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param junctionId - The offering_image_id to load
 * @returns OfferingImageView record or null if not found
 */
export async function loadOfferingImageById(
  transaction: Transaction | null,
  junctionId: number
): Promise<OfferingImageView | null> {
  log.debug("loadOfferingImageById", { junctionId });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    const request = transWrapper.request();
    request.input('junctionId', junctionId);
    const result = await request.query(`
      SELECT *
      FROM dbo.view_offering_images oi
      WHERE oi.offering_image_id = @junctionId
    `);

    await transWrapper.commit();

    if (result.recordset.length === 0) {
      return null;
    }

    const offeringImage = result.recordset[0] as OfferingImageView;
    return offeringImage;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Create an in mem OfferingImage. 
 * Set offering_image_id = -1 because not yet in DB.
 * 
 * @param offeringId 
 * @param imageId - Specifiy "-1" im image does not yet exist in DB.
 * @param fileName 
 * @param filePath 
 * @param explicit 
 * @param sortOrder 
 * @returns 
 */
export function createInMemOfferingImage(
  offering: WholesalerItemOffering,
  imageId: number,
  fileName: string,
  filePath: string,
  explicit: boolean,
  sortOrder: number,
  productTypeId: number
): OfferingImageView {

  assertDefined(offering, "offering");
  assertDefined(imageId, "imageId");
  assertDefined(fileName, "fileName");
  assertDefined(filePath, "filePath");
  assertDefined(explicit, "explicit");
  assertDefined(sortOrder, "sortOrder");
  assertDefined(productTypeId, "productTypeId");

  // Pass product_type_id in inputData so validation works!
  const inputData: Partial<OfferingImageView> = {
    product_type_id: productTypeId
  };

  const imagePartial = mergePartialImgageDataFromOffering(inputData, offering);

  const promptFingerprint = createPromptFingerprint(ImageSchema, imagePartial as any);
  if (!promptFingerprint) {
    throw new Error(`Could not calculate fingerprint for offering ${offering.offering_id}`);
  }

  // Create OfferingImageView for in-memory operations
  const offeringImageView: OfferingImageView = {
    // All Image fields - automatically includes ALL current and future fields!
    ...extractImageFields(imagePartial),

    // Override specific fields from parameters
    image_id: imageId,
    filename: fileName,
    filepath: filePath,
    explicit: explicit,
    prompt_fingerprint: promptFingerprint,

    // File metadata fields (not available in dry-run)
    file_hash: null,
    file_size_bytes: null,
    width_px: null,
    height_px: null,
    mime_type: null,
    shopify_url: null,
    shopify_media_id: null,
    uploaded_to_shopify_at: null,
    image_type: null,
    created_at: undefined,

    // Junction fields
    offering_image_id: -1, // Temporary ID for in-memory (not in DB yet)
    offering_id: offering.offering_id,
    is_primary: false,
    sort_order: sortOrder,
  };

  return offeringImageView;
}