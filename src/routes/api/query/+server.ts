// src/routes/api/query/+server.ts

/**
 * @file Generic Query API Endpoint - FINAL ARCHITECTURE
 * @description This single, flexible endpoint handles all complex relational queries.
 * It validates the request and then delegates to the secure query builder.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { supplierQueryConfig } from "$lib/backendQueries/queryConfig";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import type { ApiErrorResponse, QueryRequest, PredefinedQueryRequest, QuerySuccessResponse } from "$lib/api/api.types";
import { v4 as uuidv4 } from "uuid";
import { isTableInBrandedSchemas } from "$lib/domain/domainTypes.utils";
import type z from "zod";

function isPredefinedQuery(body: unknown): body is PredefinedQueryRequest<z.ZodObject<any>> {
  return typeof body === "object" && body !== null && "namedQuery" in body && "payload" in body;
}

function isStandardQuery(body: unknown): body is QueryRequest<unknown> {
  return typeof body === "object" && body !== null && !("namedQuery" in body) && "payload" in body;
}

/**
 * POST /api/query
 * @description Executes a query based on the provided request structure.
 */
export const POST: RequestHandler = async (event) => {
  log.infoHeader("POST /api/query");
  const operationId = uuidv4();
  log.info(`1 - [${operationId}] POST /query: FN_START`);

  try {
    const requestBody = await event.request.json();

    if (isPredefinedQuery(requestBody)) {
      const { namedQuery, payload } = requestBody;
      log.info(`[${operationId}] Handling PredefinedQueryRequest`, { namedQuery });

      if (!(namedQuery in (supplierQueryConfig.joinConfigurations || {}))) {
        const errRes: ApiErrorResponse = {
          success: false,
          message: `Predefined query '${namedQuery}' is not allowed.`,
          status_code: 403,
          error_code: "FORBIDDEN",
          meta: { timestamp: new Date().toISOString() },
        };
        return json(errRes, { status: 403 });
      }

      const { sql, parameters, metadata } = buildQuery(payload, supplierQueryConfig, namedQuery);
      const results = await executeQuery(sql, parameters);

      log.debug(`[${operationId}] Executed SQL: ${sql} with parameters: ${JSON.stringify(parameters)}`, { result: results });

      const response: QuerySuccessResponse<unknown> = {
        success: true,
        message: "Predefined query executed successfully.",
        data: {
          results,
          meta: {
            retrieved_at: new Date().toISOString(),
            result_count: results.length,
            columns_selected: metadata.selectColumns,
            has_joins: metadata.hasJoins,
            has_where: metadata.hasWhere,
            parameter_count: metadata.parameterCount,
            table_fixed: metadata.tableFixed,
            sql_generated: sql,
          },
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} results.`);
      return json(response);
    }

    if (isStandardQuery(requestBody)) {
      const { payload } = requestBody;
      const fromClause = payload.from;
      log.info(`[${operationId}] Handling Standard QueryRequest`, { fromTable: fromClause });

      if (!fromClause) {
        const errRes: ApiErrorResponse = {
          success: false,
          message: "The 'from' field is required for a standard query.",
          status_code: 400,
          error_code: "BAD_REQUEST",
          meta: { timestamp: new Date().toISOString() },
        };
        return json(errRes, { status: 400 });
      }

      if (!isTableInBrandedSchemas(fromClause.table)) {
        const errRes: ApiErrorResponse = {
          success: false,
          message: `Table '${fromClause.table}' is not defined in any branded schema.`,
          status_code: 403,
          error_code: "FORBIDDEN",
          meta: { timestamp: new Date().toISOString() },
        };
        return json(errRes, { status: 403 });
      }

      const { sql, parameters, metadata } = buildQuery(payload, supplierQueryConfig);
      const results = await executeQuery(sql, parameters);

      log.debug(`[${operationId}] Executed SQL: ${sql} with parameters: ${JSON.stringify(parameters)}`, results);

      const response: QuerySuccessResponse<unknown> = {
        success: true,
        message: "Standard query executed successfully.",
        data: {
          results,
          meta: {
            // KORREKTES MAPPING der Property-Namen
            retrieved_at: new Date().toISOString(),
            result_count: results.length,
            columns_selected: metadata.selectColumns,
            has_joins: metadata.hasJoins,
            has_where: metadata.hasWhere,
            parameter_count: metadata.parameterCount,
            table_fixed: metadata.tableFixed,
            sql_generated: sql,
          },
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} results.`);
      return json(response);
    }

    const errRes: ApiErrorResponse = {
      success: false,
      message: "Invalid request body structure. Must be a PredefinedQueryRequest or a QueryRequest.",
      status_code: 400,
      error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errRes, { status: 400 });
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during generic query execution.`, { error: err });
    throw error(status, message);
  }
};
