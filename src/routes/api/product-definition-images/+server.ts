// src/routes/api/product-definition-images/+server.ts

/**
 * @file Product Definition Images List API Endpoint
 * @description Provides access to product definition image associations with nested image data.
 * Uses entityOperations/image.ts for complex nested operations.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { TransWrapper } from '$lib/backendQueries/transactionWrapper';
import { db } from '$lib/backendQueries/db';
import { loadProductDefinitionImagesWithImage } from '$lib/backendQueries/entityOperations/image';
import type { ProductDefinitionImage_Image } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/product-definition-images
 * @description Fetches product definition images with nested image data based on QueryPayload.
 */
export const POST: RequestHandler = async (event) => {
    const operationId = uuidv4();
    const info = `POST /api/product-definition-images - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /product-definition-images: FN_START`);

    const tw = new TransWrapper(null, db);

    try {
        // 1. Parse QueryRequest
        const requestBody = (await event.request.json()) as QueryRequest<ProductDefinitionImage_Image>;
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
            where: clientPayload.where,
            limit: clientPayload.limit
        });

        // 2. Load with transaction
        await tw.begin();
        const jsonString = await loadProductDefinitionImagesWithImage(tw.trans, clientPayload);
        await tw.commit();

        const results = JSON.parse(jsonString);

        // 3. Format response
        const response: QuerySuccessResponse<ProductDefinitionImage_Image> = {
            success: true,
            message: 'Product definition images with images retrieved successfully.',
            data: {
                results: results as Partial<ProductDefinitionImage_Image>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: ['all'],
                    has_joins: true,
                    has_where: !!clientPayload.where,
                    parameter_count: 0,
                    table_fixed: 'dbo.product_definition_images + dbo.images',
                    sql_generated: '(generated via entityOperations/image.ts)'
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
        log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} product definition images.`);
        return json(response);
    } catch (err: unknown) {
        await tw.rollback();
        return buildUnexpectedError(err, info);
    }
};
