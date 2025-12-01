// src/routes/api/offering-images/[id]/+server.ts

/**
 * @file Individual Offering Image API Endpoints (OOP Inheritance Pattern)
 * @description CRUD operations for OfferingImage (which extends Image).
 * Uses image_id as the PK for both tables (inheritance pattern).
 * DELETE removes from BOTH tables atomically.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateIdUrlParam } from "$lib/backendQueries/genericEntityOperations";
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";
import {
  loadImageById,
  updateImage,
  loadImages,
  deleteImage,
} from "$lib/backendQueries/entityOperations/image";
import { checkImageDependencies } from "$lib/backendQueries/dependencyChecks";
import type { Image, OfferingImage_Image } from "$lib/domain/domainTypes";
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
 * GET /api/offering-images/[id]
 * Get a single OfferingImage with nested Image data by image_id
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    await tw.begin();
    const offeringImage = await loadImageById(tw.trans, id);
    await tw.commit();

    if (!offeringImage) {
      throw error(404, `Offering image with ID ${id} not found.`);
    }

    const response: ApiSuccessResponse<{ offeringImage: Image }> = {
      success: true,
      message: "Offering image retrieved successfully.",
      data: { offeringImage },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning offering image data.`);
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
 * POST /api/offering-images/[id]
 * Get OfferingImage with flexible QueryPayload
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as QueryRequest<Image>;
    const clientPayload = requestBody.payload;
    log.info(`[${operationId}] Parsed request body`, { clientPayload });

    // Build WHERE condition for image_id (PK)
    const idCondition = {
      key: "img.image_id" as keyof Image,
      whereCondOp: ComparisonOperator.EQUALS,
      val: id,
    };

    // Merge with client WHERE if provided
    const mergedPayload: Partial<QueryPayload<Image>> = {
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
    const images = await loadImages(tw.trans, mergedPayload);
    await tw.commit();

    const response: QuerySuccessResponse<Image> = {
      success: true,
      message: "Offering image retrieved successfully.",
      data: {
        results: images as Partial<Image>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: images.length,
          columns_selected: ['all'],
          has_joins: false,
          has_where: true,
          parameter_count: 0,
          table_fixed: "dbo.images",
          sql_generated: "(generated via entityOperations/image.ts)",
        },
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${images.length} record(s).`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/offering-images/[id]
 * Update OfferingImage with nested Image data
 * Uses image_id as PK for both tables (OOP inheritance)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] PUT /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    await tw.begin();
    const updatedRecord = await updateImage(tw.trans, id, requestData);
    await tw.commit();

    const response: ApiSuccessResponse<{ offeringImage: Image }> = {
      success: true,
      message: "Offering image updated successfully.",
      data: { offeringImage: updatedRecord },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Offering image updated.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/offering-images/[id]
 * Delete OfferingImage completely (OOP inheritance pattern).
 * Deletes from BOTH tables atomically:
 * - offering_images (subclass)
 * - images (base class)
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as DeleteRequest<OfferingImage_Image>;
    const { cascade = false, forceCascade = false } = requestBody;
    log.info(`[${operationId}] Delete request with cascade=${cascade}, forceCascade=${forceCascade}`);

    await tw.begin();
    log.info(`[${operationId}] Transaction started for offering image deletion.`);

    // === CHECK DEPENDENCIES =====================================================================

    const { hard, soft } = await checkImageDependencies(id, tw.trans);
    log.info(`Image has dependent objects:`, { hard, soft });

    if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
      await tw.rollback();
      const conflictResponse: DeleteConflictResponse<string[]> = {
        success: false,
        message: "Cannot delete image: It is still in use by other entities.",
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

    const deletedImage = await deleteImage(tw.trans, id);
    await tw.commit();

    const response: DeleteSuccessResponse<Image> = {
      success: true,
      message: `Image (ID: ${id}) deleted successfully.`,
      data: {
        deleted_resource: deletedImage,
        cascade_performed: cascade || forceCascade,
        dependencies_cleared: dependenciesCleared,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Offering image and image deleted.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
