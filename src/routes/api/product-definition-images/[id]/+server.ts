// src/routes/api/product-definition-images/[id]/+server.ts

/**
 * @file Individual Product Definition Image API Endpoints (OOP Inheritance Pattern)
 * @description CRUD operations for ProductDefinitionImage (which extends Image).
 * Uses image_id as the PK for both tables (inheritance pattern).
 * DELETE removes from BOTH tables atomically.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateIdUrlParam } from "$lib/backendQueries/genericEntityOperations";
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";
import {
  loadProductDefinitionImageWithImageById,
  updateProductDefinitionImageWithImage,
  loadProductDefinitionImagesWithImage,
  deleteProductDefinitionImageWithImage,
} from "$lib/backendQueries/entityOperations/image";
import { checkProductDefinitionImageDependencies } from "$lib/backendQueries/dependencyChecks";
import type { ProductDefinitionImage_Image } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import { ComparisonOperator, LogicalOperator, type QueryPayload } from "$lib/backendQueries/queryGrammar";

import type {
  ApiSuccessResponse,
  QueryRequest,
  QuerySuccessResponse,
  DeleteRequest,
  DeleteSuccessResponse,
  DeleteConflictResponse,
} from "$lib/api/api.types";

/**
 * GET /api/product-definition-images/[id]
 * Get a single ProductDefinitionImage with nested Image data by image_id
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/product-definition-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /product-definition-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    await tw.begin();
    const productDefinitionImage = await loadProductDefinitionImageWithImageById(tw.trans, id);
    await tw.commit();

    const response: ApiSuccessResponse<{ productDefinitionImage: ProductDefinitionImage_Image }> = {
      success: true,
      message: "Product definition image retrieved successfully.",
      data: { productDefinitionImage },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning product definition image data.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    if ((err as { status: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};

/**
 * POST /api/product-definition-images/[id]
 * Get ProductDefinitionImage with flexible QueryPayload
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/product-definition-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /product-definition-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as QueryRequest<ProductDefinitionImage_Image>;
    const clientPayload = requestBody.payload;
    log.info(`[${operationId}] Parsed request body`, { clientPayload });

    // Build WHERE condition for image_id (PK)
    const idCondition = {
      key: "pdi.image_id" as keyof ProductDefinitionImage_Image,
      whereCondOp: ComparisonOperator.EQUALS,
      val: id,
    };

    // Merge with client WHERE if provided
    const mergedPayload: Partial<QueryPayload<ProductDefinitionImage_Image>> = {
      ...clientPayload,
      where: clientPayload?.where
        ? {
            whereCondOp: LogicalOperator.AND,
            conditions: [idCondition, clientPayload.where],
          }
        : idCondition,
      limit: 1,
    };

    await tw.begin();
    const jsonString = await loadProductDefinitionImagesWithImage(tw.trans, mergedPayload);
    await tw.commit();

    const results = JSON.parse(jsonString);

    const response: QuerySuccessResponse<ProductDefinitionImage_Image> = {
      success: true,
      message: "Product definition image retrieved successfully.",
      data: {
        results: results as Partial<ProductDefinitionImage_Image>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: ['all'],
          has_joins: true,
          has_where: true,
          parameter_count: 0,
          table_fixed: "dbo.product_definition_images + dbo.images (OOP inheritance)",
          sql_generated: "(generated via entityOperations/image.ts)",
        },
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} record(s).`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/product-definition-images/[id]
 * Update ProductDefinitionImage with nested Image data
 * Uses image_id as PK for both tables (OOP inheritance)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/product-definition-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] PUT /product-definition-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    // Ensure image_id is in the data (it's the PK for both tables)
    requestData.image_id = id;

    await tw.begin();
    const updatedRecord = await updateProductDefinitionImageWithImage(tw.trans, requestData);
    await tw.commit();

    const response: ApiSuccessResponse<{ productDefinitionImage: ProductDefinitionImage_Image }> = {
      success: true,
      message: "Product definition image updated successfully.",
      data: { productDefinitionImage: updatedRecord },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Product definition image updated.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/product-definition-images/[id]
 * Delete ProductDefinitionImage completely (OOP inheritance pattern).
 * Deletes from BOTH tables atomically:
 * - product_definition_images (subclass)
 * - images (base class)
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/product-definition-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /product-definition-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as DeleteRequest<ProductDefinitionImage_Image>;
    const { cascade = false, forceCascade = false } = requestBody;
    log.info(`[${operationId}] Delete request with cascade=${cascade}, forceCascade=${forceCascade}`);

    await tw.begin();
    log.info(`[${operationId}] Transaction started for product definition image deletion.`);

    // === CHECK DEPENDENCIES =====================================================================

    const { hard, soft } = await checkProductDefinitionImageDependencies(id, tw.trans);
    log.info(`Product definition image has dependent objects:`, { hard, soft });

    if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
      await tw.rollback();
      const conflictResponse: DeleteConflictResponse<string[]> = {
        success: false,
        message: "Cannot delete product definition image: It is still in use by other entities.",
        status_code: 409,
        error_code: "DEPENDENCY_CONFLICT",
        dependencies: { hard, soft },
        cascade_available: hard.length === 0,
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies: { hard, soft } });
      return json(conflictResponse, { status: 409 });
    }

    // === DELETE =================================================================================

    const dependenciesCleared = hard.length + soft.length;
    log.info(`[${operationId}] Proceeding with deletion. Dependencies to clear: ${dependenciesCleared}`);

    const { deletedPdi, deletedImage } = await deleteProductDefinitionImageWithImage(tw.trans, id);
    await tw.commit();

    const deletedResource: ProductDefinitionImage_Image = {
      ...deletedPdi,
      image: deletedImage,
    };

    const response: DeleteSuccessResponse<ProductDefinitionImage_Image> = {
      success: true,
      message: `Product definition image (ID: ${id}) deleted completely from both tables (OOP inheritance).`,
      data: {
        deleted_resource: deletedResource,
        cascade_performed: cascade || forceCascade,
        dependencies_cleared: dependenciesCleared,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Product definition image and image deleted.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
