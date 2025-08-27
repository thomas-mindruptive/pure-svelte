// src/routes/api/offering-links/new/+server.ts

/**
 * @file Create Offering Link API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/offering-links/new - Handles the creation of new offering link records.
 * Performs server-side validation and returns the newly created entity.
 * Level 5 (Real Object) creation following established patterns.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateOfferingLink } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { WholesalerOfferingLink } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    CreateRequest
} from '$lib/api/types/common';

/**
 * POST /api/offering-links/new
 * @description Creates a new offering link.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /offering-links/new: FN_START`);

    try {
        // 1. Expect the request body to be the new offering link data.
        const requestData = (await request.json()) as CreateRequest<Partial<WholesalerOfferingLink>>;
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // 2. Validate the incoming data in 'create' mode.
        const validation = validateOfferingLink(requestData, { mode: 'create' });
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
        const { offering_id, url, notes } = validation.sanitized as Partial<WholesalerOfferingLink>;

        // 4. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
        const result = await db
            .request()
            .input('offering_id', offering_id)
            .input('url', url)
            .input('notes', notes)
            .query(`
                INSERT INTO dbo.wholesaler_offering_links (offering_id, url, notes) 
                OUTPUT INSERTED.* 
                VALUES (@offering_id, @url, @notes)
            `);

        if (result.recordset.length === 0) {
            // This case is highly unlikely on a successful INSERT but is good practice to handle.
            log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
            throw error(500, 'Failed to create offering link after database operation.');
        }

        const newLink = result.recordset[0] as WholesalerOfferingLink;

        // 5. Format the successful response with a 201 Created status.
        const response: ApiSuccessResponse<{ link: WholesalerOfferingLink }> = {
            success: true,
            message: `Offering link created successfully.`,
            data: { link: newLink },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering link created with ID ${newLink.link_id}.`);
        return json(response, { status: 201 });

    } catch (err: unknown) {
        // The mssqlErrorMapper will correctly handle foreign key violations (invalid offering_id)
        // and map them to appropriate HTTP statuses.
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during offering link creation.`, { error: err });
        throw error(status, message);
    }
};