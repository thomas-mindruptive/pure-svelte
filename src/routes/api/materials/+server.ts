// src/routes/api/materials/+server.ts

/**
 * @file Materials List API Endpoint
 * @description Provides read-only access to the master data of materials.
 * Follows the "Secure Entity Endpoint" pattern by enforcing the table name on the server.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { queryConfig } from '$lib/backendQueries/queryConfig';
import { buildUnexpectedError } from '$lib/backendQueries/entityOperations';
import { MaterialSchema, type Material } from '$lib/domain/domainTypes';
import { genTypedQualifiedColumns } from '$lib/domain/domainTypes.utils';
import type { QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import type { QueryPayload } from '$lib/backendQueries/queryGrammar';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/materials
 * @description Fetches a list of materials. If no payload provided, returns all materials with default columns.
 */
export const POST: RequestHandler = async (event) => {
	const operationId = uuidv4();
	const info = `POST /api/materials - ${operationId}`;
	log.infoHeader(info);

	try {
		const requestBody = (await event.request.json()) as QueryRequest<Material>;
		let clientPayload = requestBody.payload;

		// If no payload provided, generate default query using schema
		if (!clientPayload) {
			log.info(`[${operationId}] No payload provided, generating default query from MaterialSchema.`);
			const defaultColumns = genTypedQualifiedColumns(MaterialSchema);
			clientPayload = {
				select: defaultColumns,
				orderBy: [{ key: 'name', direction: 'asc' }]
			} as QueryPayload<Material>;
		}

		log.info(`[${operationId}] Parsed request payload`, {
			select: clientPayload.select,
			limit: clientPayload.limit
		});

		const { sql, parameters, metadata } = buildQuery(clientPayload, queryConfig, undefined, { table: 'dbo.materials', alias: 'm' });
		const results = await executeQuery(sql, parameters);

		const response: QuerySuccessResponse<Material> = {
			success: true,
			message: 'Materials retrieved successfully.',
			data: {
				results: results as Partial<Material>[],
				meta: {
					retrieved_at: new Date().toISOString(),
					result_count: results.length,
					columns_selected: metadata.selectColumns,
					has_joins: metadata.hasJoins,
					has_where: metadata.hasWhere,
					parameter_count: metadata.parameterCount,
					table_fixed: 'dbo.materials',
					sql_generated: sql.replace(/\s+/g, ' ').trim()
				}
			},
			meta: {
				timestamp: new Date().toISOString()
			}
		};
		log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} materials.`);
		return json(response);
	} catch (err: unknown) {
		return buildUnexpectedError(err, info);
	}
};
