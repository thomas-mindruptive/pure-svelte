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
import type { WholesalerCategoryWithCount, ProductCategory, WholesalerItemOffering_ProductDef_Category, WholesalerItemOffering } from '$lib/domain/types';

// Import generic types from the single source of truth: common.ts
import type {
    CreateRequest,
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
export const DEFAULT_CATEGORY_QUERY: QueryPayload<ProductCategory> = {
    select: ['category_id', 'name', 'description'],
    orderBy: [{ key: 'name', direction: 'asc' }],
    limit: 100
};

/**
 * Creates a new category by calling the dedicated `/api/categories/new` endpoint.
 *
 * @param categoryData The data for the new category.
 * @returns A promise that resolves to the newly created `ProductCategory` object from the server.
 * @throws {ApiError} If validation fails (400) or another server error occurs.
 */
export async function createCategory(
    categoryData: CreateRequest<Partial<Omit<ProductCategory, 'category_id'>>>
): Promise<ProductCategory> {
    const operationId = 'createCategory';
    supplierLoadingState.start(operationId);
    try {
        // Use `createPostBody` for the simple object body.
        const responseData = await apiFetch<{ category: ProductCategory }>(
            '/api/categories/new', // Correct endpoint for creation
            { method: 'POST', body: createPostBody(categoryData) },
            { context: operationId }
        );
        return responseData.category;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { categoryData, error: getErrorMessage(err) });
        throw err; // Re-throw the ApiError for the UI layer to handle.
    } finally {
        supplierLoadingState.finish(operationId);
    }
}

/**
 * Loads a list of categories from the secure entity endpoint `/api/categories`.
 * This function uses `apiFetch`, which returns the unwrapped `data` on success or
 * throws a structured `ApiError` on any failure.
 *
 * @param query A partial `QueryPayload` to filter, sort, or paginate the results.
 * @returns A promise that resolves to an array of `ProductCategory` objects.
 */
export async function loadCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
    const operationId = 'loadCategories';
    supplierLoadingState.start(operationId);
    try {
        const fullQuery: QueryPayload<ProductCategory> = { ...DEFAULT_CATEGORY_QUERY, ...query };

        // Use `createQueryBody` to wrap the payload in the `{ "payload": ... }` envelope.
        const responseData = await apiFetch<QueryResponseData<ProductCategory>>(
            '/api/categories',
            { method: 'POST', body: createQueryBody(fullQuery) },
            { context: operationId }
        );
        // The `results` are guaranteed to be at least `Partial<ProductCategory>[]`.
        // We cast to `ProductCategory[]` based on the knowledge that our default query fetches all required fields.
        return responseData.results as ProductCategory[];
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err; // Re-throw the ApiError for the UI layer to handle.
    } finally {
        supplierLoadingState.finish(operationId);
    }
}

/**
 * Loads a single, complete product category object by its ID using a canonical GET request.
 *
 * @param categoryId The ID of the category to fetch.
 * @returns A promise that resolves to a single `ProductCategory` object.
 * @throws {ApiError} If the category is not found (404) or the API call fails.
 */
export async function loadCategory(categoryId: number): Promise<ProductCategory> {
    const operationId = `loadCategory-${categoryId}`;
    supplierLoadingState.start(operationId);
    try {
        // apiFetch nutzt standardmäßig GET, kein Body nötig.
        const responseData = await apiFetch<{ category: ProductCategory }>(
            `/api/categories/${categoryId}`,
            { method: 'GET' }, 
            { context: operationId }
        );

        return responseData.category;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        supplierLoadingState.finish(operationId);
    }
}

/**
 * Loads a single, product category object by its ID from POST `/api/categories/[id]`.
 *
 * @param categoryId The ID of the category to fetch.
 * @returns A promise that resolves to a single `ProductCategory` object.
 * @throws {ApiError} If the category is not found or the API call fails.
 */
export async function loadCategoryWithQueryPayload(categoryId: number): Promise<ProductCategory> {
    const operationId = `loadCategory-${categoryId}`;
    supplierLoadingState.start(operationId);
    try {
        const query: QueryPayload<ProductCategory> = { select: ['category_id', 'name', 'description'], limit: 1 };
        const responseData = await apiFetch<QueryResponseData<ProductCategory>>(
            `/api/categories/${categoryId}`,
            { method: 'POST', body: createQueryBody(query) },
            { context: operationId }
        );

        if (responseData.results.length > 0) {
            return responseData.results[0] as ProductCategory;
        }
        // If the API returns a 200 OK but an empty results array, it's a "not found" case.
        throw new Error(`Category with ID ${categoryId} not found.`);
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        supplierLoadingState.finish(operationId);
    }
}

/**
 * Updates an existing product category with a partial data object.
 *
 * @param categoryId The ID of the category to update.
 * @param updates A partial `ProductCategory` object with the fields to update.
 * @returns A promise that resolves to the fully updated `ProductCategory` object from the server.
 * @throws {ApiError} If validation fails (400) or another error occurs.
 */
export async function updateCategory(categoryId: number, updates: Partial<ProductCategory>): Promise<ProductCategory> {
    const operationId = `updateCategory-${categoryId}`;
    supplierLoadingState.start(operationId);
    try {
        // Use `createPostBody` for simple object bodies.
        const responseData = await apiFetch<{ category: ProductCategory }>(
            `/api/categories/${categoryId}`,
            { method: 'PUT', body: createPostBody(updates) },
            { context: operationId }
        );
        return responseData.category;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
    } finally {
        supplierLoadingState.finish(operationId);
    }
}

/**
 * Deletes a product category. This function is special because it uses `apiFetchUnion`.
 * It does not throw an error on a 409 Conflict, but instead returns the structured
 * `DeleteConflictResponse` object for the UI to handle.
 *
 * @param categoryId The ID of the category to delete.
 * @param cascade Whether to perform a cascade delete of all related data.
 * @returns A promise that resolves to the full `DeleteApiResponse` union (success or conflict).
 * @throws {ApiError} Only for unexpected server errors (e.g., 500) or network failures.
 */
export async function deleteCategory(
    categoryId: number,
    cascade = false
): Promise<DeleteApiResponse<{ category_id: number; name: string }, string[]>> {
    const operationId = `deleteCategory-${categoryId}`;
    supplierLoadingState.start(operationId);
    try {
        const url = `/api/categories/${categoryId}${cascade ? '?cascade=true' : ''}`;
        // Use `apiFetchUnion` to get the full response object back, even for handled errors.
        return await apiFetchUnion<DeleteApiResponse<{ category_id: number; name: string }, string[]>>(
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
 * Loads all item offerings assigned to a specific supplier using a predefined named query.
 * This is the primary pattern for fetching complex, relational n:m data.
 *
 * @param categoryId The ID of the category.
 * @returns A promise that resolves to an array of assigned categories with their offering counts.
 * @throws {ApiError} If the API call fails.
 */
export async function loadSupplierItemOfferings(categoryId: number): Promise<WholesalerItemOffering[]> {
    const operationId = `loadSupplierItemOfferings-${categoryId}`;
    supplierLoadingState.start(operationId);
    try {
        // This request object matches the `PredefinedQueryRequest` type.
        const request: PredefinedQueryRequest = {
            namedQuery: 'wholesaler_category_offerings',
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
                    conditions: [{ key: 'wio.category_id', op: ComparisonOperator.EQUALS, val: categoryId }]
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
        return responseData.results as WholesalerItemOffering_ProductDef_Category[];
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        supplierLoadingState.finish(operationId);
    }
}