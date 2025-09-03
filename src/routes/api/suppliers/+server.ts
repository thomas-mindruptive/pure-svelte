// src/routes/api/suppliers/+server.ts

/**
 * @file Suppliers List API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/suppliers - Provides type-safe, paginated, and filterable
 * access to the wholesalers list. It strictly follows the "Secure Entity Endpoint"
 * pattern by enforcing the database table name on the server.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { Wholesaler } from '$lib/domain/domainTypes';
import type { QueryRequest, QuerySuccessResponse, ApiErrorResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/suppliers
 * @description Fetches a list of suppliers based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
	log.infoHeader("POST /api/suppliers");
	const operationId = uuidv4();;
	log.info(`POST suppliers: FN_START ******`);

	try {
		// 1. Expect the standard QueryRequest envelope and extract the payload.
		const requestBody = (await event.request.json()) as QueryRequest<Wholesaler>;
		const clientPayload = requestBody.payload;

		if (!clientPayload) {
			const errRes: ApiErrorResponse = {
				success: false, message: 'Request body must be a valid QueryRequest object containing a `payload`.',
				status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() }
			};
			log.warn(`[${operationId}] FN_FAILURE: Malformed request body.`, { body: requestBody });
			return json(errRes, { status: 400 });
		}

		log.info(`[${operationId}] Parsed request payload`, {
			select: clientPayload.select,
			where: clientPayload.where,
			limit: clientPayload.limit
		});

		// 3. Build and execute the query.
		const { sql, parameters, metadata } = buildQuery(clientPayload, supplierQueryConfig, undefined, { table: 'dbo.wholesalers', alias: 'w' });
		const results = await executeQuery(sql, parameters);
		log.info(`[${operationId}] Executed suppliers query: result: %O`, results );

		// 4. Format the response using the standard `QuerySuccessResponse` type.
		const response: QuerySuccessResponse<Wholesaler> = {
			success: true,
			message: 'Suppliers retrieved successfully.',
			data: {
				results: results as Partial<Wholesaler>[],
				meta: {
					retrieved_at: new Date().toISOString(),
					result_count: results.length,
					columns_selected: metadata.selectColumns,
					has_joins: metadata.hasJoins,
					has_where: metadata.hasWhere,
					parameter_count: metadata.parameterCount,
					table_fixed: 'dbo.wholesalers',
					sql_generated: sql.replace(/\s+/g, ' ').trim()
				}
			},
			meta: {
				timestamp: new Date().toISOString()
			}
		};

		log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} suppliers.`);
		return json(response);

	} catch (err: unknown) {
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during suppliers query.`, { error: err });
		// Only THROW for unexpected server errors.
		throw error(status, message);
	}
};