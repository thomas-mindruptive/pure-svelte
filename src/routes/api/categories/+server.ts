// src/routes/api/categories/+server.ts

/**
 * @file Product Categories List API Endpoint - FINAL ARCHITECTURE
 * @description This endpoint provides read-only access to the master data of product categories.
 * It follows the "Secure Entity Endpoint" pattern, enforcing the table name on the server.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { ProductCategory } from '$lib/domain/types';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/types/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/categories
 * @description Fetches a list of product categories based on a client-provided query payload.
 */
export const POST: RequestHandler = async (event) => {
    log.infoHeader("POST /api/categories");
    const operationId = uuidv4();
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
            where: clientPayload.where
        });

        // 2. SECURITY: Enforce the table name on the server.
        const securePayload: QueryPayload<ProductCategory> = {
            ...clientPayload,
            from: 'dbo.product_categories' // <-- SERVER-ENFORCED
        };

        // 3. Build and execute the query.
        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
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
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during category query.`, { error: err, mappedStatus: status, mappedMessage: message });
        // Only THROW for unexpected server errors.
        throw error(status, message);
    }
};