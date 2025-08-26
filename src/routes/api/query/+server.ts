// src/routes/api/query/+server.ts

/**
 * @file Generic Query API Endpoint - FINAL ARCHITECTURE
 * @description This single, flexible endpoint handles all complex relational queries.
 * It validates the request and then delegates to the secure query builder.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { ApiErrorResponse, QueryRequest, PredefinedQueryRequest, QuerySuccessResponse } from '$lib/api/types/common';
import { v4 as uuidv4 } from 'uuid';

function isPredefinedQuery(body: unknown): body is PredefinedQueryRequest {
	return typeof body === 'object' && body !== null && 'namedQuery' in body && 'payload' in body;
}

function isStandardQuery(body: unknown): body is QueryRequest<unknown> {
	return typeof body === 'object' && body !== null && !('namedQuery' in body) && 'payload' in body;
}


/**
 * POST /api/query
 * @description Executes a query based on the provided request structure.
 */
export const POST: RequestHandler = async (event) => {
	const operationId = uuidv4();
	log.info(`[${operationId}] POST /query: FN_START`);

	try {
		const requestBody = await event.request.json();

		if (isPredefinedQuery(requestBody)) {
			const { namedQuery, payload } = requestBody;
			log.info(`[${operationId}] Handling PredefinedQueryRequest`, { namedQuery });

			if (!(namedQuery in (supplierQueryConfig.joinConfigurations || {}))) {
				const errRes: ApiErrorResponse = {
					success: false, message: `Predefined query '${namedQuery}' is not allowed.`,
					status_code: 403, error_code: 'FORBIDDEN', meta: { timestamp: new Date().toISOString() }
				};
				return json(errRes, { status: 403 });
			}
			
			const { sql, parameters, metadata } = buildQuery(payload, supplierQueryConfig, namedQuery);
			const results = await executeQuery(sql, parameters);
			
			const response: QuerySuccessResponse<unknown> = {
				success: true,
				message: 'Predefined query executed successfully.',
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
						sql_generated: sql 
					} 
				},
				meta: { timestamp: new Date().toISOString() }
			};
			log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} results.`);
			return json(response);
		}

		if (isStandardQuery(requestBody)) {
			const { payload } = requestBody;
			const fromTable = payload.from;
			log.info(`[${operationId}] Handling Standard QueryRequest`, { fromTable });

			if (!fromTable) {
				const errRes: ApiErrorResponse = {
					success: false, message: "The 'from' field is required for a standard query.",
					status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() }
				};
				return json(errRes, { status: 400 });
			}
			
			if (!(fromTable in supplierQueryConfig.allowedTables)) {
				const errRes: ApiErrorResponse = {
					success: false, message: `Table '${fromTable}' is not whitelisted for querying.`,
					status_code: 403, error_code: 'FORBIDDEN', meta: { timestamp: new Date().toISOString() }
				};
				return json(errRes, { status: 403 });
			}
			
			const { sql, parameters, metadata } = buildQuery(payload, supplierQueryConfig);
			const results = await executeQuery(sql, parameters);

			const response: QuerySuccessResponse<unknown> = {
				success: true,
				message: 'Standard query executed successfully.',
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
						sql_generated: sql 
					}
				},
				meta: { timestamp: new Date().toISOString() }
			};
			log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} results.`);
			return json(response);
		}

		const errRes: ApiErrorResponse = {
			success: false, message: 'Invalid request body structure. Must be a PredefinedQueryRequest or a QueryRequest.',
			status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() }
		};
		return json(errRes, { status: 400 });

	} catch (err: unknown) {
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during generic query execution.`, { error: err });
		throw error(status, message);
	}
};