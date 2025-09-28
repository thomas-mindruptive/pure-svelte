// src/routes/api/categories/+server.ts

/**
 * @file Product Categories List API Endpoint - FINAL ARCHITECTURE
 * @description This endpoint provides read-only access to the master data of product categories.
 * It follows the "Secure Entity Endpoint" pattern, enforcing the table name on the server.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { supplierQueryConfig } from '$lib/backendQueries/queryConfig';
import { buildUnexpectedError } from '$lib/backendQueries/entityOperations';
import type { ProductCategory } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/categories
 * @description Fetches a list of product categories based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
    const operationId = uuidv4();
    const info = `POST /api/categories - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /categories: FN_START`);

    try {
        // 1. Expect the standard QueryRequest envelope.
        const requestBody = (await event.request.json()) as QueryRequest<ProductCategory>;
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
            where: clientPayload.where,
            clientPayload
        });

        // 3. Build and execute the query.
        const { sql, parameters, metadata } = buildQuery(clientPayload, supplierQueryConfig, undefined, { table: 'dbo.product_categories', alias: 'pc' });
        log.debug(`Built query: `, sql);
        const results = await executeQuery(sql, parameters);

        // 4. Format the response using the standard `QuerySuccessResponse` type.
        const response: QuerySuccessResponse<ProductCategory> = {
            success: true,
            message: 'Product categories retrieved successfully.',
            data: {
                results: results as Partial<ProductCategory>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.product_categories',
                    sql_generated: sql.replace(/\s+/g, ' ').trim()
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
        log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} categories.`);
        return json(response);
    } catch (err: unknown) {
        return buildUnexpectedError(err, info);
    }
};