// src/routes/api/offering-images/new/+server.ts

/**
 * @file Create Offering Image API Endpoint (Junction Table Pattern)
 * @description POST /api/offering-images/new
 * Creates a new OfferingImage with Image and junction entry.
 * Sets explicit = true for explicit images.
 */

import { type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { TransWrapper } from '$lib/backendQueries/transactionWrapper';
import { db } from '$lib/backendQueries/db';
import { insertOfferingImage } from '$lib/backendQueries/entityOperations/offeringImage';
import type { ApiSuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';
import { json } from '@sveltejs/kit';
import type { OfferingImageView } from '$lib/domain/domainTypes';

/**
 * POST /api/offering-images/new
 * @description Creates a new offering image with image and junction entry.
 * Sets explicit = true by default for explicit images.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    const info = `POST /api/offering-images/new - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /offering-images/new: FN_START`);

    const tw = new TransWrapper(null, db);

    try {
        const requestData: Partial<OfferingImageView> = await request.json();
        log.info(`[${operationId}] Parsed request body`, {
            fields: Object.keys(requestData),
            offering_id: requestData.offering_id
        });

        await tw.begin();
        const createdRecord = await insertOfferingImage(tw.trans, requestData);
        await tw.commit();

        const response: ApiSuccessResponse<{ offeringImage: OfferingImageView }> = {
            success: true,
            message: "Offering image created successfully.",
            data: { offeringImage: createdRecord },
            meta: { timestamp: new Date().toISOString() },
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering image created with offering_image_id ${createdRecord.offering_image_id}`);
        return json(response, { status: 201 });
    } catch (err: unknown) {
        await tw.rollback();
        return buildUnexpectedError(err, info);
    }
};
