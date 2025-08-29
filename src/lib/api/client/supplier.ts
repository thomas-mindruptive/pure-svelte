// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for supplier-related operations.
 * This module follows the Factory Pattern to ensure SSR safety by depending on a
 * context-aware ApiClient instance.
 */

import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { Wholesaler, WholesalerCategoryWithCount, ProductCategory, WholesalerCategory } from '$lib/domain/types';

import type { ApiClient } from './ApiClient';
import { createPostBody, createQueryBody, getErrorMessage } from './common';
import type {
	PredefinedQueryRequest,
	QueryResponseData,
	AssignmentRequest,
	RemoveAssignmentRequest,
	AssignmentSuccessData
} from '$lib/api/types/common';
import type { 
    DeleteSupplierApiResponse, 
    RemoveCategoryApiResponse
} from '$lib/api/app/appSpecificTypes';
import { LoadingState } from './loadingState';

// Loading state managers remain global as they are a client-side concern.
const supplierLoadingManager = new LoadingState();
export const supplierLoadingState = supplierLoadingManager.isLoadingStore;
export const supplierLoadingOperations = supplierLoadingManager;

/**
 * The default query payload used when fetching a list of suppliers.
 */
export const DEFAULT_SUPPLIER_QUERY: QueryPayload<Wholesaler> = {
	select: ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'website', 'created_at'],
	orderBy: [{ key: 'name', direction: 'asc' }],
	limit: 100
};

/**
 * Factory function to create a supplier-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all supplier API methods.
 */
