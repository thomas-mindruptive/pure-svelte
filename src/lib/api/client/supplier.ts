// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for supplier-related operations.
 * This handles Supplier Master-Data CRUD and all direct Supplier compositions
 * (Category Assignments) according to the Composition-Prinzip.
 */

import { apiFetch, apiFetchUnion, createPostBody, createQueryBody, getErrorMessage, LoadingState } from './common';
import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { Wholesaler, WholesalerCategoryWithCount, ProductCategory, WholesalerCategory } from '$lib/domain/types';

// Import generic types from the single source of truth: common.ts
import type {
	CreateRequest,
	DeleteApiResponse,
	PredefinedQueryRequest,
	QueryResponseData,
	AssignmentRequest,
	RemoveAssignmentRequest,
	AssignmentSuccessData
} from '$lib/api/types/common';

// A dedicated loading state manager for all supplier-related operations.
export const supplierLoadingState = new LoadingState();

/**
 * The default query payload used when fetching a list of suppliers.
 * Ensures a consistent initial view.
 */
export const DEFAULT_SUPPLIER_QUERY: QueryPayload<Wholesaler> = {
	select: ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'website', 'created_at'],
	orderBy: [{ key: 'name', direction: 'asc' }],
	limit: 100
};

type SupplierCategoryDeleteResponse = DeleteApiResponse<
    { supplier_id: number; category_id: number; supplier_name: string; category_name: string }, 
    { offering_count: number }
>;

// ===== SUPPLIER MASTER-DATA CRUD =====

/**
 * Loads a list of suppliers from the secure entity endpoint `/api/suppliers`.
 *
 * @param query A partial `QueryPayload` to filter, sort, or paginate the results.
 * @returns A promise that resolves to an array of `Wholesaler` objects.
 * @throws {ApiError} If the API call fails for any reason.
 */
