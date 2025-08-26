// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - FINAL ARCHITECTURE
 * @description Provides type-safe client functions for all supplier-related operations.
 * This file is fully aligned with the final server-side API architecture, using the
 * correct fetch wrappers (`apiFetch`, `apiFetchUnion`) and request body structures.
 */

import { apiFetch, apiFetchUnion, createPostBody, createQueryBody, getErrorMessage, LoadingState } from './common';
import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { Wholesaler, WholesalerCategoryWithCount } from '$lib/domain/types';

// Import generic types from the single source of truth: common.ts
import type {
	DeleteApiResponse,
	PredefinedQueryRequest,
	QueryResponseData
} from '$lib/api/types/common';

// A dedicated loading state manager for all supplier-related operations.
export const supplierLoadingState = new LoadingState();

/**
 * The default query payload used when fetching a list of suppliers.
 * Ensures a consistent initial view.
 */
export const DEFAULT_SUPPLIER_QUERY: QueryPayload = {
	select: ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'website', 'created_at'],
	orderBy: [{ key: 'name', direction: 'asc' }],
	limit: 100
};

/**
 * Loads a list of suppliers from the secure entity endpoint `/api/suppliers`.
 * This function uses `apiFetch`, which returns the unwrapped `data` on success or
 * throws a structured `ApiError` on any failure.
 *
 * @param query A partial `QueryPayload` to filter, sort, or paginate the results.
 * @returns A promise that resolves to an array of `Wholesaler` objects.
 * @throws {ApiError} If the API call fails for any reason.
 */
export async function loadSuppliers(query: Partial<QueryPayload> = {}): Promise<Wholesaler[]> {
	const operationId = 'loadSuppliers';
	supplierLoadingState.start(operationId);
	try {
		const fullQuery = { ...DEFAULT_SUPPLIER_QUERY, ...query };
		
		// Use `createQueryBody` to wrap the payload in the `{ "payload": ... }` envelope.
		const responseData = await apiFetch<QueryResponseData<Wholesaler>>(
			'/api/suppliers',
			{ method: 'POST', body: createQueryBody(fullQuery) },
			{ context: operationId }
		);
		// The `results` are guaranteed to be at least `Partial<Wholesaler>[]`.
		// We cast to `Wholesaler[]` based on the knowledge that our default query fetches all required fields.
		return responseData.results as Wholesaler[];
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err; // Re-throw the ApiError for the UI layer to handle.
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Loads a single, complete supplier object by its ID from `/api/suppliers/[id]`.
 *
 * @param supplierId The ID of the supplier to fetch.
 * @returns A promise that resolves to a single `Wholesaler` object.
 * @throws {ApiError} If the supplier is not found or the API call fails.
 */
export async function loadSupplier(supplierId: number): Promise<Wholesaler> {
	const operationId = `loadSupplier-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		const query: QueryPayload = { select: ['*'], limit: 1 };
		const responseData = await apiFetch<QueryResponseData<Wholesaler>>(
			`/api/suppliers/${supplierId}`,
			{ method: 'POST', body: createQueryBody(query) },
			{ context: operationId }
		);

		if (responseData.results.length > 0) {
			return responseData.results[0] as Wholesaler;
		}
		// If the API returns a 200 OK but an empty results array, it's a "not found" case.
		throw new Error(`Supplier with ID ${supplierId} not found.`);
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Updates an existing supplier with a partial data object.
 *
 * @param supplierId The ID of the supplier to update.
 * @param updates A partial `Wholesaler` object with the fields to update.
 * @returns A promise that resolves to the fully updated `Wholesaler` object from the server.
 * @throws {ApiError} If validation fails (400) or another error occurs.
 */
export async function updateSupplier(supplierId: number, updates: Partial<Wholesaler>): Promise<Wholesaler> {
	const operationId = `updateSupplier-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		// Use `createPostBody` for simple object bodies.
		const responseData = await apiFetch<{ supplier: Wholesaler }>(
			`/api/suppliers/${supplierId}`,
			{ method: 'PUT', body: createPostBody(updates) },
			{ context: operationId }
		);
		return responseData.supplier;
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Deletes a supplier. This function is special because it uses `apiFetchUnion`.
 * It does not throw an error on a 409 Conflict, but instead returns the structured
 * `DeleteConflictResponse` object for the UI to handle.
 *
 * @param supplierId The ID of the supplier to delete.
 * @param cascade Whether to perform a cascade delete of all related data.
 * @returns A promise that resolves to the full `DeleteApiResponse` union (success or conflict).
 * @throws {ApiError} Only for unexpected server errors (e.g., 500) or network failures.
 */
export async function deleteSupplier(
	supplierId: number,
	cascade = false
): Promise<DeleteApiResponse<{ wholesaler_id: number; name: string }, string[]>> {
	const operationId = `deleteSupplier-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		const url = `/api/suppliers/${supplierId}${cascade ? '?cascade=true' : ''}`;
		// Use `apiFetchUnion` to get the full response object back, even for handled errors.
		return await apiFetchUnion<DeleteApiResponse<{ wholesaler_id: number; name: string }, string[]>>(
			url,
			{ method: 'DELETE' },
			{ context: operationId }
		);
	} finally {
		// No catch block needed here, as the caller is responsible for handling the union response
		// and any potential thrown errors from unexpected server failures.
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Loads all categories assigned to a specific supplier using a predefined named query.
 * This is the primary pattern for fetching complex, relational n:m data.
 *
 * @param supplierId The ID of the supplier.
 * @returns A promise that resolves to an array of assigned categories with their offering counts.
 * @throws {ApiError} If the API call fails.
 */
export async function loadSupplierCategories(supplierId: number): Promise<WholesalerCategoryWithCount[]> {
	const operationId = `loadSupplierCategories-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		// This request object matches the `PredefinedQueryRequest` type.
		const request: PredefinedQueryRequest = {
			namedQuery: 'supplier_categories',
			payload: {
				select: [
					'w.wholesaler_id',
					'wc.category_id',
					'pc.name AS category_name',
					'wc.comment',
					'wc.link',
					'oc.offering_count' // This count comes from the predefined JOIN
				],
				where: {
					op: LogicalOperator.AND,
					conditions: [{ key: 'w.wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId }]
				},
				orderBy: [{ key: 'pc.name', direction: 'asc' }]
			}
		};

		// The body for this request is the entire `request` object.
		const responseData = await apiFetch<QueryResponseData<WholesalerCategoryWithCount>>(
			'/api/query',
			{ method: 'POST', body: createPostBody(request) },
			{ context: operationId }
		);
		return responseData.results as WholesalerCategoryWithCount[];
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}