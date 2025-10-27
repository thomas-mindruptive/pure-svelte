// src/routes/api/product-definition-images/new/+server.ts

/**
 * @file Create Product Definition Image API Endpoint (OOP Inheritance Pattern)
 * @description POST /api/product-definition-images/new
 * Creates a new ProductDefinitionImage with nested Image data.
 * Inserts into BOTH tables atomically with the same image_id (OOP inheritance).
 */

import { type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError } from '$lib/backendQueries/genericEntityOperations';
import { TransWrapper } from '$lib/backendQueries/transactionWrapper';
import { db } from '$lib/backendQueries/db';
import { insertProductDefinitionImageWithImage } from '$lib/backendQueries/entityOperations/image';
import type { ProductDefinitionImage_Image } from '$lib/domain/domainTypes';
import type { ApiSuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';
import { json } from '@sveltejs/kit';

/**
 * POST /api/product-definition-images/new
 * @description Creates a new product definition image with nested image data.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    const info = `POST /api/product-definition-images/new - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /product-definition-images/new: FN_START`);

    const tw = new TransWrapper(null, db);

    try {
        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, {
            fields: Object.keys(requestData),
            hasNestedImage: !!requestData.image
        });

        await tw.begin();
        const createdRecord = await insertProductDefinitionImageWithImage(tw.trans, requestData);
        await tw.commit();

        const response: ApiSuccessResponse<{ productDefinitionImage: ProductDefinitionImage_Image }> = {
            success: true,
            message: "Product definition image created successfully (both Image and ProductDefinitionImage records).",
            data: { productDefinitionImage: createdRecord },
            meta: { timestamp: new Date().toISOString() },
        };

        log.info(`[${operationId}] FN_SUCCESS: Product definition image created with image_id ${createdRecord.image_id}`);
        return json(response, { status: 201 });
    } catch (err: unknown) {
        await tw.rollback();
        return buildUnexpectedError(err, info);
    }
};