export async function loadSuppliers(query: Partial<QueryPayload<Wholesaler>> = {}): Promise<Wholesaler[]> {
	const operationId = 'loadSuppliers';
	supplierLoadingState.start(operationId);
	try {
		const fullQuery: QueryPayload<Wholesaler> = { ...DEFAULT_SUPPLIER_QUERY, ...query };

		const responseData = await apiFetch<QueryResponseData<Wholesaler>>(
			'/api/suppliers',
			{ method: 'POST', body: createQueryBody(fullQuery) },
			{ context: operationId }
		);

		return responseData.results as Wholesaler[];
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Loads a single, complete supplier object by its ID using a canonical GET request.
 *
 * @param supplierId The ID of the supplier to fetch.
 * @returns A promise that resolves to a single `Wholesaler` object.
 * @throws {ApiError} If the supplier is not found (404) or the API call fails.
 */
export async function loadSupplier(supplierId: number): Promise<Wholesaler> {
	const operationId = `loadSupplier-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		const responseData = await apiFetch<{ supplier: Wholesaler }>(
			`/api/suppliers/${supplierId}`,
			{ method: 'GET' },
			{ context: operationId }
		);

		return responseData.supplier;
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Creates a new supplier by calling the dedicated `/api/suppliers/new` endpoint.
 *
 * @param supplierData The data for the new supplier.
 * @returns A promise that resolves to the newly created `Wholesaler` object from the server.
 * @throws {ApiError} If validation fails (400) or another server error occurs.
 */
export async function createSupplier(
	supplierData: CreateRequest<Partial<Omit<Wholesaler, 'wholesaler_id'>>>
): Promise<Wholesaler> {
	const operationId = 'createSupplier';
	supplierLoadingState.start(operationId);
	try {
		const responseData = await apiFetch<{ supplier: Wholesaler }>(
			'/api/suppliers/new',
			{ method: 'POST', body: createPostBody(supplierData) },
			{ context: operationId }
		);
		return responseData.supplier;
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { supplierData, error: getErrorMessage(err) });
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
 * Deletes a supplier. This function uses `apiFetchUnion` to handle dependency conflicts.
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
		return await apiFetchUnion<DeleteApiResponse<{ wholesaler_id: number; name: string }, string[]>>(
			url,
			{ method: 'DELETE' },
			{ context: operationId }
		);
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

// ===== CATEGORY ASSIGNMENT CRUD (Supplier Compositions) =====

/**
 * Loads all categories assigned to a specific supplier using a predefined named query.
 * This is the primary pattern for fetching supplier's category compositions.
 *
 * @param supplierId The ID of the supplier.
 * @returns A promise that resolves to an array of assigned categories with their offering counts.
 * @throws {ApiError} If the API call fails.
 */
export async function loadCategoriesForSupplier(supplierId: number): Promise<WholesalerCategoryWithCount[]> {
	const operationId = `loadCategoriesForSupplier-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		const request: PredefinedQueryRequest = {
			namedQuery: 'supplier_categories',
			payload: {
				select: [
					'w.wholesaler_id',
					'wc.category_id',
					'pc.name AS category_name',
					'wc.comment',
					'wc.link',
					'oc.offering_count'
				],
				where: {
					op: LogicalOperator.AND,
					conditions: [{ key: 'w.wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId }]
				},
				orderBy: [{ key: 'pc.name', direction: 'asc' }]
			}
		};

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

/**
 * Loads all available categories from master table for assignment purposes.
 *
 * @returns A promise that resolves to an array of all available categories.
 * @throws {ApiError} If the API call fails.
 */
export async function loadAvailableCategories(): Promise<ProductCategory[]> {
	const operationId = 'loadAvailableCategories';
	supplierLoadingState.start(operationId);
	try {
		const query: QueryPayload<ProductCategory> = {
			select: ['category_id', 'name', 'description'],
			orderBy: [{ key: 'name', direction: 'asc' }]
		};

		const responseData = await apiFetch<QueryResponseData<ProductCategory>>(
			'/api/categories',
			{ method: 'POST', body: createQueryBody(query) },
			{ context: operationId }
		);

		return responseData.results as ProductCategory[];
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Gets available categories that are not yet assigned to a specific supplier.
 *
 * @param supplierId The ID of the supplier to check against.
 * @returns A promise that resolves to available categories for assignment.
 * @throws {ApiError} If the API call fails.
 */
export async function loadAvailableCategoriesForSupplier(supplierId: number): Promise<ProductCategory[]> {
	const operationId = `loadAvailableCategoriesForSupplier-${supplierId}`;
	supplierLoadingState.start(operationId);
	try {
		// Get all categories and assigned categories in parallel
		const [allCategories, assignedCategories] = await Promise.all([
			loadAvailableCategories(),
			loadCategoriesForSupplier(supplierId)
		]);

		const assignedIds = new Set(assignedCategories.map(c => c.category_id));
		const availableCategories = allCategories.filter(cat => !assignedIds.has(cat.category_id));

		log.info(`[${operationId}] Found ${availableCategories.length} available categories for supplier ${supplierId}`);
		return availableCategories;
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Assigns a category to a supplier (creates new composition relationship).
 *
 * @param assignmentData The assignment request data.
 * @returns A promise that resolves to the assignment response.
 * @throws {ApiError} If validation fails or assignment already exists.
 */
export async function assignCategoryToSupplier(assignmentData: {
	supplierId: number;
	categoryId: number;
	comment?: string;
	link?: string;
}): Promise<AssignmentSuccessData<WholesalerCategory>> {
	const operationId = 'assignCategoryToSupplier';
	supplierLoadingState.start(operationId);
	try {
		const requestBody: AssignmentRequest<number, number> = {
			parentId: assignmentData.supplierId,
			childId: assignmentData.categoryId,
			...(assignmentData.comment !== undefined && { comment: assignmentData.comment }),
			...(assignmentData.link !== undefined && { link: assignmentData.link })
		};

		const response = await apiFetch<AssignmentSuccessData<WholesalerCategory>>(
			'/api/supplier-categories',
			{ method: 'POST', body: createPostBody(requestBody) },
			{ context: operationId }
		);
		return response;
	} catch (err) {
		log.error(`[${operationId}] Failed.`, { assignmentData, error: getErrorMessage(err) });
		throw err;
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

/**
 * Removes a category assignment from a supplier (deletes composition relationship).
 *
 * @param removalData The removal request data.
 * @returns A promise that resolves to the full DeleteApiResponse union.
 * @throws {ApiError} Only for unexpected server errors.
 */
export async function removeCategoryFromSupplier(removalData: {
	supplierId: number;
	categoryId: number;
	cascade?: boolean;
}): Promise<SupplierCategoryDeleteResponse> {
	const operationId = 'removeCategoryFromSupplier';
	supplierLoadingState.start(operationId);
	try {
		const requestBody: RemoveAssignmentRequest<number, number> = {
			parentId: removalData.supplierId,
			childId: removalData.categoryId,
			cascade: removalData.cascade || false
		};

		return await apiFetchUnion<SupplierCategoryDeleteResponse>(
			'/api/supplier-categories',
			{ method: 'DELETE', body: createPostBody(requestBody) },
			{ context: operationId }
		);
	} finally {
		supplierLoadingState.finish(operationId);
	}
}

// ===== UTILITY FUNCTIONS =====

/**
 * Creates a composite ID for category assignment grid operations.
 * Used by DataGrid component for row identification.
 */
export function createCategoryCompositeId(supplierId: number, categoryId: number): string {
	return `${supplierId}-${categoryId}`;
}

/**
 * Parses a composite ID back to supplier and category IDs.
 */
export function parseCategoryCompositeId(compositeId: string): { supplierId: number; categoryId: number } | null {
	try {
		const [supplierIdStr, categoryIdStr] = compositeId.split('-');
		const supplierId = Number(supplierIdStr);
		const categoryId = Number(categoryIdStr);

		if (isNaN(supplierId) || isNaN(categoryId)) {
			return null;
		}

		return { supplierId, categoryId };
	} catch (error) {
		log.error('Failed to parse category composite ID', { compositeId, error });
		return null;
	}
}