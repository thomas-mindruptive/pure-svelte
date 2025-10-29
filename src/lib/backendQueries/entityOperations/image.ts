// File: src/lib/backendQueries/entityOperations/image.ts

import { validateEntityBySchema, genColumnsForJsonPath } from "$lib/domain/domainTypes.utils";
import {
  ProductDefinitionImage_Image_Schema,
  ImageForCreateSchema,
  ProductDefinitionImageForCreateSchema,
  ImageSchema,
  ProductDefinitionImage_Schema,
  type ProductDefinitionImage_Image,
  type Image,
  type ProductDefinitionImage,
} from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { error } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { insertRecordWithTransaction, updateRecordWithTransaction } from "../genericEntityOperations";
import { buildQuery } from "../queryBuilder";
import { JoinType, LogicalOperator, ComparisonOperator, type QueryPayload } from "../queryGrammar";
import type { QueryConfig } from "../queryConfig";

// Node.js modules for file metadata extraction
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as crypto from 'crypto';
import * as mime from 'mime-types';
import sharp from 'sharp';

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
 * Inserts a new ProductDefinitionImage (which extends Image using OOP inheritance).
 * Validates the complete nested object, then inserts both records atomically.
 * The same image_id is used as PK in both tables (inheritance pattern).
 *
 * @param transaction - Active database transaction
 * @param data - Unvalidated nested object from client
 * @returns Complete nested object with generated image_id
 */
export async function insertProductDefinitionImageWithImage(
  transaction: Transaction,
  data: unknown
): Promise<ProductDefinitionImage_Image> {
  log.debug("insertProductDefinitionImageWithImage - validating");

  // 1. Validate complete nested object
  const schemaForCreate = ProductDefinitionImage_Image_Schema.omit({
    image_id: true,  // Will be auto-generated
    created_at: true,
  }).extend({
    image: ImageForCreateSchema,
  });

  const validation = validateEntityBySchema(schemaForCreate, data);

  if (!validation.isValid) {
    const errorResponse = {
      success: false,
      message: "Validation failed for product definition image with image.",
      errors: validation.errors,
    };
    log.warn("Validation failed", errorResponse);
    throw error(400, JSON.stringify(errorResponse));
  }

  const sanitized = validation.sanitized as any;

  // 2. Enrich Image metadata (filename, hash, size, dimensions, mime type)
  log.debug("Enriching image metadata", { filepath: sanitized.image.filepath });
  const enrichedImageData = await enrichImageMetadata(sanitized.image);

  // 3. Check if Image already exists (UNIQUE constraint on filepath)
  // If exists, reuse it instead of creating duplicate
  const checkExistingRequest = transaction.request();
  checkExistingRequest.input('filepath', enrichedImageData.filepath);
  const existingResult = await checkExistingRequest.query(
    'SELECT image_id FROM dbo.images WHERE filepath = @filepath'
  );

  let insertedImage: Image;
  if (existingResult.recordset.length > 0) {
    // Reuse existing image
    const existingImageId = existingResult.recordset[0].image_id;
    log.debug("Reusing existing image", { image_id: existingImageId, filepath: enrichedImageData.filepath });

    // Load the existing image data
    const loadRequest = transaction.request();
    loadRequest.input('id', existingImageId);
    const loadResult = await loadRequest.query('SELECT * FROM dbo.images WHERE image_id = @id');
    insertedImage = loadResult.recordset[0] as Image;
  } else {
    // Insert new Image (base class) with enriched metadata
    log.debug("Inserting new image", { filename: enrichedImageData.filename });
    // Type assertion: enrichedImageData now has all required fields after enrichment
    insertedImage = (await insertRecordWithTransaction(ImageForCreateSchema, enrichedImageData as any, transaction)) as Image;
  }

  // 4. SNAPSHOT: Inherit values from product_definition if not provided
  // This is a one-time copy on first save - values will NOT change if product_def changes
  let inheritedValues = {
    material_id: sanitized.material_id,
    form_id: sanitized.form_id,
    surface_finish_id: sanitized.surface_finish_id,
    construction_type_id: sanitized.construction_type_id,
  };

  // Only inherit if fields are NULL/undefined
  if (!inheritedValues.material_id || !inheritedValues.form_id ||
      !inheritedValues.surface_finish_id || !inheritedValues.construction_type_id) {

    log.debug("Some fields are NULL, checking product_definition for inheritance");

    // Load product_definition to get default values
    const prodDefRequest = transaction.request();
    prodDefRequest.input('product_def_id', sanitized.product_def_id);
    const prodDefResult = await prodDefRequest.query(`
      SELECT material_id, form_id, surface_finish_id, construction_type_id
      FROM dbo.product_definitions
      WHERE product_def_id = @product_def_id
    `);

    if (prodDefResult.recordset.length > 0) {
      const productDef = prodDefResult.recordset[0];

      // COALESCE logic: provided value ?? product_def value ?? null
      inheritedValues = {
        material_id: sanitized.material_id ?? productDef.material_id ?? null,
        form_id: sanitized.form_id ?? productDef.form_id ?? null,
        surface_finish_id: sanitized.surface_finish_id ?? productDef.surface_finish_id ?? null,
        construction_type_id: sanitized.construction_type_id ?? productDef.construction_type_id ?? null,
      };

      log.debug("Inherited values from product_definition", {
        original: {
          material_id: sanitized.material_id,
          form_id: sanitized.form_id,
          surface_finish_id: sanitized.surface_finish_id,
          construction_type_id: sanitized.construction_type_id,
        },
        inherited: inheritedValues,
        product_def: productDef
      });
    }
  }

  // 5. Insert ProductDefinitionImage (subclass) with THE SAME image_id (OOP inheritance)
  const pdiData = {
    image_id: insertedImage.image_id,  // ← Same ID as parent (inheritance pattern)
    product_def_id: sanitized.product_def_id,
    // Variant Matching Fields - with SNAPSHOT inheritance
    material_id: inheritedValues.material_id,
    form_id: inheritedValues.form_id,
    surface_finish_id: inheritedValues.surface_finish_id,
    construction_type_id: inheritedValues.construction_type_id,
    // Image Metadata
    size_range: sanitized.size_range,
    quality_grade: sanitized.quality_grade,
    color_variant: sanitized.color_variant,
    image_type: sanitized.image_type,
    sort_order: sanitized.sort_order,
    is_primary: sanitized.is_primary,
  };

  log.debug("Inserting product definition image with inherited ID", {
    product_def_id: pdiData.product_def_id,
    image_id: pdiData.image_id,
  });

  const insertedPdi = (await insertRecordWithTransaction(
    ProductDefinitionImageForCreateSchema,
    pdiData,
    transaction
  )) as ProductDefinitionImage;

  // 4. Return nested structure
  return {
    ...insertedPdi,
    image: insertedImage,
  } as ProductDefinitionImage_Image;
}

