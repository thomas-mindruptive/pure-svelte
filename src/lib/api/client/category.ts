// src/lib/api/client/category.ts

/**
 * @file Category API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for category-related operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type {
    ProductCategory,
    ProductDefinition,
    WholesalerItemOffering,
    WholesalerItemOffering_ProductDef_Category
} from '$lib/domain/types';

import type { ApiClient } from './ApiClient';
import { createPostBody, createQueryBody, getErrorMessage } from './common';
import type {
    CreateChildRequest,
    PredefinedQueryRequest,
    QueryResponseData
} from '$lib/api/types/common';
import type {
    DeleteCategoryApiResponse,
    DeleteOfferingApiResponse
} from '$lib/api/app/appSpecificTypes'; // CORRECTED IMPORT PATH
import { LoadingState } from './loadingState';
import { productDefinitionLoadingOperations } from './productDefinition';


const categoryLoadingManager = new LoadingState();
export const categoryLoadingState = categoryLoadingManager.isLoadingStore;
export const categoryLoadingOperations = categoryLoadingManager;

export type OfferingWithDetails = WholesalerItemOffering_ProductDef_Category;

/**
 * Factory function to create a category-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all category and category-composition API methods.
 */
export function getCategoryApi(client: ApiClient) {
    return {

        // ===== CATEGORY MASTER-DATA CRUD =====

        /**
         * Loads a list of categories.
         */
        async loadCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
            const operationId = 'loadCategories';
            categoryLoadingOperations.start(operationId);
            try {
                const fullQuery: QueryPayload<ProductCategory> = {
                    select: ['category_id', 'name', 'description'],
                    orderBy: [{ key: 'name', direction: 'asc' }],
                    limit: 100,
                    ...query
                };
                const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
                    '/api/categories',
                    { method: 'POST', body: createQueryBody(fullQuery) },
                    { context: operationId }
                );
                return responseData.results as ProductCategory[];
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Loads a single category by its ID.
         */
        async loadCategory(categoryId: number): Promise<ProductCategory> {
            const operationId = `loadCategory-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ category: ProductCategory }>(
                    `/api/categories/${categoryId}`,
                    { method: 'GET' },
                    { context: operationId }
                );
                return responseData.category;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Creates a new category.
         */
        async createCategory(categoryData: Omit<ProductCategory, 'category_id'>): Promise<ProductCategory> {
            const operationId = 'createCategory';
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ category: ProductCategory }>(
                    '/api/categories/new',
                    { method: 'POST', body: createPostBody(categoryData) },
                    { context: operationId }
                );
                return responseData.category;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { categoryData, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Updates an existing category.
         */
        async updateCategory(categoryId: number, updates: Partial<ProductCategory>): Promise<ProductCategory> {
            const operationId = `updateCategory-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ category: ProductCategory }>(
                    `/api/categories/${categoryId}`,
                    { method: 'PUT', body: createPostBody(updates) },
                    { context: operationId }
                );
                return responseData.category;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Deletes a category with dependency checking.
         */
        async deleteCategory(categoryId: number, cascade = false): Promise<DeleteCategoryApiResponse> {
            const operationId = `deleteCategory-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const url = `/api/categories/${categoryId}${cascade ? '?cascade=true' : ''}`;
                return await client.apiFetchUnion<DeleteCategoryApiResponse>(
                    url,
                    { method: 'DELETE' },
                    { context: operationId }
                );
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        // ===== PRODUCT DEFINTIONS for category =====

        async loadProductDefsForCategory(
            categoryId: number
        ): Promise<ProductDefinition[]> {
            const operationId = `loadProductDefsForCategory-${categoryId}`;
            productDefinitionLoadingOperations.start(operationId);
            try {
                const query: QueryPayload<ProductDefinition> = {
                    from: { table: 'dbo.product_definitions', alias: 'pd' },
                    select: ['pd.product_def_id', 'pd.title', 'pd.category_id'],
                    where: {
                        key: 'pd.category_id',
                        whereCondOp: ComparisonOperator.EQUALS,
                        val: categoryId
                    },
                    orderBy: [{ key: 'pd.title', direction: 'asc' }]
                };

                const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
                    '/api/product-definitions', // Nutzt den Standard-Endpunkt
                    { method: 'POST', body: createQueryBody(query) },
                    { context: operationId }
                );
                return responseData.results as ProductDefinition[];
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { categoryId, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },


        // ===== OFFERING (Category Compositions) =====

        /**
         * Loads all offerings for a specific supplier and category.
         */
        async loadOfferingsForCategory(supplierId: number, categoryId: number): Promise<OfferingWithDetails[]> {
            const operationId = `loadOfferingsForCategory-${supplierId}-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const request: PredefinedQueryRequest = {
                    namedQuery: 'category_offerings',
                    payload: {
                        select: [
                            'wio.offering_id', 'wio.wholesaler_id', 'wio.category_id', 'wio.product_def_id',
                            'wio.price', 'wio.currency', 'wio.size', 'wio.dimensions', 'wio.comment', 'wio.created_at',
                            'pd.title AS product_def_title', 'pd.description AS product_def_description',
                            'pc.name AS category_name'
                        ],
                        where: {
                            whereCondOp: LogicalOperator.AND,
                            conditions: [
                                { key: 'wio.wholesaler_id', whereCondOp: ComparisonOperator.EQUALS, val: supplierId },
                                { key: 'wio.category_id', whereCondOp: ComparisonOperator.EQUALS, val: categoryId }
                            ]
                        },
                        orderBy: [{ key: 'wio.created_at', direction: 'desc' }]
                    }
                };
                const responseData = await client.apiFetch<QueryResponseData<OfferingWithDetails>>(
                    '/api/query',
                    { method: 'POST', body: createPostBody(request) },
                    { context: operationId }
                );
                return responseData.results as OfferingWithDetails[];
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Creates a new offering for a category.
         */
        async createOfferingForCategory(categoryId: number, offeringData: Omit<WholesalerItemOffering, 'offering_id'>): Promise<WholesalerItemOffering> {
            const operationId = 'createOfferingForCategory';
            categoryLoadingOperations.start(operationId);
            try {
                const requestBody: CreateChildRequest<ProductCategory, Omit<WholesalerItemOffering, 'offering_id'>> = {
                    parentId: categoryId,
                    data: offeringData
                };
                const responseData = await client.apiFetch<{ offering: WholesalerItemOffering }>(
                    '/api/category-offerings',
                    { method: 'POST', body: createPostBody(requestBody) },
                    { context: operationId }
                );
                return responseData.offering;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { offeringData, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Updates an existing offering.
         */
        async updateOffering(offeringId: number, updates: Partial<WholesalerItemOffering>): Promise<WholesalerItemOffering> {
            const operationId = `updateOffering-${offeringId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ offering: WholesalerItemOffering }>(
                    `/api/category-offerings`,
                    { method: 'PUT', body: createPostBody({ offering_id: offeringId, ...updates }) },
                    { context: operationId }
                );
                return responseData.offering;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Deletes an offering.
         */
        async deleteOffering(offeringId: number, cascade = false): Promise<DeleteOfferingApiResponse> {
            const operationId = `deleteOffering-${offeringId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const url = `/api/category-offerings`;
                const body = createPostBody({ offering_id: offeringId, cascade });
                return await client.apiFetchUnion<DeleteOfferingApiResponse>(
                    url,
                    { method: 'DELETE', body },
                    { context: operationId },
                );
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        }
    };
}