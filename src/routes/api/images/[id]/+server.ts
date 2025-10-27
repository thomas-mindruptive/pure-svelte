// src/routes/api/images/[id]/+server.ts

/**
 * @file Individual Image API Endpoints
 * @description Provides type-safe CRUD operations for a single image master data record.
 * Handles master data with Shopify integration fields.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { queryConfig } from "$lib/backendQueries/queryConfig";
import { buildUnexpectedError, validateIdUrlParam, validateAndUpdateEntity } from "$lib/backendQueries/genericEntityOperations";
import { type WhereCondition, ComparisonOperator, type QueryPayload, LogicalOperator } from "$lib/backendQueries/queryGrammar";
import { ImageSchema, type Image } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiSuccessResponse,
  QueryRequest,
  QuerySuccessResponse,
} from "$lib/api/api.types";

/**
 * GET /api/images/[id] - Get a single image record
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /images/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }
    const result = await db.request().input("id", id).query("SELECT * FROM dbo.images WHERE image_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Image with ID ${id} not found.`);
    }

    const image = result.recordset[0] as Image;

    const response: ApiSuccessResponse<{ image: Image }> = {
      success: true,
      message: "Image retrieved successfully.",
      data: { image },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning image data.`);
    return json(response);
  } catch (err: unknown) {
    if ((err as { status: number })?.status !== 404) {
      return buildUnexpectedError(err, info);
    }
    throw err;
  }
};

/**
 * POST /api/images/[id] - Get image with flexible fields
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /images/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as QueryRequest<Image>;
    const clientPayload = requestBody.payload;
    log.info(`[${operationId}] Parsed request body`, { clientPayload });

    const imageIdCondition: WhereCondition<Image> = {
      key: "image_id",
      whereCondOp: ComparisonOperator.EQUALS,
      val: id,
    };

    const securePayload: QueryPayload<Image> = {
      ...clientPayload,
      from: { table: "dbo.images", alias: "img" },
      where: clientPayload.where
        ? {
            whereCondOp: LogicalOperator.AND,
            conditions: [imageIdCondition, clientPayload.where],
          }
        : {
            whereCondOp: LogicalOperator.AND,
            conditions: [imageIdCondition],
          },
      limit: 1,
    };

    const { sql, parameters, metadata } = buildQuery(securePayload, queryConfig);
    const results = await executeQuery(sql, parameters);

    const response: QuerySuccessResponse<Image> = {
      success: true,
      message: "Image retrieved successfully.",
      data: {
        results: results as Partial<Image>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: "dbo.images",
          sql_generated: sql,
        },
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} record(s).`);
    return json(response);
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/images/[id] - Update an existing image
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] PUT /images/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    return validateAndUpdateEntity(ImageSchema, id, "image_id", requestData, "image");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/images/[id] - Delete image (no cascade - images should be safe to delete)
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /images/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const result = await db
      .request()
      .input("id", id)
      .query("DELETE FROM dbo.images OUTPUT DELETED.* WHERE image_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Image with ID ${id} not found.`);
    }

    const deletedImage = result.recordset[0] as Image;

    const response: ApiSuccessResponse<{ deleted_resource: Image }> = {
      success: true,
      message: `Image "${deletedImage.filename}" deleted successfully.`,
      data: { deleted_resource: deletedImage },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Image deleted.`);
    return json(response);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
