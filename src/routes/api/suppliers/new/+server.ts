// src/routes/api/suppliers/new/+server.ts

/**
 * @file Create Supplier API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/suppliers/new - Handles the creation of a new wholesaler record.
 * It performs server-side validation and returns the newly created entity.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateWholesaler } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { Wholesaler } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

import type {
	ApiErrorResponse,
	ApiSuccessResponse
} from '$lib/api/api.types';

/**
 * POST /api/suppliers/new
 * @description Creates a new supplier.
 */
export const POST: RequestHandler = async ({ request }) => {
	log.infoHeader("POST /api/suppliers/new");
	const operationId = uuidv4();
	log.info(`[${operationId}] POST /suppliers/new: FN_START`);

	try {
		// 1. Expect the request body to be the new supplier data.
		const requestData = (await request.json()) as Partial<Omit<Wholesaler, 'wholesaler_id'>>;
		log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

		// 2. Validate the incoming data in 'create' mode.
		const validation = validateWholesaler(requestData, { mode: 'create' });
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
		const { name, country, region, status, dropship, website, b2b_notes } = validation.sanitized as Partial<Wholesaler>;

		// 4. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
		const result = await db
			.request()
			.input('name', name)
			.input('country', country)
			.input('region', region)
			.input('status', status)
			.input('dropship', dropship)
			.input('website', website)
			.input('b2b_notes', b2b_notes)
			.query(
				'INSERT INTO dbo.wholesalers (name, country, region, status, dropship, website, b2b_notes) OUTPUT INSERTED.* VALUES (@name, @country, @region, @status, @dropship, @website, @b2b_notes)'
			);

		if (result.recordset.length === 0) {
			// This case is highly unlikely on a successful INSERT but is good practice to handle.
			log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
			throw error(500, 'Failed to create supplier after database operation.');
		}

		const newSupplier = result.recordset[0] as Wholesaler;

		// 5. Format the successful response with a 201 Created status.
		const response: ApiSuccessResponse<{ supplier: Wholesaler }> = {
			success: true,
			message: `Supplier "${newSupplier.name}" created successfully.`,
			data: { supplier: newSupplier },
			meta: { timestamp: new Date().toISOString() }
		};

		log.info(`[${operationId}] FN_SUCCESS: Supplier created with ID ${newSupplier.wholesaler_id}.`);
		return json(response, { status: 201 });
        
	} catch (err: unknown) {
		// The mssqlErrorMapper will correctly handle unique constraint violations (e.g., duplicate name)
		// and map them to a 409 Conflict status.
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during supplier creation.`, { error: err });
		throw error(status, message);
	}
};