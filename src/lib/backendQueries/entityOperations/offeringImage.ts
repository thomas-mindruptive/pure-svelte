// File: src/lib/backendQueries/entityOperations/offeringImage.ts

import { validateEntityBySchema } from "$lib/domain/domainTypes.utils";
import {
  OfferingImageJunctionSchema,
  OfferingImageJunctionForCreateSchema,
  type OfferingImageJunction,
  type Image,
} from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { error } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { insertRecordWithTransaction, updateRecordWithTransaction } from "../genericEntityOperations";
import { TransWrapper } from "../transactionWrapper";
import { db } from "../db";
import { insertImage, loadImageById } from "./image";

/**
 * Type for offering image with junction data (from view_offering_images)
 */
export type OfferingImageWithJunction = Image & {
  offering_image_id: number;
  offering_id: number;
  is_primary: boolean;
  sort_order: number;
  offering_image_created_at?: string;
};

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
 * @param offeringId - The offering_id to load images for
 * @param options - Optional filters (e.g., is_explicit)
 * @returns Array of OfferingImageWithJunction records
 */
export async function loadOfferingImages(
  transaction: Transaction | null,
  offeringId: number,
  options?: LoadOfferingImagesOptions
): Promise<OfferingImageWithJunction[]> {
  log.debug("loadOfferingImages", { offeringId, options });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    let query = `
      SELECT *
      FROM dbo.view_offering_images oi
      WHERE oi.offering_id = @offeringId
    `;

    const request = transWrapper.request();
    request.input('offeringId', offeringId);

    if (options?.is_explicit !== undefined) {
      query += ` AND oi.explicit = @isExplicit`;
      request.input('isExplicit', options.is_explicit ? 1 : 0);
    }

    query += ` ORDER BY oi.sort_order ASC, oi.offering_image_id ASC`;

    const result = await request.query(query);

    await transWrapper.commit();

    // Transform result to OfferingImageWithJunction
    const images: OfferingImageWithJunction[] = result.recordset.map((row: any) => ({
      image_id: row.img_image_id,
      filename: row.filename,
      filepath: row.filepath,
      file_hash: row.file_hash,
      file_size_bytes: row.file_size_bytes,
      width_px: row.width_px,
      height_px: row.height_px,
      mime_type: row.mime_type,
      shopify_url: row.shopify_url,
      shopify_media_id: row.shopify_media_id,
      uploaded_to_shopify_at: row.uploaded_to_shopify_at,
      material_id: row.material_id,
      form_id: row.form_id,
      surface_finish_id: row.surface_finish_id,
      construction_type_id: row.construction_type_id,
      size_range: row.size_range,
      quality_grade: row.quality_grade,
      color_variant: row.color_variant,
      packaging: row.packaging,
      prompt_fingerprint: row.prompt_fingerprint,
      explicit: row.explicit === 1 || row.explicit === true,
      image_type: row.image_type,
      created_at: row.image_created_at,
      // Junction fields
      offering_image_id: row.offering_image_id,
      offering_id: row.offering_id,
      is_primary: row.is_primary === 1 || row.is_primary === true,
      sort_order: row.sort_order,
      offering_image_created_at: row.offering_image_created_at,
    }));

    log.debug("Offering images loaded", { offeringId, count: images.length });
    return images;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Inserts a new offering image.
 * Creates the image (via insertImage) and the junction entry.
 * Sets explicit = true for explicit images.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param data - Unvalidated data containing both image and junction fields
 * @returns Created OfferingImageWithJunction record
 * @throws Error 400 if validation fails
 */
export async function insertOfferingImage(
  transaction: Transaction | null,
  data: unknown
): Promise<OfferingImageWithJunction> {
  log.debug("insertOfferingImage - validating");

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    // Extract image data and junction data from input
    const inputData = data as any;
    const offeringId = inputData.offering_id;

    if (!offeringId) {
      throw error(400, "offering_id is required to create an offering image");
    }

    // Load offering to get material_id, form_id, etc. (with COALESCE for overrides)
    const offeringRequest = transWrapper.request();
    offeringRequest.input('offeringId', offeringId);
    const offeringResult = await offeringRequest.query(`
      SELECT 
        COALESCE(wio.material_id, pd.material_id) AS material_id,
        COALESCE(wio.form_id, pd.form_id) AS form_id,
        COALESCE(wio.surface_finish_id, pd.surface_finish_id) AS surface_finish_id,
        COALESCE(wio.construction_type_id, pd.construction_type_id) AS construction_type_id,
        wio.size AS size_range,
        wio.quality AS quality_grade,
        NULL AS color_variant,  -- Not in offering table
        wio.packaging AS packaging
      FROM dbo.wholesaler_item_offerings wio
      INNER JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
      WHERE wio.offering_id = @offeringId
    `);

    if (offeringResult.recordset.length === 0) {
      throw error(404, `Offering with ID ${offeringId} not found.`);
    }

    const offering = offeringResult.recordset[0] as any;

    // 1. Create/insert Image (with explicit = true for explicit images)
    // Merge offering fields with input data (input data takes precedence if provided)
    const imageData = {
      // Other image fields from input first
      ...inputData,
      // Override with offering fields if not provided in input (or if null/undefined)
      material_id: inputData.material_id ?? offering.material_id,
      form_id: inputData.form_id ?? offering.form_id,
      surface_finish_id: inputData.surface_finish_id ?? offering.surface_finish_id,
      construction_type_id: inputData.construction_type_id ?? offering.construction_type_id,
      size_range: inputData.size_range ?? offering.size_range,
      quality_grade: inputData.quality_grade ?? offering.quality_grade,
      color_variant: inputData.color_variant ?? offering.color_variant,
      packaging: inputData.packaging ?? offering.packaging,
      explicit: inputData.explicit !== undefined ? inputData.explicit : true, // Default to explicit
    };
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
    )) as OfferingImageJunction;

    await transWrapper.commit();

    // Combine image and junction data
    const result: OfferingImageWithJunction = {
      ...createdImage,
      offering_image_id: insertedJunction.offering_image_id,
      offering_id: insertedJunction.offering_id,
      is_primary: insertedJunction.is_primary,
      sort_order: insertedJunction.sort_order,
      ...(insertedJunction.created_at ? { offering_image_created_at: insertedJunction.created_at } : {}),
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
 * Updates an existing offering image junction entry.
 * Optionally updates the associated image as well.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param junctionId - The offering_image_id to update
 * @param data - Partial data for junction and/or image
 * @returns Updated OfferingImageWithJunction record
 * @throws Error 400 if validation fails, Error 404 if not found
 */
export async function updateOfferingImage(
  transaction: Transaction | null,
  junctionId: number,
  data: unknown
): Promise<OfferingImageWithJunction> {
  log.debug("updateOfferingImage - validating", { junctionId });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    const inputData = data as any;

    // 1. Load existing junction entry
    const existingRequest = transWrapper.request();
    existingRequest.input('junctionId', junctionId);
    const existingResult = await existingRequest.query(
      'SELECT * FROM dbo.offering_images WHERE offering_image_id = @junctionId'
    );

    if (existingResult.recordset.length === 0) {
      throw error(404, `Offering image with ID ${junctionId} not found.`);
    }

    const existingJunction = existingResult.recordset[0] as OfferingImageJunction;
    const imageId = existingJunction.image_id;

    // 2. Update image if image fields are provided
    let updatedImage: Image | null = null;
    if (inputData.filename || inputData.filepath || inputData.explicit !== undefined || 
        inputData.material_id !== undefined || inputData.form_id !== undefined ||
        inputData.surface_finish_id !== undefined || inputData.construction_type_id !== undefined ||
        inputData.size_range !== undefined || inputData.quality_grade !== undefined ||
        inputData.color_variant !== undefined || inputData.packaging !== undefined) {
      
      const imageUpdateData: Partial<Image> = {};
      if (inputData.filename !== undefined) imageUpdateData.filename = inputData.filename;
      if (inputData.filepath !== undefined) imageUpdateData.filepath = inputData.filepath;
      if (inputData.explicit !== undefined) imageUpdateData.explicit = inputData.explicit;
      if (inputData.material_id !== undefined) imageUpdateData.material_id = inputData.material_id;
      if (inputData.form_id !== undefined) imageUpdateData.form_id = inputData.form_id;
      if (inputData.surface_finish_id !== undefined) imageUpdateData.surface_finish_id = inputData.surface_finish_id;
      if (inputData.construction_type_id !== undefined) imageUpdateData.construction_type_id = inputData.construction_type_id;
      if (inputData.size_range !== undefined) imageUpdateData.size_range = inputData.size_range;
      if (inputData.quality_grade !== undefined) imageUpdateData.quality_grade = inputData.quality_grade;
      if (inputData.color_variant !== undefined) imageUpdateData.color_variant = inputData.color_variant;
      if (inputData.packaging !== undefined) imageUpdateData.packaging = inputData.packaging;

      if (Object.keys(imageUpdateData).length > 0) {
        const { updateImage } = await import("./image");
        updatedImage = await updateImage(transWrapper.trans, imageId, imageUpdateData);
      }
    }

    // 3. Update junction entry if junction fields are provided
    if (inputData.is_primary !== undefined || inputData.sort_order !== undefined) {
      const junctionUpdateData: Partial<OfferingImageJunction> = {};
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

      const sanitizedUpdate = validation.sanitized as Partial<OfferingImageJunction>;
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
    const updatedJunction = loadResult.recordset[0] as OfferingImageJunction;

    // 5. Load image (use updated if available, otherwise load fresh)
    const finalImage = updatedImage || await loadImageById(transWrapper.trans, imageId);
    if (!finalImage) {
      throw error(404, `Image with ID ${imageId} not found.`);
    }

    await transWrapper.commit();

    // Combine image and junction data
    const result: OfferingImageWithJunction = {
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
 * The associated image is NOT deleted (it may be used by other offerings).
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param junctionId - The offering_image_id to delete
 * @returns Deleted OfferingImageJunction record
 * @throws Error 404 if not found
 */
export async function deleteOfferingImage(
  transaction: Transaction | null,
  junctionId: number
): Promise<OfferingImageJunction> {
  log.debug("deleteOfferingImage", { junctionId });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();

  try {
    const request = transWrapper.request();
    request.input('id', junctionId);
    const result = await request.query(
      'DELETE FROM dbo.offering_images OUTPUT DELETED.* WHERE offering_image_id = @id'
    );

    if (result.recordset.length === 0) {
      throw error(404, `Offering image with ID ${junctionId} not found.`);
    }

    const deletedJunction = result.recordset[0] as OfferingImageJunction;
    log.debug("Offering image deleted successfully", { offering_image_id: junctionId });
    await transWrapper.commit();
    return deletedJunction;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Loads a single offering image by junction ID.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param junctionId - The offering_image_id to load
 * @returns OfferingImageWithJunction record or null if not found
 */
export async function loadOfferingImageById(
  transaction: Transaction | null,
  junctionId: number
): Promise<OfferingImageWithJunction | null> {
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

    const row = result.recordset[0] as any;
    const offeringImage: OfferingImageWithJunction = {
      image_id: row.img_image_id,
      filename: row.filename,
      filepath: row.filepath,
      file_hash: row.file_hash,
      file_size_bytes: row.file_size_bytes,
      width_px: row.width_px,
      height_px: row.height_px,
      mime_type: row.mime_type,
      shopify_url: row.shopify_url,
      shopify_media_id: row.shopify_media_id,
      uploaded_to_shopify_at: row.uploaded_to_shopify_at,
      material_id: row.material_id,
      form_id: row.form_id,
      surface_finish_id: row.surface_finish_id,
      construction_type_id: row.construction_type_id,
      size_range: row.size_range,
      quality_grade: row.quality_grade,
      color_variant: row.color_variant,
      packaging: row.packaging,
      prompt_fingerprint: row.prompt_fingerprint,
      explicit: row.explicit === 1 || row.explicit === true,
      image_type: row.image_type,
      created_at: row.image_created_at,
      // Junction fields
      offering_image_id: row.offering_image_id,
      offering_id: row.offering_id,
      is_primary: row.is_primary === 1 || row.is_primary === true,
      sort_order: row.sort_order,
      offering_image_created_at: row.offering_image_created_at,
    };

    return offeringImage;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}
