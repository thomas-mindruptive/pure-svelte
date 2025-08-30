// src/routes/api/attributes/new/+server.ts

/**
 * @file Create Attribute API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/attributes/new - Handles the creation of new attribute master data records.
 * Performs server-side validation and returns the newly created entity.
 * Level 4 Master-Data creation following established patterns.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateAttribute } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { Attribute } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse
} from '$lib/api/types/common';

/**
 * POST /api/attributes/new
 * @description Creates a new attribute master data record.
 */
export const POST: RequestHandler = async ({ request }) => {
    log.infoHeader("POST /api/attributes/new");
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /attributes/new: FN_START`);

    try {
        // 1. Expect the request body to be the new attribute data.
        const requestData = (await request.json()) as Partial<Omit<Attribute, 'attribute_id'>>
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // 2. Validate the incoming data in 'create' mode.
        const validation = validateAttribute(requestData, { mode: 'create' });
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
        const { name, description } = validation.sanitized as Partial<Attribute>;

        // 4. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
        const result = await db
            .request()
            .input('name', name)
            .input('description', description)
            .query(`
                INSERT INTO dbo.attributes (name, description) 
                OUTPUT INSERTED.* 
                VALUES (@name, @description)
            `);

        if (result.recordset.length === 0) {
            // This case is highly unlikely on a successful INSERT but is good practice to handle.
            log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
            throw error(500, 'Failed to create attribute after database operation.');
        }

        const newAttribute = result.recordset[0] as Attribute;

        // 5. Format the successful response with a 201 Created status.
        const response: ApiSuccessResponse<{ attribute: Attribute }> = {
            success: true,
            message: `Attribute "${newAttribute.name}" created successfully.`,
            data: { attribute: newAttribute },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Attribute created with ID ${newAttribute.attribute_id}.`);
        return json(response, { status: 201 });

    } catch (err: unknown) {
        // The mssqlErrorMapper will correctly handle unique constraint violations (duplicate name)
        // and map them to a 409 Conflict status.
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during attribute creation.`, { error: err });
        throw error(status, message);
    }
};