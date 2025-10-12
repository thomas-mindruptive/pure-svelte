// src/routes/api/forms/+server.ts

/**
 * @file Forms List API Endpoint
 * @description Provides read-only access to the master data of forms.
 * Follows the "Secure Entity Endpoint" pattern by enforcing the table name on the server.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { queryConfig } from '$lib/backendQueries/queryConfig';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { FormSchema, type Form } from '$lib/domain/domainTypes';
import { genTypedQualifiedColumns } from '$lib/domain/domainTypes.utils';
import type { QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import type { QueryPayload } from '$lib/backendQueries/queryGrammar';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/forms
 * @description Fetches a list of forms. If no payload provided, returns all forms with default columns.
 */
export const POST: RequestHandler = async (event) => {
	const operationId = uuidv4();
	const info = `POST /api/forms - ${operationId}`;
	log.infoHeader(info);

	try {
		const requestBody = (await event.request.json()) as QueryRequest<Form>;
		let clientPayload = requestBody.payload;

		// If no payload provided, generate default query using schema
		if (!clientPayload) {
			log.info(`[${operationId}] No payload provided, generating default query from FormSchema.`);
			const defaultColumns = genTypedQualifiedColumns(FormSchema);
			clientPayload = {
				select: defaultColumns,
				orderBy: [{ key: 'name', direction: 'asc' }]
			} as QueryPayload<Form>;
		}

		log.info(`[${operationId}] Parsed request payload`, {
			select: clientPayload.select,
			limit: clientPayload.limit
		});

		const { sql, parameters, metadata } = buildQuery(clientPayload, queryConfig, undefined, { table: 'dbo.forms', alias: 'f' });
		const results = await executeQuery(sql, parameters);

		const response: QuerySuccessResponse<Form> = {
			success: true,
			message: 'Forms retrieved successfully.',
			data: {
				results: results as Partial<Form>[],
				meta: {
					retrieved_at: new Date().toISOString(),
					result_count: results.length,
					columns_selected: metadata.selectColumns,
					has_joins: metadata.hasJoins,
					has_where: metadata.hasWhere,
					parameter_count: metadata.parameterCount,
					table_fixed: 'dbo.forms',
					sql_generated: sql.replace(/\s+/g, ' ').trim()
				}
			},
			meta: {
				timestamp: new Date().toISOString()
			}
		};
		log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} forms.`);
		return json(response);
	} catch (err: unknown) {
		return buildUnexpectedError(err, info);
	}
};
