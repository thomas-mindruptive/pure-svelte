// src/routes/api/query/+server.ts

/**
 * @file Generic Query API Endpoint - FINAL ARCHITECTURE
 * @description This single, flexible endpoint handles all complex relational queries.
 * It intelligently distinguishes between a direct `QueryRequest` and a secure
 * `PredefinedQueryRequest` to provide both flexibility and security.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { ApiErrorResponse, QueryRequest, PredefinedQueryRequest, QuerySuccessResponse } from '$lib/api/types/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * Type guard to check if a request body is a PredefinedQueryRequest.
 * @param body The parsed JSON body of the request.
 * @returns boolean
 */
function isPredefinedQuery(body: unknown): body is PredefinedQueryRequest {
	return (
		typeof body === 'object' && body !== null && 'namedQuery' in body && 'payload' in body
	);
}

/**
 * Type guard to check if a request body is a standard QueryRequest.
 * @param body The parsed JSON body of the request.
 * @returns boolean
 */
function isStandardQuery(body: unknown): body is QueryRequest {
	return (
		typeof body === 'object' && body !== null && !('namedQuery' in body) && 'payload' in body
	);
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
		let securePayload: QueryPayload;
		let queryType: 'predefined' | 'standard';

		// 1. Determine the type of query request and build the secure payload.
		if (isPredefinedQuery(requestBody)) {
			// --- HANDLE PREDEFINED QUERY ---
			queryType = 'predefined';
			const { namedQuery, payload: clientPayload } = requestBody;
			log.info(`[${operationId}] Handling PredefinedQueryRequest`, { namedQuery });

			// SECURITY: Validate that the named query exists in our config.
			if (!supplierQueryConfig.joinConfigurations?.[namedQuery]) {
				const errRes: ApiErrorResponse = { success: false, message: `Predefined query '${namedQuery}' is not allowed or does not exist.`, status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
				log.warn(`[${operationId}] FN_FAILURE: Invalid namedQuery requested.`, { namedQuery });
				return json(errRes, { status: 400 });
			}
			
			// Build the payload using the named query as the 'from' source.
			// The QueryBuilder will resolve this to the correct JOINs.
			securePayload = {
				...clientPayload,
				from: namedQuery // Use the safe, predefined query name.
			};

		} else if (isStandardQuery(requestBody)) {
			// --- HANDLE STANDARD QUERY ---
			queryType = 'standard';
			const { payload: clientPayload } = requestBody;
			const fromTable = clientPayload.from;
			log.info(`[${operationId}] Handling QueryRequest`, { fromTable });

			if (!fromTable) {
				const errRes: ApiErrorResponse = { success: false, message: "The 'from' field is required in the payload for a standard query request.", status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
				log.warn(`[${operationId}] FN_FAILURE: 'from' field is missing.`);
				return json(errRes, { status: 400 });
			}
			
			// SECURITY: Validate that the requested table is in our whitelist.
			if (!supplierQueryConfig.allowedTables[fromTable]) {
				const errRes: ApiErrorResponse = { success: false, message: `Table '${fromTable}' is not whitelisted for querying.`, status_code: 403, error_code: 'FORBIDDEN', meta: { timestamp: new Date().toISOString() } };
				log.warn(`[${operationId}] FN_FAILURE: Forbidden table requested.`, { fromTable });
				return json(errRes, { status: 403 });
			}
			
			securePayload = clientPayload;

		} else {
			// --- HANDLE INVALID REQUEST STRUCTURE ---
			const errRes: ApiErrorResponse = { success: false, message: 'Invalid request body. Must be a QueryRequest or PredefinedQueryRequest.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
			log.warn(`[${operationId}] FN_FAILURE: Malformed request body.`);
			return json(errRes, { status: 400 });
		}

		// 2. Build and execute the validated query.
		const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
		const results = await executeQuery(sql, parameters);

		// 3. Format the successful response.
		const response: QuerySuccessResponse<unknown> = {
			success: true,
			message: 'Query executed successfully.',
			data: {
				results: results,
				meta: {
					retrieved_at: new Date().toISOString(),
					result_count: results.length,
					columns_selected: metadata.selectColumns,
					has_joins: metadata.hasJoins,
					has_where: metadata.hasWhere,
					parameter_count: metadata.parameterCount,
					table_fixed: metadata.fromClause, // Use the resolved 'from' from the builder
					sql_generated: sql.replace(/\s+/g, ' ').trim()
				}
			},
			meta: {
				timestamp: new Date().toISOString()
			}
		};
		log.info(`[${operationId}] FN_SUCCESS: ${queryType} query returned ${results.length} results.`);
		return json(response);
	} catch (err: unknown) {
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during generic query execution.`, { error: err });
		throw error(status, message);
	}
};