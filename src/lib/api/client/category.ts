// src/lib/api/client/category.ts

/**
 * @file Category API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for category-related operations.
 * This handles Category Master-Data CRUD and all direct Category compositions
 * (Offerings) according to the Composition-Prinzip.
 */

import { apiFetch, apiFetchUnion, createPostBody, createQueryBody, getErrorMessage, LoadingState } from './common';
import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type {
    ProductCategory,
    WholesalerItemOffering,
    WholesalerItemOffering_ProductDef_Category
} from '$lib/domain/types';

// Import generic types from the single source of truth: common.ts
import type {
    CreateRequest,
    DeleteApiResponse,
    PredefinedQueryRequest,
    QueryResponseData
} from '$lib/api/types/common';

// A dedicated loading state manager for all category-related operations.
export const categoryLoadingState = new LoadingState();

// Type aliases for better readability
export type OfferingWithDetails = WholesalerItemOffering_ProductDef_Category;

/**
 * The default query payload used when fetching categories.
 */
export const DEFAULT_CATEGORY_QUERY: QueryPayload<ProductCategory> = {
    select: ['category_id', 'name', 'description'],
    orderBy: [{ key: 'name', direction: 'asc' }],
    limit: 100
};

/**
 * The default query payload used when fetching offerings.
 */
export const DEFAULT_OFFERING_QUERY: QueryPayload<WholesalerItemOffering> = {
    select: ['offering_id', 'wholesaler_id', 'category_id', 'product_def_id', 'price', 'currency', 'size', 'dimensions', 'comment', 'created_at'],
    orderBy: [{ key: 'created_at', direction: 'desc' }],
    limit: 100
};

// ===== CATEGORY MASTER-DATA CRUD =====

/**
 * Loads a list of categories from the secure entity endpoint `/api/categories`.
 *
 * @param query A partial `QueryPayload` to filter, sort, or paginate the results.
 * @returns A promise that resolves to an array of `ProductCategory` objects.
 * @throws {ApiError} If the API call fails.
 */
export async function loadCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
    const operationId = 'loadCategories';
    categoryLoadingState.start(operationId);
    try {
        const fullQuery: QueryPayload<ProductCategory> = { ...DEFAULT_CATEGORY_QUERY, ...query };

        const responseData = await apiFetch<QueryResponseData<ProductCategory>>(
            '/api/categories',
            { method: 'POST', body: createQueryBody(fullQuery) },
            { context: operationId }
        );

        return responseData.results as ProductCategory[];
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        categoryLoadingState.finish(operationId);
    }
}

/**
 * Loads a single category by its ID using a canonical GET request.
 *
 * @param categoryId The ID of the category to fetch.
 * @returns A promise that resolves to a single `ProductCategory` object.
 * @throws {ApiError} If the category is not found (404) or the API call fails.
 */
export async function loadCategory(categoryId: number): Promise<ProductCategory> {
    const operationId = `loadCategory-${categoryId}`;
    categoryLoadingState.start(operationId);
    try {
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
        categoryLoadingState.finish(operationId);
    }
}

/**
 * Creates a new category by calling the dedicated `/api/categories/new` endpoint.
 *
 * @param categoryData The data for the new category.
 * @returns A promise that resolves to the newly created `ProductCategory` object.
 * @throws {ApiError} If validation fails (400) or another server error occurs.
 */
export async function createCategory(
    categoryData: CreateRequest<Partial<Omit<ProductCategory, 'category_id'>>>
): Promise<ProductCategory> {
    const operationId = 'createCategory';
    categoryLoadingState.start(operationId);
    try {
        const responseData = await apiFetch<{ category: ProductCategory }>(
            '/api/categories/new',
            { method: 'POST', body: createPostBody(categoryData) },
            { context: operationId }
        );
        return responseData.category;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { categoryData, error: getErrorMessage(err) });
        throw err;
    } finally {
        categoryLoadingState.finish(operationId);
    }
}

/**
 * Updates an existing category with a partial data object.
 *
 * @param categoryId The ID of the category to update.
 * @param updates A partial `ProductCategory` object with the fields to update.
 * @returns A promise that resolves to the fully updated `ProductCategory` object.
 * @throws {ApiError} If validation fails (400) or another error occurs.
 */
export async function updateCategory(categoryId: number, updates: Partial<ProductCategory>): Promise<ProductCategory> {
    const operationId = `updateCategory-${categoryId}`;
    categoryLoadingState.start(operationId);
    try {
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
        categoryLoadingState.finish(operationId);
    }
}

/**
 * Deletes a category with dependency checking.
 *
 * @param categoryId The ID of the category to delete.
 * @param cascade Whether to perform a cascade delete of all related data.
 * @returns A promise that resolves to the full DeleteApiResponse union.
 * @throws {ApiError} Only for unexpected server errors.
 */
