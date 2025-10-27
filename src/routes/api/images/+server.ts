// src/routes/api/images/+server.ts

/**
 * @file Images List API Endpoint
 * @description This endpoint provides read-only access to the master data of images.
 * It follows the "Secure Entity Endpoint" pattern, enforcing the table name on the server.
 * Handles master data for image metadata including Shopify integration.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { queryConfig } from '$lib/backendQueries/queryConfig';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import type { Image } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/images
 * @description Fetches a list of images based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
    const operationId = uuidv4();
    const info = `POST /api/images - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /images: FN_START`);

    try {
        // 1. Expect the standard QueryRequest envelope.
        const requestBody = (await event.request.json()) as QueryRequest<Image>;
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

        // 2. Build and execute the query.
        const { sql, parameters, metadata } = buildQuery(clientPayload, queryConfig, undefined, { table: 'dbo.images', alias: 'img' });
        const results = await executeQuery(sql, parameters);

        // 3. Format the response using the standard `QuerySuccessResponse` type.
        const response: QuerySuccessResponse<Image> = {
            success: true,
            message: 'Images retrieved successfully.',
            data: {
                results: results as Partial<Image>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.images',
                    sql_generated: sql.replace(/\s+/g, ' ').trim()
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
        log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} images.`);
        return json(response);
    } catch (err: unknown) {
        return buildUnexpectedError(err, info);
    }
};
