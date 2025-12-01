// src/routes/api/offering-images/new/+server.ts

/**
 * @file Create Offering Image API Endpoint (OOP Inheritance Pattern)
 * @description POST /api/offering-images/new
 * Creates a new OfferingImage with nested Image data.
 * Inserts into BOTH tables atomically with the same image_id (OOP inheritance).
 */

import { type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { TransWrapper } from '$lib/backendQueries/transactionWrapper';
import { db } from '$lib/backendQueries/db';
import { insertImage } from '$lib/backendQueries/entityOperations/image';
import type { Image } from '$lib/domain/domainTypes';
import type { ApiSuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';
import { json } from '@sveltejs/kit';

/**
 * POST /api/offering-images/new
 * @description Creates a new offering image with nested image data.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    const info = `POST /api/offering-images/new - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /offering-images/new: FN_START`);

    const tw = new TransWrapper(null, db);

    try {
        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, {
            fields: Object.keys(requestData),
            offering_id: requestData.offering_id
        });

        await tw.begin();
        const createdRecord = await insertImage(tw.trans, requestData);
        await tw.commit();

        const response: ApiSuccessResponse<{ offeringImage: Image }> = {
            success: true,
            message: "Offering image created successfully.",
            data: { offeringImage: createdRecord },
            meta: { timestamp: new Date().toISOString() },
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering image created with image_id ${createdRecord.image_id}`);
        return json(response, { status: 201 });
    } catch (err: unknown) {
        await tw.rollback();
        return buildUnexpectedError(err, info);
    }
};
