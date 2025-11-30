// File: src/lib/backendQueries/entityOperations/image.ts

import { validateEntityBySchema, genColumnsForJsonPath, genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import {
  ProductDefinitionImage_Image_Schema,
  ImageForCreateSchema,
  ProductDefinitionImageForCreateSchema,
  ImageSchema,
  ProductDefinitionImage_Schema,
  OfferingImage_Image_Schema,
  OfferingImageForCreateSchema,
  OfferingImage_Schema,
  type ProductDefinitionImage_Image,
  type OfferingImage_Image,
  type Image,
  type ProductDefinitionImage,
  type OfferingImage,
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
 * Loads images with their associated image data using QueryPayload.
 * Server enforces the JOIN, client can specify WHERE, ORDER BY, LIMIT, etc.
 *
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @returns JSON string with array of nested objects
 */
export async function loadImages(
  transaction: Transaction,
  payload?: Partial<QueryPayload<Image>>
): Promise<Image[]> {
  log.debug("loadImages", { clientPayload: payload });

  // 1. Define fixed base query with JOIN
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

// =============================================================================================
// GENERIC IMAGE OPERATIONS (Works for ProductDefinitionImage AND OfferingImage)
// =============================================================================================

/**
 * Generic update for image subclasses (ProductDefinitionImage, OfferingImage).
 * Updates both Image and subclass records atomically.
 *
 * @param transaction - Active database transaction
 * @param fullSchema - Complete nested schema (e.g., ProductDefinitionImage_Image_Schema)
 * @param subclassSchema - Subclass-only schema (e.g., ProductDefinitionImage_Schema) with __brandMeta
 * @param data - Unvalidated nested object from client (must include image_id)
 * @returns Complete updated nested object
 */
async function updateImageWithSubclass<T>(
  transaction: Transaction,
  fullSchema: any,
  subclassSchema: any,
  data: unknown
): Promise<T> {
  // Extract metadata from schema
  const meta = subclassSchema.__brandMeta;
  if (!meta?.tableName) {
    throw new Error(`Schema must have __brandMeta with tableName`);
  }
  const { tableName } = meta;

  log.debug(`updateImageWithSubclass (${tableName}) - validating`);

  // 1. Validate complete nested object (partial updates allowed)
  const schemaForUpdate = fullSchema.partial().extend({
    image: ImageSchema.partial(),
  });

  const validation = validateEntityBySchema(schemaForUpdate, data);

  if (!validation.isValid) {
    const errorResponse = {
      success: false,
      message: `Validation failed for ${tableName} update.`,
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

  // 3. Update subclass if data provided
  const subclassData: any = { ...sanitized };
  delete subclassData.image; // Remove nested object

  if (Object.keys(subclassData).length > 1) {
    // more than just image_id
    log.debug(`Updating ${tableName} (subclass)`, { image_id: sanitized.image_id });
    await updateRecordWithTransaction(
      subclassSchema,
      sanitized.image_id,
      "image_id",
      subclassData,
      transaction
    );
  }

  // 4. Load and return complete nested object
  return await loadImageWithSubclassById(transaction, fullSchema, subclassSchema, sanitized.image_id);
}

/**
 * Generic load for image subclasses with QueryPayload support.
 * Server enforces the JOIN, client can specify WHERE, ORDER BY, LIMIT, etc.
 *
 * @param transaction - Active database transaction
 * @param fullSchema - Complete nested schema for JSON PATH generation
 * @param subclassSchema - Subclass schema (e.g., OfferingImage_Schema) with __brandMeta
 * @param clientPayload - Optional QueryPayload from client
 * @returns JSON string with array of nested objects
 */
async function loadImagesWithSubclass<T>(
  transaction: Transaction,
  fullSchema: any,
  subclassSchema: any,
  clientPayload?: Partial<QueryPayload<any>>
): Promise<string> {
  // Extract table metadata from schema's __brandMeta
  const meta = subclassSchema.__brandMeta;
  if (!meta?.tableName || !meta?.alias || !meta?.dbSchema) {
    throw new Error(`Schema must have __brandMeta with tableName, alias, and dbSchema`);
  }
  const { tableName, alias, dbSchema } = meta;
  const fullTableName = `${dbSchema}.${tableName}`;

  log.debug(`loadImagesWithSubclass (${tableName})`, { clientPayload });

  // 1. Define fixed base query with JOIN
  // Type assertions needed: Runtime values from __brandMeta vs compile-time literal types
  const basePayload: QueryPayload<any> = {
    from: { table: fullTableName as any, alias: alias as any },
    joins: [
      {
        type: JoinType.INNER,
        table: "dbo.images",
        alias: "img",
        on: {
          joinCondOp: LogicalOperator.AND,
          conditions: [
            { columnA: `${alias}.image_id` as any, op: ComparisonOperator.EQUALS, columnB: "img.image_id" }
          ]
        }
      }
    ],
    select: genColumnsForJsonPath(fullSchema, true) as any,
    orderBy: [{ key: `${alias}.sort_order` as any, direction: "asc" }]
  };

  // 2. Merge client payload (WHERE, LIMIT, custom ORDER BY override base)
  const mergedPayload: QueryPayload<any> = {
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

  log.debug(`${tableName} loaded`, { resultLength: jsonString?.length });

  return jsonString || "[]";
}

/**
 * Generic load single image by ID.
 *
 * @param transaction - Active database transaction
 * @param fullSchema - Complete nested schema
 * @param subclassSchema - Subclass schema with __brandMeta
 * @param imageId - The image_id (PK for both tables)
 * @returns Nested object with image data
 */
async function loadImageWithSubclassById<T>(
  transaction: Transaction,
  fullSchema: any,
  subclassSchema: any,
  imageId: number
): Promise<T> {
  // Extract metadata from schema
  const meta = subclassSchema.__brandMeta;
  if (!meta?.alias) {
    throw new Error(`Schema must have __brandMeta with alias`);
  }
  const { alias } = meta;

  log.debug(`loadImageWithSubclassById (${meta.tableName})`, { imageId });

  // Use the flexible load function with a WHERE condition
  const whereCondition = {
    key: `${alias}.image_id` as any,
    whereCondOp: ComparisonOperator.EQUALS,
    val: imageId,
  };

  const jsonString = await loadImagesWithSubclass(transaction, fullSchema, subclassSchema, {
    where: whereCondition,
    limit: 1,
  });

  const parsedData = JSON.parse(jsonString);

  if (!parsedData || parsedData.length === 0) {
    throw error(404, `Image from ${meta.tableName} with ID ${imageId} not found.`);
  }

  return parsedData[0] as T;
}

/**
 * Generic delete for image subclasses (OOP inheritance pattern).
 * Deletes from BOTH tables atomically.
 *
 * @param transaction - Active database transaction
 * @param subclassSchema - Subclass schema with __brandMeta
 * @param imageId - The image_id (PK for both tables)
 * @returns Deleted records from both tables
 */
async function deleteImageWithSubclass<T>(
  transaction: Transaction,
  subclassSchema: any,
  imageId: number
): Promise<{ deletedSubclass: T; deletedImage: Image }> {
  // Extract metadata from schema
  const meta = subclassSchema.__brandMeta;
  if (!meta?.tableName) {
    throw new Error(`Schema must have __brandMeta with tableName`);
  }
  const { tableName } = meta;

  log.debug(`deleteImageWithSubclass (${tableName})`, { imageId });

  // 1. Delete from subclass table
  const subclassRequest = transaction.request();
  subclassRequest.input("id", imageId);
  const subclassResult = await subclassRequest.query(
    `DELETE FROM dbo.${tableName} OUTPUT DELETED.* WHERE image_id = @id`
  );

  if (subclassResult.recordset.length === 0) {
    throw error(404, `Image from ${tableName} with ID ${imageId} not found.`);
  }

  const deletedSubclass = subclassResult.recordset[0] as T;
  log.debug(`Deleted ${tableName} (subclass)`, { image_id: imageId });

  // 2. Delete from images (base class)
  const imageRequest = transaction.request();
  imageRequest.input("id", imageId);
  const imageResult = await imageRequest.query(
    "DELETE FROM dbo.images OUTPUT DELETED.* WHERE image_id = @id"
  );

  if (imageResult.recordset.length === 0) {
    throw error(500, `Image with ID ${imageId} not found after deleting ${tableName}. Data inconsistency!`);
  }

  const deletedImage = imageResult.recordset[0] as Image;
  log.debug("Deleted image (base class)", { image_id: imageId });

  return { deletedSubclass, deletedImage };
}

// =============================================================================================
// OFFERING IMAGE OPERATIONS (Uses Generic Functions)
// =============================================================================================

/**
 * Inserts a new OfferingImage (which extends Image using OOP inheritance).
 * Validates the complete nested object, then inserts both records atomically.
 * The same image_id is used as PK in both tables (inheritance pattern).
 *
 * NOTE: Unlike ProductDefinitionImage, OfferingImage does NOT inherit values from offering.
 *
 * @param transaction - Active database transaction
 * @param data - Unvalidated nested object from client
 * @returns Complete nested object with generated image_id
 */
export async function insertOfferingImageWithImage(
  transaction: Transaction,
  data: unknown
): Promise<OfferingImage_Image> {
  log.debug("insertOfferingImageWithImage - validating");

  // 1. Validate complete nested object
  const schemaForCreate = OfferingImage_Image_Schema.omit({
    image_id: true,  // Will be auto-generated
    created_at: true,
  }).extend({
    image: ImageForCreateSchema,
  });

  const validation = validateEntityBySchema(schemaForCreate, data);

  if (!validation.isValid) {
    const errorResponse = {
      success: false,
      message: "Validation failed for offering image with image.",
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

    const loadRequest = transaction.request();
    loadRequest.input('id', existingImageId);
    const loadResult = await loadRequest.query('SELECT * FROM dbo.images WHERE image_id = @id');
    insertedImage = loadResult.recordset[0] as Image;
  } else {
    // Insert new Image (base class) with enriched metadata
    log.debug("Inserting new image", { filename: enrichedImageData.filename });
    insertedImage = (await insertRecordWithTransaction(ImageForCreateSchema, enrichedImageData as any, transaction)) as Image;
  }

  // 4. Insert OfferingImage (subclass) with THE SAME image_id (OOP inheritance)
  // NOTE: No inheritance from offering - use provided values as-is
  const oiData = {
    image_id: insertedImage.image_id,  // ← Same ID as parent (inheritance pattern)
    offering_id: sanitized.offering_id,
    // Variant Matching Fields - use provided values directly
    material_id: sanitized.material_id,
    form_id: sanitized.form_id,
    surface_finish_id: sanitized.surface_finish_id,
    construction_type_id: sanitized.construction_type_id,
    // Image Metadata
    size_range: sanitized.size_range,
    quality_grade: sanitized.quality_grade,
    color_variant: sanitized.color_variant,
    image_type: sanitized.image_type,
    sort_order: sanitized.sort_order,
    is_primary: sanitized.is_primary,
  };

  log.debug("Inserting offering image with inherited ID", {
    offering_id: oiData.offering_id,
    image_id: oiData.image_id,
  });

  const insertedOi = (await insertRecordWithTransaction(
    OfferingImageForCreateSchema,
    oiData,
    transaction
  )) as OfferingImage;

  // 5. Return nested structure
  return {
    ...insertedOi,
    image: insertedImage,
  } as OfferingImage_Image;
}

/**
 * Updates both Image and OfferingImage records (OOP inheritance).
 * Uses generic update function.
 */
export async function updateOfferingImageWithImage(
  transaction: Transaction,
  data: unknown
): Promise<OfferingImage_Image> {
  return updateImageWithSubclass<OfferingImage_Image>(
    transaction,
    OfferingImage_Image_Schema,
    OfferingImage_Schema,
    data
  );
}

/**
 * Loads a single OfferingImage with its associated Image data by image_id.
 */
export async function loadOfferingImageWithImageById(
  transaction: Transaction,
  imageId: number
): Promise<OfferingImage_Image> {
  return loadImageWithSubclassById<OfferingImage_Image>(
    transaction,
    OfferingImage_Image_Schema,
    OfferingImage_Schema,
    imageId
  );
}

/**
 * Loads offering images with their associated image data using QueryPayload.
 */
export async function loadOfferingImagesWithImage(
  transaction: Transaction,
  clientPayload?: Partial<QueryPayload<OfferingImage_Image>>
): Promise<string> {
  return loadImagesWithSubclass<OfferingImage_Image>(
    transaction,
    OfferingImage_Image_Schema,
    OfferingImage_Schema,
    clientPayload
  );
}

/**
 * Deletes an OfferingImage completely (OOP inheritance pattern).
 */
export async function deleteOfferingImageWithImage(
  transaction: Transaction,
  imageId: number
): Promise<{ deletedOi: OfferingImage; deletedImage: Image }> {
  const result = await deleteImageWithSubclass<OfferingImage>(
    transaction,
    OfferingImage_Schema,
    imageId
  );
  return { deletedOi: result.deletedSubclass, deletedImage: result.deletedImage };
}
