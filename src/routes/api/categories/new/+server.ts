// src/routes/api/categories/new/+server.ts

/**
 * @file Create Category API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/categories/new - Handles the creation of new category master data records.
 * Performs server-side validation and returns the newly created entity.
 * Level 2 Master-Data creation following established patterns.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateProductCategory } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { ProductCategory } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse
} from '$lib/api/api.types';

/**
 * POST /api/categories/new
 * @description Creates a new category master data record.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.infoHeader("POST /api/categories/new");
    log.info(`[${operationId}] POST /categories/new: FN_START`);

    try {
        // 1. Expect the request body to be the new category data.
        const requestData = (await request.json()) as Omit<ProductCategory, 'category_id'>;
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // 2. Validate the incoming data in 'create' mode.
        const validation = validateProductCategory(requestData, { mode: 'create' });
        if (!validation.isValid) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Server validation failed. Please check the provided data: ${JSON.stringify(validation.errors)}`,
                status_code: 400,
                error_code: 'VALIDATION_ERROR',
                errors: validation.errors,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
            return json(errRes, { status: 400 });
        }

        // 3. Use the sanitized data from the validator for the database operation.
        const { name, description } = validation.sanitized as Partial<ProductCategory>;

        // 4. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
        const result = await db
            .request()
            .input('name', name)
            .input('description', description)
            .query(`
                INSERT INTO dbo.product_categories (name, description) 
                OUTPUT INSERTED.* 
                VALUES (@name, @description)
            `);

        if (result.recordset.length === 0) {
            // This case is highly unlikely on a successful INSERT but is good practice to handle.
            log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
            throw error(500, 'Failed to create category after database operation.');
        }

        const newCategory = result.recordset[0] as ProductCategory;

        // 5. Format the successful response with a 201 Created status.
        const response: ApiSuccessResponse<{ category: ProductCategory }> = {
            success: true,
            message: `Category "${newCategory.name}" created successfully.`,
            data: { category: newCategory },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Category created with ID ${newCategory.category_id}.`);
        return json(response, { status: 201 });

    } catch (err: unknown) {
        // The mssqlErrorMapper will correctly handle unique constraint violations (duplicate name)
        // and map them to a 409 Conflict status.
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during category creation.`, { error: err });
        throw error(status, message);
    }
};