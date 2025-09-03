// src/routes/api/product-definitions/[id]/+server.ts

/**
 * @file Individual Product Definition API Endpoints
 * @description Provides GET, PUT, and DELETE operations for a single product definition record,
 * adhering to the schema-driven validation and dynamic update patterns.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateProductDefinition } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { checkProductDefinitionDependencies } from '$lib/dataModel/dependencyChecks';
import type { ProductDefinition } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';
import type {
	ApiErrorResponse,
	ApiSuccessResponse,
	DeleteConflictResponse,
	DeleteSuccessResponse
} from '$lib/api/api.types';

/**
 * GET /api/product-definitions/[id]
 * @description Retrieves a single product definition record.
 */
export const GET: RequestHandler = async ({ params }) => {
	const operationId = uuidv4();
	const id = parseInt(params.id ?? '', 10);
	log.info(`[${operationId}] GET /product-definitions/${id}: FN_START`);

	if (isNaN(id) || id <= 0) {
		throw error(400, 'Invalid product definition ID.');
	}

	try {
		const result = await db
			.request()
			.input('id', id)
			.query('SELECT * FROM dbo.product_definitions WHERE product_def_id = @id');

		if (result.recordset.length === 0) {
			throw error(404, `Product definition with ID ${id} not found.`);
		}

		const response: ApiSuccessResponse<{ productDefinition: ProductDefinition }> = {
			success: true,
			message: 'Product definition retrieved successfully.',
			data: { productDefinition: result.recordset[0] as ProductDefinition },
			meta: { timestamp: new Date().toISOString() }
		};
		return json(response);
	} catch (err: unknown) {
		if ((err as { status?: number })?.status === 404) {
			throw err; // Re-throw SvelteKit's 404 error
		}
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during GET.`, { error: err });
		throw error(status, message);
	}
};

/**
 * PUT /api/product-definitions/[id]
 * @description Dynamically updates an existing product definition based on provided fields.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const operationId = uuidv4();
	const id = parseInt(params.id ?? '', 10);
	log.info(`[${operationId}] PUT /product-definitions/${id}: FN_START`);

	if (isNaN(id) || id <= 0) {
		const errRes: ApiErrorResponse = { success: false, message: 'Invalid product definition ID.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
		return json(errRes, { status: 400 });
	}

	try {
		const requestData = await request.json();
		const validation = validateProductDefinition(requestData, { mode: 'update' });

		if (!validation.isValid) {
			const errRes: ApiErrorResponse = { success: false, message: 'Validation failed.', status_code: 400, error_code: 'VALIDATION_ERROR', errors: validation.errors, meta: { timestamp: new Date().toISOString() } };
			return json(errRes, { status: 400 });
		}

		const { sanitized } = validation;
		const fieldsToUpdate = Object.keys(sanitized);

		if (fieldsToUpdate.length === 0) {
			const errRes: ApiErrorResponse = { success: false, message: 'No valid fields provided for update.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
			return json(errRes, { status: 400 });
		}

		log.info(`[${operationId}] Validated fields for dynamic update:`, fieldsToUpdate);

		// Dynamically build the SET clause for the SQL query
		const setClauses = fieldsToUpdate.map((field) => `${field} = @${field}`);
		const sqlQuery = `
            UPDATE dbo.product_definitions 
            SET ${setClauses.join(', ')} 
            OUTPUT INSERTED.* 
            WHERE product_def_id = @id
        `;

		// Prepare the database request with dynamic inputs
		const dbRequest = db.request().input('id', id);
		for (const field of fieldsToUpdate) {
			dbRequest.input(field, (sanitized as Record<string, unknown>)[field]);
		}

		const result = await dbRequest.query(sqlQuery);

		if (result.recordset.length === 0) {
			throw error(404, `Product definition with ID ${id} not found.`);
		}

		const response: ApiSuccessResponse<{ productDefinition: ProductDefinition }> = {
			success: true,
			message: 'Product definition updated successfully.',
			data: { productDefinition: result.recordset[0] as ProductDefinition },
			meta: { timestamp: new Date().toISOString() }
		};
		return json(response);
	} catch (err: unknown) {
		if ((err as { status?: number })?.status === 404) {
			throw err;
		}
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during PUT.`, { error: err });
		throw error(status, message);
	}
};

/**
 * DELETE /api/product-definitions/[id]
 * @description Deletes a product definition after checking for hard dependencies.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const operationId = uuidv4();
	const id = parseInt(params.id ?? '', 10);
	log.info(`[${operationId}] DELETE /product-definitions/${id}: FN_START`);

	if (isNaN(id) || id <= 0) {
        const errRes: ApiErrorResponse = { success: false, message: 'Invalid product definition ID.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
		return json(errRes, { status: 400 });
	}

	try {
		const dependencies = await checkProductDefinitionDependencies(id);

		// Hard dependency check: Offerings must not exist.
		if (dependencies.length > 0) {
			const conflictResponse: DeleteConflictResponse<string[]> = {
				success: false,
				message: 'Cannot delete product definition: It is referenced by existing offerings.',
				status_code: 409,
				error_code: 'DEPENDENCY_CONFLICT',
				dependencies: dependencies,
				cascade_available: false, // Cascade is NOT allowed for this hard link.
				meta: { timestamp: new Date().toISOString() }
			};
			return json(conflictResponse, { status: 409 });
		}

		// Get details before deletion for the response payload
		const detailsResult = await db
			.request()
			.input('id', id)
			.query('SELECT product_def_id, title FROM dbo.product_definitions WHERE product_def_id = @id');

		if (detailsResult.recordset.length === 0) {
			throw error(404, `Product definition with ID ${id} not found.`);
		}
		const details = detailsResult.recordset[0];

		// Perform the deletion
		await db.request().input('id', id).query('DELETE FROM dbo.product_definitions WHERE product_def_id = @id');

		const response: DeleteSuccessResponse<Pick<ProductDefinition, 'product_def_id' | 'title'>> = {
			success: true,
			message: `Product definition "${details.title}" deleted successfully.`,
			data: {
				deleted_resource: details,
				cascade_performed: false,
				dependencies_cleared: 0
			},
			meta: { timestamp: new Date().toISOString() }
		};

		return json(response);
	} catch (err: unknown) {
		if ((err as { status?: number })?.status === 404) {
			throw err;
		}
		const { status, message } = mssqlErrorMapper.mapToHttpError(err);
		log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during DELETE.`, { error: err });
		throw error(status, message);
	}
};