/**
 * Updates both Image and ProductDefinitionImage records (OOP inheritance).
 * Validates the complete nested object, then updates both records atomically.
 * Uses the same image_id for both tables (inheritance pattern).
 *
 * @param transaction - Active database transaction
 * @param data - Unvalidated nested object from client (must include image_id)
 * @returns Complete updated nested object
 */
export async function updateProductDefinitionImageWithImage(
  transaction: Transaction,
  data: unknown
): Promise<ProductDefinitionImage_Image> {
  log.debug("updateProductDefinitionImageWithImage - validating");

  // 1. Validate complete nested object (partial updates allowed)
  const schemaForUpdate = ProductDefinitionImage_Image_Schema.partial().extend({
    image: ImageSchema.partial(),
  });

  const validation = validateEntityBySchema(schemaForUpdate, data);

  if (!validation.isValid) {
    const errorResponse = {
      success: false,
      message: "Validation failed for product definition image update.",
      errors: validation.errors,
    };
    log.warn("Validation failed", errorResponse);
    throw error(400, JSON.stringify(errorResponse));
  }

  const sanitized = validation.sanitized as any;

  // Ensure image_id is present (it's the PK for BOTH tables)
  if (!sanitized.image_id) {
    throw error(400, "image_id is required for update (it's the PK for both tables in OOP inheritance)");
  }

  // 2. Update Image (base class) if image data provided
  if (sanitized.image && Object.keys(sanitized.image).length > 0) {
    // Re-enrich metadata if filepath changed
    if (sanitized.image.filepath) {
      log.debug("Filepath changed, re-enriching metadata", { filepath: sanitized.image.filepath });
      sanitized.image = await enrichImageMetadata(sanitized.image);
    }

    log.debug("Updating image (base class)", { image_id: sanitized.image_id });
    await updateRecordWithTransaction(ImageSchema, sanitized.image_id, "image_id", sanitized.image, transaction);
  }

  // 3. Update ProductDefinitionImage (subclass) if PDI data provided
  const pdiData: any = { ...sanitized };
  delete pdiData.image; // Remove nested object

  if (Object.keys(pdiData).length > 1) {
    // more than just image_id
    log.debug("Updating product definition image (subclass)", { image_id: sanitized.image_id });
    await updateRecordWithTransaction(
      ProductDefinitionImage_Schema,
      sanitized.image_id,
      "image_id",
      pdiData,
      transaction
    );
  }

  // 4. Load and return complete nested object
  return await loadProductDefinitionImageWithImageById(transaction, sanitized.image_id);
}

/**
 * Loads a single ProductDefinitionImage with its associated Image data by image_id.
 * Uses image_id as the PK (OOP inheritance pattern).
 *
 * @param transaction - Active database transaction
 * @param imageId - The image_id (PK for both tables)
 * @returns Nested object with image data
 */
