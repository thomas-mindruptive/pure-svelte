// src/routes/api/product-definitions/new/+server.ts

/**
 * @file Create Product Definition API Endpoint
 * @description POST /api/product-definitions/new - Handles the creation of a new product definition master data record.
 * It performs server-side validation against the domain schema and returns the newly created entity.
 */

import { type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildUnexpectedError, validateAndInsertEntity } from '$lib/backendQueries/entityOperations';
import { ProductDefinitionForCreateSchema, type ProductDefinition } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/product-definitions/new
 * @description Creates a new product definition.
 */
export const POST: RequestHandler = async ({ request }) => {
	const operationId = uuidv4();
	const info = `POST /api/product-definitions/new - ${operationId}`;
	log.infoHeader(info);

	try {
		const requestData = (await request.json()) as Omit<ProductDefinition, 'product_def_id'>;
		log.info(`[${operationId}] Parsed request body`, { requestData });
		return validateAndInsertEntity(ProductDefinitionForCreateSchema, requestData, "productDefinition");
	} catch (err: unknown) {
		return buildUnexpectedError(err, info);
	}
};