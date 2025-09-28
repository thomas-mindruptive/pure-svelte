// src/routes/api/categories/new/+server.ts

/**
 * @file Create Category API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/categories/new - Handles the creation of new category master data records.
 * Performs server-side validation and returns the newly created entity.
 * Level 2 Master-Data creation following established patterns.
 */

import { type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { ProductCategoryForCreateSchema, type ProductCategory } from '$lib/domain/domainTypes';
import { buildUnexpectedError, validateAndInsertEntity } from '$lib/backendQueries/entityOperations';
import { v4 as uuidv4 } from 'uuid';


/**
 * POST /api/categories/new
 * @description Creates a new category master data record.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    const info = `POST /api/categories/new - ${operationId}`;
    log.infoHeader(info);

    try {
        // 1. Expect the request body to be the new category data.
        const requestData = (await request.json()) as Partial<Omit<ProductCategory, 'category_id'>>;
        log.info(`[${operationId}] Parsed request body`, { requestData });
        return validateAndInsertEntity(ProductCategoryForCreateSchema, requestData, "category");
    } catch (err: unknown) {
        return buildUnexpectedError(err, info);
    }
};