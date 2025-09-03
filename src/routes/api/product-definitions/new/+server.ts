// src/routes/api/product-definitions/new/+server.ts

/**
 * @file Create Product Definition API Endpoint
 * @description POST /api/product-definitions/new - Handles the creation of a new product definition master data record.
 * It performs server-side validation against the domain schema and returns the newly created entity.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateProductDefinition } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { ProductDefinition } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';
import type { ApiErrorResponse, ApiSuccessResponse } from '$lib/api/api.types';

/**
 * POST /api/product-definitions/new
 * @description Creates a new product definition.
 */
export const POST: RequestHandler = async ({ request }) => {
	log.infoHeader('POST /api/product-definitions/new');
	const operationId = uuidv4();
	log.info(`[${operationId}] POST /product-definitions/new: FN_START`);

	try {
		// 1. Expect the request body to be the new product definition data.
		const requestData = (await request.json()) as Omit<ProductDefinition, 'product_def_id'>;
		log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

		// 2. Validate the incoming data in 'create' mode using the central validator.
		const validation = validateProductDefinition(requestData, { mode: 'create' });
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
		const { title, category_id, description } = validation.sanitized as Partial<ProductDefinition>;

		// 4. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
		const result = await db
			.request()
			.input('title', title)
			.input('category_id', category_id)
			.input('description', description)
			.query(
				`INSERT INTO dbo.product_definitions (title, category_id, description) 
                 OUTPUT INSERTED.* 
                 VALUES (@title, @category_id, @description)`
			);

		if (result.recordset.length === 0) {
			log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
			throw error(500, 'Failed to create product definition after database operation.');
		}

		const newProductDef = result.recordset[0] as ProductDefinition;

		// 5. Format the successful response with a 201 Created status.
		const response: ApiSuccessResponse<{ productDefinition: ProductDefinition }> = {
			success: true,
			message: `Product definition "${newProductDef.title}" created successfully.`,
			data: { productDefinition: newProductDef },
			meta: { timestamp: new Date().toISOString() }
		};

		log.info(`[${operationId}] FN_SUCCESS: Product definition created with ID ${newProductDef.product_def_id}.`);
		return json(response, { status: 201 });
	} catch (err: unknown) {
		// The mssqlErrorMapper will correctly handle unique constraint violations
		// and map them to a 409 Conflict status.
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during creation.`, { error: err });
		throw error(status, message);
	}
};