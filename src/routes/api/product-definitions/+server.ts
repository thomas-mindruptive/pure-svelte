// src/routes/api/product-definitions/+server.ts

/**
 * @file Product Definitions List API Endpoint
 * @description Provides read-only access to the master data of product definitions.
 * Follows the "Secure Entity Endpoint" pattern by enforcing the table name on the server.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { supplierQueryConfig } from '$lib/backendQueries/queryConfig';
import { mssqlErrorMapper } from '$lib/backendQueries/mssqlErrorMapper';
import type { ProductDefinition } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/product-definitions
 * @description Fetches a list of product definitions based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
	log.infoHeader('POST /api/product-definitions');
	const operationId = uuidv4();
	log.info(`[${operationId}] POST /product-definitions: FN_START`);

	try {
		// 1. Expect the standard QueryRequest envelope and extract the payload.
		const requestBody = (await event.request.json()) as QueryRequest<ProductDefinition>;
		const clientPayload = requestBody.payload;

		if (!clientPayload) {
			const errRes: ApiErrorResponse = {
				success: false,
				message: 'Request body must be a valid QueryRequest object containing a `payload`.',
				status_code: 400,
				error_code: 'BAD_REQUEST',
				meta: { timestamp: new Date().toISOString() }
			};
			log.warn(`[${operationId}] FN_FAILURE: Malformed request body.`, { body: requestBody });
			return json(errRes, { status: 400 });
		}

		log.info(`[${operationId}] Parsed request payload`, {
			select: clientPayload.select,
			where: clientPayload.where,
			limit: clientPayload.limit
		});

		// 3. Build and execute the query using the secure, generic query builder.
		const { sql, parameters, metadata } = buildQuery(clientPayload, supplierQueryConfig, undefined, { table: 'dbo.product_definitions', alias: 'pd' });
		const results = await executeQuery(sql, parameters);

		// 4. Format the response using the standard `QuerySuccessResponse` type.
		const response: QuerySuccessResponse<ProductDefinition> = {
			success: true,
			message: 'Product definitions retrieved successfully.',
			data: {
				results: results as Partial<ProductDefinition>[],
				meta: {
					retrieved_at: new Date().toISOString(),
					result_count: results.length,
					columns_selected: metadata.selectColumns,
					has_joins: metadata.hasJoins,
					has_where: metadata.hasWhere,
					parameter_count: metadata.parameterCount,
					table_fixed: 'dbo.product_definitions',
					sql_generated: sql.replace(/\s+/g, ' ').trim()
				}
			},
			meta: {
				timestamp: new Date().toISOString()
			}
		};
		log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} product definitions.`);
		return json(response);
	} catch (err: unknown) {
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during product definition query.`, { error: err });
		throw error(status, message);
	}
};