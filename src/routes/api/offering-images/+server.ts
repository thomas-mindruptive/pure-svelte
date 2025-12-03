// src/routes/api/offering-images/+server.ts

/**
 * @file Offering Images List API Endpoint
 * @description Provides access to offering image associations with nested image data.
 * Uses entityOperations/offeringImage.ts for junction table operations.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { TransWrapper } from '$lib/backendQueries/transactionWrapper';
import { db } from '$lib/backendQueries/db';
import { loadOfferingImages } from '$lib/backendQueries/entityOperations/offeringImage';
import type { ApiErrorResponse, QuerySuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';
import type { OfferingImageView } from '$lib/domain/domainTypes';

/**
 * POST /api/offering-images
 * @description Fetches offering images with nested image data.
 * Expects request body: { offering_id: number, options?: { is_explicit?: boolean } }
 */
export const POST: RequestHandler = async (event) => {
    const operationId = uuidv4();
    const info = `POST /api/offering-images - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /offering-images: FN_START`);

    const tw = new TransWrapper(null, db);

    try {
        // 1. Parse request body
        const requestBody = await event.request.json() as { offering_id: number; options?: { is_explicit?: boolean } };

        if (!requestBody.offering_id) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Request body must contain `offering_id`.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Missing offering_id.`, { body: requestBody });
            return json(errRes, { status: 400 });
        }

        log.info(`[${operationId}] Parsed request body`, {
            offering_id: requestBody.offering_id,
            options: requestBody.options
        });

        // 2. Load offering images with junction data
        await tw.begin();
        const offeringImages = await loadOfferingImages(tw.trans, requestBody.offering_id, requestBody.options);
        await tw.commit();

        // 3. Format response
        const response: QuerySuccessResponse<OfferingImageView> = {
            success: true,
            message: 'Offering images retrieved successfully.',
            data: {
                results: offeringImages as Partial<OfferingImageView>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: offeringImages.length,
                    columns_selected: ['all'],
                    has_joins: true,
                    has_where: true,
                    parameter_count: 0,
                    table_fixed: 'dbo.view_offering_images',
                    sql_generated: '(generated via entityOperations/offeringImage.ts)'
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
        log.info(`[${operationId}] FN_SUCCESS: Returning ${offeringImages.length} offering images.`);
        return json(response);
    } catch (err: unknown) {
        await tw.rollback();
        return buildUnexpectedError(err, info);
    }
};