export async function deleteCategory(
    categoryId: number,
    cascade = false
): Promise<DeleteApiResponse<{ category_id: number; name: string }, string[]>> {
    const operationId = `deleteCategory-${categoryId}`;
    categoryLoadingState.start(operationId);
    try {
        const url = `/api/categories/${categoryId}${cascade ? '?cascade=true' : ''}`;
        return await apiFetchUnion<DeleteApiResponse<{ category_id: number; name: string }, string[]>>(
            url,
            { method: 'DELETE' },
            { context: operationId }
        );
    } finally {
        categoryLoadingState.finish(operationId);
    }
}

// ===== OFFERING CRUD (Category Compositions) =====

/**
 * Loads all offerings for a specific supplier and category using a predefined named query.
 * This provides enriched data with product and category details.
 *
 * @param supplierId The ID of the supplier.
 * @param categoryId The ID of the category.
 * @returns A promise that resolves to an array of offerings with details.
 * @throws {ApiError} If the API call fails.
 */
export async function loadOfferingsForCategory(supplierId: number, categoryId: number): Promise<OfferingWithDetails[]> {
    const operationId = `loadOfferingsForCategory-${supplierId}-${categoryId}`;
    categoryLoadingState.start(operationId);
    try {
        const request: PredefinedQueryRequest = {
            namedQuery: 'category_offerings',
            payload: {
                select: [
                    'wio.offering_id',
                    'wio.wholesaler_id',
                    'wio.category_id',
                    'wio.product_def_id',
                    'wio.price',
                    'wio.currency',
                    'wio.size',
                    'wio.dimensions',
                    'wio.comment',
                    'wio.created_at',
                    'pd.title AS product_def_title',
                    'pd.description AS product_def_description',
                    'pc.name AS category_name'
                ],
                where: {
                    op: LogicalOperator.AND,
                    conditions: [
                        { key: 'wio.wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId },
                        { key: 'wio.category_id', op: ComparisonOperator.EQUALS, val: categoryId }
                    ]
                },
                orderBy: [{ key: 'wio.created_at', direction: 'desc' }]
            }
        };

        const responseData = await apiFetch<QueryResponseData<OfferingWithDetails>>(
            '/api/query',
            { method: 'POST', body: createPostBody(request) },
            { context: operationId }
        );
        return responseData.results as OfferingWithDetails[];
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        categoryLoadingState.finish(operationId);
    }
}



/**
 * Creates a new offering for a category.
 *
 * @param offeringData The data for the new offering.
 * @returns A promise that resolves to the newly created offering.
 * @throws {ApiError} If validation fails or another server error occurs.
 */
export async function createOfferingForCategory(
    offeringData: CreateRequest<Partial<Omit<WholesalerItemOffering, 'offering_id'>>>
): Promise<WholesalerItemOffering> {
    const operationId = 'createOfferingForCategory';
    categoryLoadingState.start(operationId);
    try {
        const responseData = await apiFetch<{ offering: WholesalerItemOffering }>(
            '/api/category-offerings',
            { method: 'POST', body: createPostBody(offeringData) },
            { context: operationId }
        );
        return responseData.offering;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringData, error: getErrorMessage(err) });
        throw err;
    } finally {
        categoryLoadingState.finish(operationId);
    }
}

/**
 * Updates an existing offering.
 *
 * @param offeringId The ID of the offering to update.
 * @param updates A partial offering object with the fields to update.
 * @returns A promise that resolves to the fully updated offering.
 * @throws {ApiError} If validation fails or another error occurs.
 */
export async function updateOffering(offeringId: number, updates: Partial<WholesalerItemOffering>): Promise<WholesalerItemOffering> {
    const operationId = `updateOffering-${offeringId}`;
    categoryLoadingState.start(operationId);
    try {
        const responseData = await apiFetch<{ offering: WholesalerItemOffering }>(
            `/api/category-offerings`,
            { method: 'PUT', body: createPostBody({ offering_id: offeringId, ...updates }) },
            { context: operationId }
        );
        return responseData.offering;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
    } finally {
        categoryLoadingState.finish(operationId);
    }
}

/**
 * Deletes an offering with dependency checking (attributes, links).
 *
 * @param offeringId The ID of the offering to delete.
 * @param cascade Whether to perform a cascade delete of all related data.
 * @returns A promise that resolves to the full DeleteApiResponse union.
 * @throws {ApiError} Only for unexpected server errors.
 */
export async function deleteOffering(
    offeringId: number,
    cascade = false
): Promise<DeleteApiResponse<{ offering_id: number }, string[]>> {
    const operationId = `deleteOffering-${offeringId}`;
    categoryLoadingState.start(operationId);
    try {
        const url = `/api/category-offerings`;
        const body = createPostBody({ offering_id: offeringId, cascade });
        return await apiFetchUnion<DeleteApiResponse<{ offering_id: number}, string[]>>(
            url,
            { method: 'DELETE', body },
            { context: operationId },

        );
    } finally {
        categoryLoadingState.finish(operationId);
    }
}