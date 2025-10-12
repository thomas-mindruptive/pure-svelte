// src/routes/api/offerings/+server.ts

/**
 * @file Offerings List API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/offerings - Provides type-safe, paginated, and filterable
 * access to the wholesaler_item_offerings list. It strictly follows the "Secure Entity Endpoint"
 * pattern by enforcing the database table name on the server.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { queryConfig } from "$lib/backendQueries/queryConfig";
import { buildUnexpectedError } from "$lib/backendQueries/genericEntityOperations";
import type { WholesalerItemOffering } from "$lib/domain/domainTypes";
import type {
  QueryRequest,
  QuerySuccessResponse,
  ApiErrorResponse,
} from "$lib/api/api.types";
import { v4 as uuidv4 } from "uuid";


/**
 * POST /api/offerings
 * @description Fetches a list of offerings based on a client-provided query payload.
 * This endpoint provides access to wholesaler item offerings with optional filtering,
 * sorting, and pagination capabilities.
 */
export const POST: RequestHandler = async (event) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /offerings: FN_START`);

  try {
    // 1. Expect the standard QueryRequest envelope and extract the payload.
    const requestBody = (await event.request.json()) as QueryRequest<WholesalerItemOffering>;
    const clientPayload = requestBody.payload;

    if (!clientPayload) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Request body must be a valid QueryRequest object containing a `payload`.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Malformed request body.`, { body: requestBody });
      return json(errRes, { status: 400 });
    }

    log.info(`[${operationId}] Parsed request payload`, {
      select: clientPayload.select,
      where: clientPayload.where,
      limit: clientPayload.limit,
      hasOrderBy: !!clientPayload.orderBy,
    });

    // 3. Build and execute the query.
    const { sql, parameters, metadata } = buildQuery(clientPayload, queryConfig, undefined, {
      table: "dbo.wholesaler_item_offerings",
      alias: "wio",
    });
    const results = await executeQuery(sql, parameters);

    // 4. Format the response using the standard `QuerySuccessResponse` type.
    const response: QuerySuccessResponse<WholesalerItemOffering> = {
      success: true,
      message: "Offerings retrieved successfully.",
      data: {
        results: results as Partial<WholesalerItemOffering>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: "dbo.wholesaler_item_offerings",
          sql_generated: sql.replace(/\s+/g, " ").trim(),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} offerings.`, {
      hasFilter: metadata.hasWhere,
      hasJoins: metadata.hasJoins,
      executionTime: metadata.parameterCount,
    });

    return json(response);
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};
