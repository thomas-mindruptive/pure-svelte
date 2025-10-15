// src/routes/api/product-definitions/+server.ts

/**
 * @file Product Definitions List API Endpoint
 * @description Provides read-only access to the master data of product definitions.
 * Follows the "Secure Entity Endpoint" pattern by enforcing the table name on the server.
 */

import type { QueryRequest, QuerySuccessResponse } from "$lib/api/api.types";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { queryConfig } from "$lib/backendQueries/queryConfig";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import { ProductDefinitionSchema, type ProductDefinition } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/product-definitions
 * @description Fetches a list of product definitions based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
  log.infoHeader("POST /api/product-definitions");
  const operationId = uuidv4();
  log.info(`[${operationId}] POST /product-definitions: FN_START`);

  const DEFAULT_PRODUCT_DEFINITION_QUERY: QueryPayload<ProductDefinition> = {
    from: { table: "dbo.product_definitions", alias: "pd" },
    select: genTypedQualifiedColumns(ProductDefinitionSchema), //["product_def_id", "title", "description", "category_id"],
    orderBy: [{ key: "title", direction: "asc" }],
  };

  try {
    const requestBody = (await event.request.json()) as QueryRequest<ProductDefinition>;
    let payload = requestBody.payload;

    if (payload && Object.keys(payload).length > 0) {
      log.info(`[${operationId}] Client payload available`, {
        select: payload.select,
        where: payload.where,
        limit: payload.limit,
      });
      payload = { ...DEFAULT_PRODUCT_DEFINITION_QUERY, ...payload };
    } else {
      log.info(`No client payload received => Using DEFAULT_PRODUCT_DEFINITION_QUERY`, DEFAULT_PRODUCT_DEFINITION_QUERY);
      payload = DEFAULT_PRODUCT_DEFINITION_QUERY;
    }

    // Build and execute the query using the secure, generic query builder.
    const { sql, parameters, metadata } = buildQuery(payload, queryConfig, undefined, { table: "dbo.product_definitions", alias: "pd" });
    const results = await executeQuery(sql, parameters);

    // Format the response using the standard `QuerySuccessResponse` type.
    const response: QuerySuccessResponse<ProductDefinition> = {
      success: true,
      message: "Product definitions retrieved successfully.",
      data: {
        results: results as Partial<ProductDefinition>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: "dbo.product_definitions",
          sql_generated: sql.replace(/\s+/g, " ").trim(),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
    log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} product definitions.`);
    return json(response);
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during product definition query.`, { error: err });
    throw error(status, message);
  }
};