export async function loadProductDefinitionImageWithImageById(
  transaction: Transaction,
  imageId: number
): Promise<ProductDefinitionImage_Image> {
  log.debug("loadProductDefinitionImageWithImageById", { imageId });

  // Use the flexible load function with a WHERE condition
  const whereCondition = {
    key: "pdi.image_id" as keyof ProductDefinitionImage_Image,
    whereCondOp: ComparisonOperator.EQUALS,
    val: imageId,
  };

  const jsonString = await loadProductDefinitionImagesWithImage(transaction, {
    where: whereCondition,
    limit: 1,
  });

  const parsedData = JSON.parse(jsonString);

  if (!parsedData || parsedData.length === 0) {
    throw error(404, `Product definition image with ID ${imageId} not found.`);
  }

  return parsedData[0] as ProductDefinitionImage_Image;
}

/**
 * Loads product definition images with their associated image data using QueryPayload.
 * Server enforces the JOIN, client can specify WHERE, ORDER BY, LIMIT, etc.
 *
 * @param transaction - Active database transaction
 * @param clientPayload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @returns JSON string with array of nested objects
 */
export async function loadProductDefinitionImagesWithImage(
  transaction: Transaction,
  clientPayload?: Partial<QueryPayload<ProductDefinitionImage_Image>>
): Promise<string> {
  log.debug("loadProductDefinitionImagesWithImage", { clientPayload });

  // 1. Define fixed base query with JOIN
  const basePayload: QueryPayload<ProductDefinitionImage_Image> = {
    from: { table: "dbo.product_definition_images", alias: "pdi" },
    joins: [
      {
        type: JoinType.INNER,
        table: "dbo.images",
        alias: "img",
        on: {
          joinCondOp: LogicalOperator.AND,
          conditions: [
            { columnA: "pdi.image_id", op: ComparisonOperator.EQUALS, columnB: "img.image_id" }
          ]
        }
      }
    ],
    select: genColumnsForJsonPath(ProductDefinitionImage_Image_Schema, true),
    orderBy: [{ key: "pdi.sort_order" as keyof ProductDefinitionImage_Image, direction: "asc" }]
  };

  // 2. Merge client payload (WHERE, LIMIT, custom ORDER BY override base)
  const mergedPayload: QueryPayload<ProductDefinitionImage_Image> = {
    ...basePayload,
    ...(clientPayload?.where && { where: clientPayload.where }),
    ...(clientPayload?.limit && { limit: clientPayload.limit }),
    ...(clientPayload?.offset && { offset: clientPayload.offset }),
    ...(clientPayload?.orderBy && { orderBy: clientPayload.orderBy }), // Client can override
  };

  // 3. Build SQL using queryBuilder
  const { sql, parameters } = buildQuery(mergedPayload, {} as QueryConfig);

  // 4. Bind parameters and execute
  const request = transaction.request();
  for (const [key, value] of Object.entries(parameters)) {
    request.input(key, value);
  }

  const finalSql = sql + " FOR JSON PATH, INCLUDE_NULL_VALUES";
  log.debug("Executing SQL", { sql: finalSql });

  const result = await request.query(finalSql);

  if (!result.recordset?.length) {
    return "[]"; // Empty array
  }

  // FOR JSON PATH returns JSON in the first column of the first row
  const firstRow = result.recordset[0];
  const jsonString = firstRow[Object.keys(firstRow)[0]];

  log.debug("Product definition images loaded", { resultLength: jsonString?.length });

  return jsonString || "[]";
}

/**
 * Deletes a ProductDefinitionImage completely (OOP inheritance pattern).
 * Deletes from BOTH tables atomically:
 * 1. product_definition_images (subclass)
 * 2. images (base class)
 *
 * @param transaction - Active database transaction
 * @param imageId - The image_id (PK for both tables)
 * @returns Deleted records from both tables
 */
export async function deleteProductDefinitionImageWithImage(
  transaction: Transaction,
  imageId: number
): Promise<{ deletedPdi: ProductDefinitionImage; deletedImage: Image }> {
  log.debug("deleteProductDefinitionImageWithImage", { imageId });

  // 1. Delete from product_definition_images (subclass)
  const pdiRequest = transaction.request();
  pdiRequest.input("id", imageId);
  const pdiResult = await pdiRequest.query(
    "DELETE FROM dbo.product_definition_images OUTPUT DELETED.* WHERE image_id = @id"
  );

  if (pdiResult.recordset.length === 0) {
    throw error(404, `Product definition image with ID ${imageId} not found.`);
  }

  const deletedPdi = pdiResult.recordset[0] as ProductDefinitionImage;
  log.debug("Deleted product definition image (subclass)", { image_id: imageId });

  // 2. Delete from images (base class)
  const imageRequest = transaction.request();
  imageRequest.input("id", imageId);
  const imageResult = await imageRequest.query(
    "DELETE FROM dbo.images OUTPUT DELETED.* WHERE image_id = @id"
  );

  if (imageResult.recordset.length === 0) {
    throw error(500, `Image with ID ${imageId} not found after deleting ProductDefinitionImage. Data inconsistency!`);
  }

  const deletedImage = imageResult.recordset[0] as Image;
  log.debug("Deleted image (base class)", { image_id: imageId });

  return { deletedPdi, deletedImage };
}
