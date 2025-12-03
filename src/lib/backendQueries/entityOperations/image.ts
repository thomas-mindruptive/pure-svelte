// File: src/lib/backendQueries/entityOperations/image.ts

import { validateEntityBySchema, genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import {
  ImageForCreateSchema,
  ImageSchema,
  type Image,
} from "$lib/domain/domainTypes";
import { createPromptFingerprint } from "$lib/domain/promptFingerprint";
import type { Transaction } from "mssql";
import { error } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { insertRecordWithTransaction, updateRecordWithTransaction } from "../genericEntityOperations";
import { buildQuery } from "../queryBuilder";
import { type QueryPayload } from "../queryGrammar";
import type { QueryConfig } from "../queryConfig";
import { TransWrapper } from "../transactionWrapper";
import { db } from "../db";

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
 * Enriches image metadata from filepath.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param data - Unvalidated Image data from client
 * @returns Created Image record with generated image_id
 * @throws Error 400 if validation fails
 */
export async function insertImage(
  transaction: Transaction | null,
  data: unknown
): Promise<Image> {
  log.debug("insertImage - validating");
  
  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();
  
  try {

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

  // 2b. Calculate fingerprint for all images (works for both direct inserts and offering images)
  // For offering images, the fingerprint-relevant fields are already merged in insertOfferingImage
  if (ImageSchema.__brandMeta?.fingerPrintForPromptProps) {
    log.debug("Calculating fingerprint", { 
      hasFpKeys: !!ImageSchema.__brandMeta.fingerPrintForPromptProps,
      fpKeys: ImageSchema.__brandMeta.fingerPrintForPromptProps,
      sanitizedFields: Object.keys(sanitized),
      material_id: sanitized.material_id,
      form_id: sanitized.form_id,
      size_range: sanitized.size_range,
      quality_grade: sanitized.quality_grade,
    });
    const fingerprint = createPromptFingerprint(ImageSchema, sanitized as any);
    log.debug("Fingerprint calculated", { fingerprint });
    if (fingerprint) {
      sanitized.prompt_fingerprint = fingerprint;
      log.debug("Fingerprint set in sanitized", { prompt_fingerprint: sanitized.prompt_fingerprint });
    } else {
      log.warn("Fingerprint calculation returned null", { sanitized });
    }
  } else {
    log.warn("ImageSchema.__brandMeta?.fingerPrintForPromptProps is not set");
  }

  // 3. Check if Image already exists (UNIQUE constraint on filepath)
  if (sanitized.filepath) {
    const checkExistingRequest = transWrapper.request();
    checkExistingRequest.input('filepath', sanitized.filepath);
    const existingResult = await checkExistingRequest.query(
      'SELECT image_id FROM dbo.images WHERE filepath = @filepath'
    );

    if (existingResult.recordset.length > 0) {
      const existingImageId = existingResult.recordset[0].image_id;
      log.debug("Image already exists", { image_id: existingImageId, filepath: sanitized.filepath });

      // Load existing image to check if fingerprint-relevant fields changed
      const loadRequest = transWrapper.request();
      loadRequest.input('id', existingImageId);
      const loadResult = await loadRequest.query('SELECT * FROM dbo.images WHERE image_id = @id');
      const existingImage = loadResult.recordset[0] as Image;

      // Check if fingerprint-relevant fields changed
      const fpKeys = ImageSchema.__brandMeta?.fingerPrintForPromptProps as (keyof Image)[] | undefined;
      if (fpKeys && fpKeys.length > 0) {
        const fieldsChanged = fpKeys.some(key => {
          const existingValue = existingImage[key];
          const newValue = sanitized[key];
          // Compare values (handle null/undefined)
          if (existingValue === null || existingValue === undefined) {
            return newValue !== null && newValue !== undefined;
          }
          if (newValue === null || newValue === undefined) {
            return true;
          }
          return existingValue !== newValue;
        });

        if (fieldsChanged) {
          log.debug("Fingerprint-relevant fields changed, updating existing image", { 
            image_id: existingImageId,
            changedFields: fpKeys.filter(key => {
              const existingValue = existingImage[key];
              const newValue = sanitized[key];
              if (existingValue === null || existingValue === undefined) {
                return newValue !== null && newValue !== undefined;
              }
              if (newValue === null || newValue === undefined) {
                return true;
              }
              return existingValue !== newValue;
            })
          });

          // Update the existing image with new fingerprint-relevant fields
          // Build updateData by picking only the fingerprint-relevant fields that changed
          // Type-safe: fpKeys are guaranteed to be keys of Image from SchemaMeta
          const updateData: Partial<Image> = {};
          for (const key of fpKeys) {
            const value = sanitized[key];
            if (value !== undefined) {
              // Type-safe: key is from fpKeys which are guaranteed to be keys of Image
              // We know from SchemaMeta that fpKeys are valid Image keys
              (updateData as any)[key] = value;
            }
          }

          // Recalculate fingerprint
          const mergedData = { ...existingImage, ...updateData };
          const fingerprint = createPromptFingerprint(ImageSchema, mergedData as any);
          if (fingerprint) {
            updateData.prompt_fingerprint = fingerprint;
          }

          // Update the image
          const updatedImage = await updateRecordWithTransaction(
            ImageSchema,
            existingImageId,
            "image_id",
            updateData,
            transWrapper.trans
          );

          await transWrapper.commit();
          return updatedImage as Image;
        }
      }

      // No fingerprint-relevant fields changed, return existing image
      log.debug("Reusing existing image (no fingerprint-relevant changes)", { image_id: existingImageId });
      await transWrapper.commit();
      return existingImage;
    }
  }

  // 4. Insert Image
  log.debug("Inserting new image", { filename: sanitized.filename });
  const insertedImage = (await insertRecordWithTransaction(
    ImageForCreateSchema,
    sanitized as any,
    transWrapper.trans
  )) as Image;

  log.debug("Image inserted successfully", { image_id: insertedImage.image_id });
  await transWrapper.commit();
  return insertedImage;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Updates an existing Image in the database.
 * Re-enriches image metadata if filepath changed.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param imageId - The image_id to update
 * @param data - Partial Image data from client
 * @returns Updated Image record
 * @throws Error 400 if validation fails
 */
export async function updateImage(
  transaction: Transaction | null,
  imageId: number,
  data: unknown
): Promise<Image> {
  log.debug("updateImage - validating", { imageId });
  
  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();
  
  try {

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

  // 2b. Recalculate fingerprint if fingerprint-relevant fields are updated
  const fpKeys = ImageSchema.__brandMeta?.fingerPrintForPromptProps as (keyof Image)[] | undefined;
  if (fpKeys && fpKeys.length > 0) {
    // Only recalculate if all fingerprint-relevant fields are in the update
    const allFpKeysPresent = fpKeys.every(key => key in sanitized);
    if (allFpKeysPresent) {
      const fingerprint = createPromptFingerprint(ImageSchema, sanitized as any);
      if (fingerprint) {
        sanitized.prompt_fingerprint = fingerprint;
      }
    }
  }

  // 3. Update Image
  log.debug("Updating image", { image_id: imageId });
  const updatedImage = await updateRecordWithTransaction(
    ImageSchema,
    imageId,
    "image_id",
    sanitized,
    transWrapper.trans
  );

  if (!updatedImage) {
    throw error(404, `Image with ID ${imageId} not found.`);
  }

  log.debug("Image updated successfully", { image_id: imageId });
  await transWrapper.commit();
  return updatedImage as Image;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Loads a single Image by image_id.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param imageId - The image_id to load
 * @returns Image record or null if not found
 */
export async function loadImageById(
  transaction: Transaction | null,
  imageId: number
): Promise<Image | null> {
  log.debug("loadImageById", { imageId });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();
  
  try {
    const request = transWrapper.request();
    request.input('id', imageId);
    const result = await request.query('SELECT * FROM dbo.images WHERE image_id = @id');

    await transWrapper.commit();
    
    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0] as Image;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Loads images from the database using QueryPayload.
 * Returns flat Image[] (no nested structures, no JSON strings).
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @returns Array of Image records
 */
export async function loadImages(
  transaction: Transaction | null,
  payload?: Partial<QueryPayload<Image>>
): Promise<Image[]> {
  log.debug("loadImages", { clientPayload: payload });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();
  
  try {
    // 1. Define fixed base query
    const basePayload: QueryPayload<Image> = {
      from: { table: "dbo.images", alias: "img" },
      select: genTypedQualifiedColumns(ImageSchema, false) // IMPORTANT: set second param to false! Otherwise we mus referenece the properties through "img.prop"!!!
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
    const result = await queryBuilder.executeQuery(sql, parameters, {transaction: transWrapper.trans});

    log.debug("Images loaded", { resultLength: result.length });
    await transWrapper.commit();
    return result as Image[];
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Deletes an Image from the database.
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param imageId - The image_id to delete
 * @returns Deleted Image record
 * @throws Error 404 if image not found
 */
export async function deleteImage(
  transaction: Transaction | null,
  imageId: number
): Promise<Image> {
  log.debug("deleteImage", { imageId });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();
  
  try {
    const request = transWrapper.request();
    request.input('id', imageId);
    const result = await request.query('DELETE FROM dbo.images OUTPUT DELETED.* WHERE image_id = @id');

    if (result.recordset.length === 0) {
      throw error(404, `Image with ID ${imageId} not found.`);
    }

    const deletedImage = result.recordset[0] as Image;
    log.debug("Image deleted successfully", { image_id: imageId });
    await transWrapper.commit();
    return deletedImage;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}

/**
 * Finds a canonical image by fingerprint.
 * Only returns images where explicit = 0 (canonical images).
 *
 * @param transaction - Optional database transaction (null = create own transaction)
 * @param fingerprint - The prompt_fingerprint to search for
 * @returns Image record or null if not found
 */
export async function findCanonicalImageByFingerprint(
  transaction: Transaction | null,
  fingerprint: string
): Promise<Image | null> {
  log.debug("findCanonicalImageByFingerprint", { fingerprint });

  const transWrapper = new TransWrapper(transaction, db);
  await transWrapper.begin();
  
  try {
    const request = transWrapper.request();
    request.input('fingerprint', fingerprint);
    const result = await request.query(
      'SELECT * FROM dbo.images WHERE explicit = 0 AND prompt_fingerprint = @fingerprint'
    );

    await transWrapper.commit();
    
    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0] as Image;
  } catch (err) {
    await transWrapper.rollback();
    throw err;
  }
}





