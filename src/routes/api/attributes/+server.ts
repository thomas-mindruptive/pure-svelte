// src/routes/api/attributes/+server.ts

/**
 * @file Attributes List API Endpoint - FINAL ARCHITECTURE
 * @description This endpoint provides read-only access to the master data of attributes.
 * It follows the "Secure Entity Endpoint" pattern, enforcing the table name on the server.
 * Handles Level 4 master data for attribute definitions.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { supplierQueryConfig } from '$lib/backendQueries/queryConfig';
import { mssqlErrorMapper } from '$lib/backendQueries/mssqlErrorMapper';
import type { Attribute } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/attributes
 * @description Fetches a list of attributes based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
    const operationId = uuidv4();
    log.infoHeader("POST /api/attributes");
    log.info(`[${operationId}] POST /attributes: FN_START`);

    try {
        // 1. Expect the standard QueryRequest envelope.
        const requestBody = (await event.request.json()) as QueryRequest<Attribute>;
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

        log.info(`[${operationId}] Parsed request body`, {
            clientColumns: clientPayload.select?.length || 0,
            where: clientPayload.where
        });


        // 3. Build and execute the query.
        const { sql, parameters, metadata } = buildQuery(clientPayload, supplierQueryConfig, undefined, { table: 'dbo.attributes', alias: 'a' });
        const results = await executeQuery(sql, parameters);

        // 4. Format the response using the standard `QuerySuccessResponse` type.
        const response: QuerySuccessResponse<Attribute> = {
            success: true,
            message: 'Attributes retrieved successfully.',
            data: {
                results: results as Partial<Attribute>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.attributes',
                    sql_generated: sql.replace(/\s+/g, ' ').trim()
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
        log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} attributes.`);
        return json(response);
    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during attribute query.`, { error: err, mappedStatus: status, mappedMessage: message });
        // Only THROW for unexpected server errors.
        throw error(status, message);
    }
};