export function getSupplierApi(client: ApiClient) {
  const api = {
    
    // ===== SUPPLIER MASTER-DATA CRUD =====

    /**
     * Loads a list of suppliers.
     */
    async loadSuppliers(query: Partial<QueryPayload<Wholesaler>> = {}): Promise<Wholesaler[]> {
      const operationId = 'loadSuppliers';
      supplierLoadingOperations.start(operationId);
      try {
        const fullQuery: QueryPayload<Wholesaler> = { ...DEFAULT_SUPPLIER_QUERY, ...query };
        const responseData = await client.apiFetch<QueryResponseData<Wholesaler>>(
          '/api/suppliers',
          { method: 'POST', body: createQueryBody(fullQuery) },
          { context: operationId }
        );
        return responseData.results as Wholesaler[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads a single, complete supplier object by its ID.
     */
    async loadSupplier(supplierId: number): Promise<Wholesaler> {
      const operationId = `loadSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ supplier: Wholesaler }>(
          `/api/suppliers/${supplierId}`,
          { method: 'GET' },
          { context: operationId }
        );
        return responseData.supplier;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new supplier.
     */
    async createSupplier(supplierData: Partial<Omit<Wholesaler, 'wholesaler_id'>>): Promise<Wholesaler> {
      const operationId = 'createSupplier';
      supplierLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ supplier: Wholesaler }>(
          '/api/suppliers/new',
          { method: 'POST', body: createPostBody(supplierData) },
          { context: operationId }
        );
        return responseData.supplier;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { supplierData, error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing supplier.
     */
    async updateSupplier(supplierId: number, updates: Partial<Wholesaler>): Promise<Wholesaler> {
      const operationId = `updateSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ supplier: Wholesaler }>(
          `/api/suppliers/${supplierId}`,
          { method: 'PUT', body: createPostBody(updates) },
          { context: operationId }
        );
        return responseData.supplier;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Deletes a supplier.
     */
    async deleteSupplier(supplierId: number, cascade = false): Promise<DeleteSupplierApiResponse> {
      const operationId = `deleteSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const url = `/api/suppliers/${supplierId}${cascade ? '?cascade=true' : ''}`;
        return await client.apiFetchUnion<DeleteSupplierApiResponse>(
          url,
          { method: 'DELETE' },
          { context: operationId }
        );
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    // ===== CATEGORY ASSIGNMENT CRUD =====

    /**
     * Loads categories assigned to a supplier.
     */
    async loadCategoriesForSupplier(supplierId: number): Promise<WholesalerCategoryWithCount[]> {
      const operationId = `loadCategoriesForSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const request: PredefinedQueryRequest = {
          namedQuery: 'supplier_categories',
          payload: {
            select: ['w.wholesaler_id', 'wc.category_id', 'pc.name AS category_name', 'wc.comment', 'wc.link'],
            where: { op: LogicalOperator.AND, conditions: [{ key: 'w.wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId }] },
            orderBy: [{ key: 'pc.name', direction: 'asc' }]
          }
        };
        const responseData = await client.apiFetch<QueryResponseData<WholesalerCategoryWithCount>>(
          '/api/query',
          { method: 'POST', body: createPostBody(request) },
          { context: operationId }
        );
        return responseData.results as WholesalerCategoryWithCount[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads all available categories from master data.
     */
    async loadAvailableCategories(): Promise<ProductCategory[]> {
      const operationId = 'loadAvailableCategories';
      supplierLoadingOperations.start(operationId);
      try {
        const query: QueryPayload<ProductCategory> = {
          select: ['category_id', 'name', 'description'],
          orderBy: [{ key: 'name', direction: 'asc' }]
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
          '/api/categories',
          { method: 'POST', body: createQueryBody(query) },
          { context: operationId }
        );
        return responseData.results as ProductCategory[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Gets available categories that are not yet assigned to a specific supplier.
     */
    async loadAvailableCategoriesForSupplier(supplierId: number): Promise<ProductCategory[]> {
        const operationId = `loadAvailableCategoriesForSupplier-${supplierId}`;
        supplierLoadingOperations.start(operationId);
        try {
            const [allCategories, assignedCategories] = await Promise.all([
                api.loadAvailableCategories(),
                api.loadCategoriesForSupplier(supplierId)
            ]);
    
            const assignedIds = new Set(assignedCategories.map(c => c.category_id));
            const availableCategories = allCategories.filter(cat => !assignedIds.has(cat.category_id));
    
            log.info(`[${operationId}] Found ${availableCategories.length} available categories for supplier ${supplierId}`);
            return availableCategories;
        } catch (err) {
            log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
            throw err;
        } finally {
            supplierLoadingOperations.finish(operationId);
        }
    },

    /**
     * Assigns a category to a supplier.
     */
    async assignCategoryToSupplier(assignmentData: { supplierId: number; categoryId: number; comment?: string; link?: string; }): Promise<AssignmentSuccessData<WholesalerCategory>> {
      const operationId = 'assignCategoryToSupplier';
      supplierLoadingOperations.start(operationId);
      try {
        const requestBody: AssignmentRequest<Wholesaler, ProductCategory, { comment?: string; link?: string }> = {
          parentId: assignmentData.supplierId,
          childId: assignmentData.categoryId,
          ...(assignmentData.comment !== undefined && { comment: assignmentData.comment }),
          ...(assignmentData.link !== undefined && { link: assignmentData.link })
        };
        const response = await client.apiFetch<AssignmentSuccessData<WholesalerCategory>>(
          '/api/supplier-categories',
          { method: 'POST', body: createPostBody(requestBody) },
          { context: operationId }
        );
        return response;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { assignmentData, error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Removes a category assignment from a supplier.
     */
    async removeCategoryFromSupplier(removalData: { supplierId: number; categoryId: number; cascade?: boolean; }): Promise<RemoveCategoryApiResponse> {
      const operationId = 'removeCategoryFromSupplier';
      supplierLoadingOperations.start(operationId);
      try {
        const requestBody: RemoveAssignmentRequest<Wholesaler, ProductCategory> = {
          parentId: removalData.supplierId,
          childId: removalData.categoryId,
          cascade: removalData.cascade || false
        };
        return await client.apiFetchUnion<RemoveCategoryApiResponse>(
          '/api/supplier-categories',
          { method: 'DELETE', body: createPostBody(requestBody) },
          { context: operationId }
        );
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    }
  };
  return api;
}