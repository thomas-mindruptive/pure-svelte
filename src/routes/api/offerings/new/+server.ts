// src/routes/api/offerings/new/+server.ts

/**
 * @file Create Offering API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/offerings/new - Handles the creation of new offering records.
 * Performs server-side validation and returns the newly created entity.
 * Level 3 (Real Object) creation following established patterns.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateOffering } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { WholesalerItemOffering } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    CreateRequest
} from '$lib/api/types/common';

/**
 * POST /api/offerings/new
 * @description Creates a new offering.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /offerings/new: FN_START`);

    try {
        // 1. Expect the request body to be the new offering data.
        const requestData = (await request.json()) as CreateRequest<Partial<WholesalerItemOffering>>;
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // 2. Validate the incoming data in 'create' mode.
        const validation = validateOffering(requestData, { mode: 'create' });
        if (!validation.isValid) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Validation failed. Please check the provided data.',
                status_code: 400,
                error_code: 'VALIDATION_ERROR',
                errors: validation.errors,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
            return json(errRes, { status: 400 });
        }

        // 3. Use the sanitized data from the validator for the database operation.
        const { 
            wholesaler_id, 
            category_id, 
            product_def_id, 
            size, 
            dimensions, 
            price, 
            currency, 
            comment 
        } = validation.sanitized as Partial<WholesalerItemOffering>;

        // 4. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
        const result = await db
            .request()
            .input('wholesaler_id', wholesaler_id)
            .input('category_id', category_id)
            .input('product_def_id', product_def_id)
            .input('size', size)
            .input('dimensions', dimensions)
            .input('price', price)
            .input('currency', currency)
            .input('comment', comment)
            .query(`
                INSERT INTO dbo.wholesaler_item_offerings (
                    wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment
                ) 
                OUTPUT INSERTED.* 
                VALUES (
                    @wholesaler_id, @category_id, @product_def_id, @size, @dimensions, @price, @currency, @comment
                )
            `);

        if (result.recordset.length === 0) {
            // This case is highly unlikely on a successful INSERT but is good practice to handle.
            log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
            throw error(500, 'Failed to create offering after database operation.');
        }

        const newOffering = result.recordset[0] as WholesalerItemOffering;

        // 5. Format the successful response with a 201 Created status.
        const response: ApiSuccessResponse<{ offering: WholesalerItemOffering }> = {
            success: true,
            message: `Offering created successfully.`,
            data: { offering: newOffering },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering created with ID ${newOffering.offering_id}.`);
        return json(response, { status: 201 });

    } catch (err: unknown) {
        // The mssqlErrorMapper will correctly handle foreign key violations (invalid supplier/category/product IDs)
        // and map them to appropriate HTTP statuses.
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during offering creation.`, { error: err });
        throw error(status, message);
    }
};