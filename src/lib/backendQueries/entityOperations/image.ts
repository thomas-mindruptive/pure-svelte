// File: src/lib/backendQueries/entityOperations/image.ts

import { validateEntityBySchema, genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import {
  ImageForCreateSchema,
  ImageSchema,
  type Image,
} from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { error } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { insertRecordWithTransaction, updateRecordWithTransaction } from "../genericEntityOperations";
import { buildQuery } from "../queryBuilder";
import { type QueryPayload } from "../queryGrammar";
import type { QueryConfig } from "../queryConfig";

// Node.js modules for file metadata extraction
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as crypto from 'crypto';
import * as mime from 'mime-types';
import sharp from 'sharp';
import { queryBuilder } from "..";

// ===== HELPER FUNCTIONS: Image Metadata Enrichment =====

/**
 * Calculates SHA-256 hash of a file.
 * @param filepath - Absolute path to the file
 * @returns Hex-encoded SHA-256 hash
 */
async function calculateFileHash(filepath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filepath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Extracts and enriches image metadata from a file based on filepath.
 *
 * Automatically sets:
 * - filename (extracted from filepath)
 * - file_hash (SHA-256)
 * - file_size_bytes (file size)
 * - mime_type (detected from extension)
 * - width_px, height_px (for image files only)
 *
 * @param imageData - Partial Image object with at least filepath
 * @returns Enriched Image object with calculated metadata
 * @throws Error 400 if filepath is missing or file not found
 */
async function enrichImageMetadata(
  imageData: Partial<Image>
): Promise<Partial<Image>> {
  const { filepath } = imageData;

  if (!filepath) {
    throw error(400, "filepath is required for metadata enrichment");
  }

  // Extract filename from filepath
  const filename = path.basename(filepath);

  // Check if file exists
  if (!existsSync(filepath)) {
    throw error(400, `File not found at path: ${filepath}`);
  }

  // 1. File Stats (size)
  const stats = await fs.stat(filepath);
  const file_size_bytes = stats.size;

  // 2. File Hash (SHA-256)
  const file_hash = await calculateFileHash(filepath);

  // 3. MIME Type
  const mime_type = mime.lookup(filepath) || null;

  // 4. Image Dimensions (only for image files)
  let width_px: number | null = null;
  let height_px: number | null = null;
  if (mime_type?.startsWith('image/')) {
    try {
      const metadata = await sharp(filepath).metadata();
      width_px = metadata.width || null;
      height_px = metadata.height || null;
    } catch (err) {
      log.warn("Could not extract image dimensions", { filepath, error: err });
      // Non-fatal: continue without dimensions
    }
  }

  log.debug("enrichImageMetadata", {
    filepath,
    filename,
    file_size_bytes,
    mime_type,
    dimensions: width_px && height_px ? `${width_px}x${height_px}` : null,
  });

  return {
    ...imageData,
    filename,
    file_hash,
    file_size_bytes,
    width_px,
    height_px,
    mime_type,
  };
}

// ===== ENTITY OPERATIONS =====

/**
 * Inserts a new Image into the database.
 * Applies coalesce logic for offering_id and product_def_id if set.
 * Enriches image metadata from filepath.
 *
 * @param transaction - Active database transaction
 * @param data - Unvalidated Image data from client
 * @returns Created Image record with generated image_id
 * @throws Error 400 if validation fails or required fingerprint fields are missing for offering images
 */
export async function insertImage(
  transaction: Transaction,
  data: unknown
): Promise<Image> {
  log.debug("insertImage - validating");

  // 1. Validate Image data (omit image_id and created_at for create)
  const schemaForCreate = ImageForCreateSchema;
  const validation = validateEntityBySchema(schemaForCreate, data);

  if (!validation.isValid) {
    const errorResponse = {
      success: false,
      message: "Validation failed for image.",
      errors: validation.errors,
    };
    log.warn("Validation failed", errorResponse);
    throw error(400, JSON.stringify(errorResponse));
  }

  const sanitized = validation.sanitized as Partial<Image>;

  // 2. Enrich Image metadata (filename, hash, size, dimensions, mime type)
  if (sanitized.filepath) {
    log.debug("Enriching image metadata", { filepath: sanitized.filepath });
    const enriched = await enrichImageMetadata(sanitized);
    Object.assign(sanitized, enriched);
  }

  // 3. Check if Image already exists (UNIQUE constraint on filepath)
  if (sanitized.filepath) {
    const checkExistingRequest = transaction.request();
    checkExistingRequest.input('filepath', sanitized.filepath);
    const existingResult = await checkExistingRequest.query(
      'SELECT image_id FROM dbo.images WHERE filepath = @filepath'
    );

    if (existingResult.recordset.length > 0) {
      const existingImageId = existingResult.recordset[0].image_id;
      log.debug("Reusing existing image", { image_id: existingImageId, filepath: sanitized.filepath });

      const loadRequest = transaction.request();
      loadRequest.input('id', existingImageId);
      const loadResult = await loadRequest.query('SELECT * FROM dbo.images WHERE image_id = @id');
      const existingImage = loadResult.recordset[0] as Image;

      // If offering_id is provided and existing image doesn't have one (or has a different one), update it
      if (sanitized.offering_id !== undefined && sanitized.offering_id !== null) {
        if (existingImage.offering_id === null || existingImage.offering_id !== sanitized.offering_id) {
          log.debug("Updating offering_id on existing image", {
            existing_offering_id: existingImage.offering_id,
            new_offering_id: sanitized.offering_id,
          });
          
          // Apply coalesce logic for offering_id before updating
          // This ensures fingerprint fields are also updated if needed
          const offeringRequest = transaction.request();
          offeringRequest.input('offering_id', sanitized.offering_id);
          const offeringResult = await offeringRequest.query(`
            SELECT material_id, form_id, surface_finish_id, construction_type_id, product_def_id
            FROM dbo.wholesaler_item_offerings
            WHERE offering_id = @offering_id
          `);

          let productDef: { material_id: number | null; form_id: number | null; surface_finish_id: number | null; construction_type_id: number | null } | null = null;

          if (offeringResult.recordset.length > 0) {
            const offering = offeringResult.recordset[0];
            
            if (offering.product_def_id) {
              const productDefRequest = transaction.request();
              productDefRequest.input('product_def_id', offering.product_def_id);
              const productDefResult = await productDefRequest.query(`
                SELECT material_id, form_id, surface_finish_id, construction_type_id
                FROM dbo.product_definitions
                WHERE product_def_id = @product_def_id
              `);
              
              if (productDefResult.recordset.length > 0) {
                productDef = productDefResult.recordset[0];
              }
            }

            // Apply coalesce logic: existing ?? data ?? offering ?? product_def ?? null
            const material_id = existingImage.material_id ?? sanitized.material_id ?? offering.material_id ?? productDef?.material_id ?? null;
            const form_id = existingImage.form_id ?? sanitized.form_id ?? offering.form_id ?? productDef?.form_id ?? null;
            const surface_finish_id = existingImage.surface_finish_id ?? sanitized.surface_finish_id ?? offering.surface_finish_id ?? productDef?.surface_finish_id ?? null;
            const construction_type_id = existingImage.construction_type_id ?? sanitized.construction_type_id ?? offering.construction_type_id ?? productDef?.construction_type_id ?? null;

            // Update with offering_id and coalesced fingerprint fields
            const updateRequest = transaction.request();
            updateRequest.input('id', existingImageId);
            updateRequest.input('offering_id', sanitized.offering_id);
            updateRequest.input('material_id', material_id);
            updateRequest.input('form_id', form_id);
            updateRequest.input('surface_finish_id', surface_finish_id);
            updateRequest.input('construction_type_id', construction_type_id);
            const updateResult = await updateRequest.query(
              `UPDATE dbo.images 
               SET offering_id = @offering_id, 
                   material_id = @material_id, 
                   form_id = @form_id, 
                   surface_finish_id = @surface_finish_id, 
                   construction_type_id = @construction_type_id 
               OUTPUT INSERTED.* 
               WHERE image_id = @id`
            );
            return updateResult.recordset[0] as Image;
          } else {
            // Offering not found, just update offering_id
            const updateRequest = transaction.request();
            updateRequest.input('id', existingImageId);
            updateRequest.input('offering_id', sanitized.offering_id);
            const updateResult = await updateRequest.query(
              'UPDATE dbo.images SET offering_id = @offering_id OUTPUT INSERTED.* WHERE image_id = @id'
            );
            return updateResult.recordset[0] as Image;
          }
        }
      }

      return existingImage;
    }
  }

  // 4. Apply coalesce logic for offering_id
  if (sanitized.offering_id) {
    log.debug("Applying coalesce logic for offering", { offering_id: sanitized.offering_id });

    // Load offering (flat)
    const offeringRequest = transaction.request();
    offeringRequest.input('offering_id', sanitized.offering_id);
    const offeringResult = await offeringRequest.query(`
      SELECT material_id, form_id, surface_finish_id, construction_type_id, product_def_id
      FROM dbo.wholesaler_item_offerings
      WHERE offering_id = @offering_id
    `);

    let productDef: { material_id: number | null; form_id: number | null; surface_finish_id: number | null; construction_type_id: number | null } | null = null;

    if (offeringResult.recordset.length > 0) {
      const offering = offeringResult.recordset[0];
      
      // Load product_def if offering has one
      if (offering.product_def_id) {
        const productDefRequest = transaction.request();
        productDefRequest.input('product_def_id', offering.product_def_id);
        const productDefResult = await productDefRequest.query(`
          SELECT material_id, form_id, surface_finish_id, construction_type_id
          FROM dbo.product_definitions
          WHERE product_def_id = @product_def_id
        `);
        
        if (productDefResult.recordset.length > 0) {
          productDef = productDefResult.recordset[0];
        }
      }

      // Apply coalesce logic: data ?? offering ?? product_def ?? null
      sanitized.material_id = sanitized.material_id ?? offering.material_id ?? productDef?.material_id ?? null;
      sanitized.form_id = sanitized.form_id ?? offering.form_id ?? productDef?.form_id ?? null;
      sanitized.surface_finish_id = sanitized.surface_finish_id ?? offering.surface_finish_id ?? productDef?.surface_finish_id ?? null;
      sanitized.construction_type_id = sanitized.construction_type_id ?? offering.construction_type_id ?? productDef?.construction_type_id ?? null;

      log.debug("Coalesced values for offering image", {
        offering_id: sanitized.offering_id,
        material_id: sanitized.material_id,
        form_id: sanitized.form_id,
        surface_finish_id: sanitized.surface_finish_id,
        construction_type_id: sanitized.construction_type_id,
      });

      // Fail-fast: Check if all required fingerprint fields are set
      if (!sanitized.material_id || !sanitized.form_id || !sanitized.surface_finish_id || !sanitized.construction_type_id) {
        const errorResponse = {
          success: false,
          message: "All fingerprint fields (material_id, form_id, surface_finish_id, construction_type_id) must be set for offering images.",
          status_code: 400,
          error_code: "MISSING_FINGERPRINT_FIELDS",
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn("Missing fingerprint fields for offering image", errorResponse);
        throw error(400, JSON.stringify(errorResponse));
      }
    }
  }

  // 5. Apply coalesce logic for product_def_id (optional, no error if fields missing)
  if (sanitized.product_def_id && !sanitized.offering_id) {
    log.debug("Applying coalesce logic for product definition", { product_def_id: sanitized.product_def_id });

    const productDefRequest = transaction.request();
    productDefRequest.input('product_def_id', sanitized.product_def_id);
    const productDefResult = await productDefRequest.query(`
      SELECT material_id, form_id, surface_finish_id, construction_type_id
      FROM dbo.product_definitions
      WHERE product_def_id = @product_def_id
    `);

    if (productDefResult.recordset.length > 0) {
      const productDef = productDefResult.recordset[0];

      // COALESCE logic: provided value ?? product_def value ?? null
      sanitized.material_id = sanitized.material_id ?? productDef.material_id ?? null;
      sanitized.form_id = sanitized.form_id ?? productDef.form_id ?? null;
      sanitized.surface_finish_id = sanitized.surface_finish_id ?? productDef.surface_finish_id ?? null;
      sanitized.construction_type_id = sanitized.construction_type_id ?? productDef.construction_type_id ?? null;

      log.debug("Coalesced values for product definition image", {
        product_def_id: sanitized.product_def_id,
        material_id: sanitized.material_id,
        form_id: sanitized.form_id,
        surface_finish_id: sanitized.surface_finish_id,
        construction_type_id: sanitized.construction_type_id,
      });
    }
  }

  // 6. Insert Image
  log.debug("Inserting new image", { filename: sanitized.filename });
  const insertedImage = (await insertRecordWithTransaction(
    ImageForCreateSchema,
    sanitized as any,
    transaction
  )) as Image;

  log.debug("Image inserted successfully", { image_id: insertedImage.image_id });
  return insertedImage;
}

/**
 * Updates an existing Image in the database.
 * Applies coalesce logic for offering_id and product_def_id if set.
 * Re-enriches image metadata if filepath changed.
 *
 * @param transaction - Active database transaction
 * @param imageId - The image_id to update
 * @param data - Partial Image data from client
 * @returns Updated Image record
 * @throws Error 400 if validation fails or required fingerprint fields are missing for offering images
 */
export async function updateImage(
  transaction: Transaction,
  imageId: number,
  data: unknown
): Promise<Image> {
  log.debug("updateImage - validating", { imageId });

  // 1. Validate partial Image data
  const schemaForUpdate = ImageSchema.partial();
  const validation = validateEntityBySchema(schemaForUpdate, data);

  if (!validation.isValid) {
    const errorResponse = {
      success: false,
      message: "Validation failed for image update.",
      errors: validation.errors,
    };
    log.warn("Validation failed", errorResponse);
    throw error(400, JSON.stringify(errorResponse));
  }

  const sanitized = validation.sanitized as Partial<Image>;

  // 2. Re-enrich metadata if filepath changed
  if (sanitized.filepath) {
    log.debug("Filepath changed, re-enriching metadata", { filepath: sanitized.filepath });
    const enriched = await enrichImageMetadata(sanitized);
    Object.assign(sanitized, enriched);
  }

  // 3. Apply coalesce logic for offering_id (if offering_id is being set/changed)
  if (sanitized.offering_id !== undefined) {
    log.debug("Applying coalesce logic for offering", { offering_id: sanitized.offering_id });

    // Load offering (flat)
    const offeringRequest = transaction.request();
    offeringRequest.input('offering_id', sanitized.offering_id);
    const offeringResult = await offeringRequest.query(`
      SELECT material_id, form_id, surface_finish_id, construction_type_id, product_def_id
      FROM dbo.wholesaler_item_offerings
      WHERE offering_id = @offering_id
    `);

    let productDef: { material_id: number | null; form_id: number | null; surface_finish_id: number | null; construction_type_id: number | null } | null = null;

    if (offeringResult.recordset.length > 0) {
      const offering = offeringResult.recordset[0];
      
      // Load product_def if offering has one
      if (offering.product_def_id) {
        const productDefRequest = transaction.request();
        productDefRequest.input('product_def_id', offering.product_def_id);
        const productDefResult = await productDefRequest.query(`
          SELECT material_id, form_id, surface_finish_id, construction_type_id
          FROM dbo.product_definitions
          WHERE product_def_id = @product_def_id
        `);
        
        if (productDefResult.recordset.length > 0) {
          productDef = productDefResult.recordset[0];
        }
      }

      // Apply coalesce logic: data ?? offering ?? product_def ?? null
      sanitized.material_id = sanitized.material_id ?? offering.material_id ?? productDef?.material_id ?? null;
      sanitized.form_id = sanitized.form_id ?? offering.form_id ?? productDef?.form_id ?? null;
      sanitized.surface_finish_id = sanitized.surface_finish_id ?? offering.surface_finish_id ?? productDef?.surface_finish_id ?? null;
      sanitized.construction_type_id = sanitized.construction_type_id ?? offering.construction_type_id ?? productDef?.construction_type_id ?? null;

      // Fail-fast: Check if all required fingerprint fields are set
      if (!sanitized.material_id || !sanitized.form_id || !sanitized.surface_finish_id || !sanitized.construction_type_id) {
        const errorResponse = {
          success: false,
          message: "All fingerprint fields (material_id, form_id, surface_finish_id, construction_type_id) must be set for offering images.",
          status_code: 400,
          error_code: "MISSING_FINGERPRINT_FIELDS",
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn("Missing fingerprint fields for offering image", errorResponse);
        throw error(400, JSON.stringify(errorResponse));
      }
    }
  }

  // 4. Apply coalesce logic for product_def_id (optional, no error if fields missing)
  if (sanitized.product_def_id !== undefined && sanitized.offering_id === undefined) {
    log.debug("Applying coalesce logic for product definition", { product_def_id: sanitized.product_def_id });

    const productDefRequest = transaction.request();
    productDefRequest.input('product_def_id', sanitized.product_def_id);
    const productDefResult = await productDefRequest.query(`
      SELECT material_id, form_id, surface_finish_id, construction_type_id
      FROM dbo.product_definitions
      WHERE product_def_id = @product_def_id
    `);

    if (productDefResult.recordset.length > 0) {
      const productDef = productDefResult.recordset[0];

      // COALESCE logic: provided value ?? product_def value ?? null
      sanitized.material_id = sanitized.material_id ?? productDef.material_id ?? null;
      sanitized.form_id = sanitized.form_id ?? productDef.form_id ?? null;
      sanitized.surface_finish_id = sanitized.surface_finish_id ?? productDef.surface_finish_id ?? null;
      sanitized.construction_type_id = sanitized.construction_type_id ?? productDef.construction_type_id ?? null;
    }
  }

  // 5. Update Image
  log.debug("Updating image", { image_id: imageId });
  const updatedImage = await updateRecordWithTransaction(
    ImageSchema,
    imageId,
    "image_id",
    sanitized,
    transaction
  );

  if (!updatedImage) {
    throw error(404, `Image with ID ${imageId} not found.`);
  }

  log.debug("Image updated successfully", { image_id: imageId });
  return updatedImage as Image;
}

/**
 * Loads a single Image by image_id.
 *
 * @param transaction - Active database transaction
 * @param imageId - The image_id to load
 * @returns Image record or null if not found
 */
export async function loadImageById(
  transaction: Transaction,
  imageId: number
): Promise<Image | null> {
  log.debug("loadImageById", { imageId });

  const request = transaction.request();
  request.input('id', imageId);
  const result = await request.query('SELECT * FROM dbo.images WHERE image_id = @id');

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0] as Image;
}

/**
 * Loads images from the database using QueryPayload.
 * Returns flat Image[] (no nested structures, no JSON strings).
 *
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @returns Array of Image records
 */
export async function loadImages(
  transaction: Transaction,
  payload?: Partial<QueryPayload<Image>>
): Promise<Image[]> {
  log.debug("loadImages", { clientPayload: payload });

  // 1. Define fixed base query
  const basePayload: QueryPayload<Image> = {
    from: { table: "dbo.images", alias: "img" },
    select: genTypedQualifiedColumns(ImageSchema, true)
  };

  // 2. Merge payload (WHERE, LIMIT, custom ORDER BY override base)
  const mergedPayload: QueryPayload<Image> = {
    ...basePayload,
    ...(payload?.where && { where: payload.where }),
    ...(payload?.limit && { limit: payload.limit }),
    ...(payload?.offset && { offset: payload.offset }),
    ...(payload?.orderBy && { orderBy: payload.orderBy }), // Client can override
  };

  // 3. Build SQL using queryBuilder
  const { sql, parameters } = buildQuery(mergedPayload, {} as QueryConfig);
  const result = await queryBuilder.executeQuery(sql, parameters, {transaction});

  log.debug("Images loaded", { resultLength: result.length });

  return result as Image[];
}

/**
 * Deletes an Image from the database.
 *
 * @param transaction - Active database transaction
 * @param imageId - The image_id to delete
 * @returns Deleted Image record
 * @throws Error 404 if image not found
 */
export async function deleteImage(
  transaction: Transaction,
  imageId: number
): Promise<Image> {
  log.debug("deleteImage", { imageId });

  const request = transaction.request();
  request.input('id', imageId);
  const result = await request.query('DELETE FROM dbo.images OUTPUT DELETED.* WHERE image_id = @id');

  if (result.recordset.length === 0) {
    throw error(404, `Image with ID ${imageId} not found.`);
  }

  const deletedImage = result.recordset[0] as Image;
  log.debug("Image deleted successfully", { image_id: imageId });
  return deletedImage;
}





