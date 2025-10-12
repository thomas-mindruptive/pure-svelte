// src/routes/api/attributes/new/+server.ts

/**
 * @file Create Attribute API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/attributes/new - Handles the creation of new attribute master data records.
 * Performs server-side validation and returns the newly created entity.
 * Level 4 Master-Data creation following established patterns.
 */

import { type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError, validateAndInsertEntity } from '$lib/backendQueries/genericEntityOperations';
import { AttributeForCreateSchema, type Attribute } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/attributes/new
 * @description Creates a new attribute master data record.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    const info = `POST /api/attributes/new - ${operationId}`;
    log.infoHeader(info);

    try {
        const requestData = (await request.json()) as Partial<Omit<Attribute, 'attribute_id'>>;
        log.info(`[${operationId}] Parsed request body`, { requestData });
        return validateAndInsertEntity(AttributeForCreateSchema, requestData, "attribute");
    } catch (err: unknown) {
        return buildUnexpectedError(err, info);
    }
};