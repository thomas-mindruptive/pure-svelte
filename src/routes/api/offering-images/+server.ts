// src/routes/api/offering-images/+server.ts

/**
 * @file Offering Images List API Endpoint
 * @description Provides access to offering image associations with nested image data.
 * Uses entityOperations/image.ts for complex nested operations.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { TransWrapper } from '$lib/backendQueries/transactionWrapper';
import { db } from '$lib/backendQueries/db';
import { loadImages } from '$lib/backendQueries/entityOperations/image';
import type { Image } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, QueryRequest, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/offering-images
 * @description Fetches offering images with nested image data based on QueryPayload.
 */
export const POST: RequestHandler = async (event) => {
    const operationId = uuidv4();
    const info = `POST /api/offering-images - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /offering-images: FN_START`);

    const tw = new TransWrapper(null, db);

    try {
        // 1. Parse QueryRequest
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
            where: clientPayload.where,
            limit: clientPayload.limit
        });

        // 2. Load with transaction (flat Image[], no nested structures)
        await tw.begin();
        const images = await loadImages(tw.trans, clientPayload);
        await tw.commit();

        // 3. Format response
        const response: QuerySuccessResponse<Image> = {
            success: true,
            message: 'Offering images retrieved successfully.',
            data: {
                results: images as Partial<Image>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: images.length,
                    columns_selected: ['all'],
                    has_joins: false,
                    has_where: !!clientPayload.where,
                    parameter_count: 0,
                    table_fixed: 'dbo.images',
                    sql_generated: '(generated via entityOperations/image.ts)'
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
        log.info(`[${operationId}] FN_SUCCESS: Returning ${images.length} offering images.`);
        return json(response);
    } catch (err: unknown) {
        await tw.rollback();
        return buildUnexpectedError(err, info);
    }
};
