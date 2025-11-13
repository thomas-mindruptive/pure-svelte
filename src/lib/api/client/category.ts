// src/lib/api/client/category.ts

/**
 * @file Category API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for category-related operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryResponseData } from "$lib/api/api.types"; // <refact01> Removed PredefinedQueryRequest (no more supplier_categories query)
import type { DeleteCategoryApiResponse } from "$lib/api/app/appSpecificTypes"; // CORRECTED IMPORT PATH
import {
  ComparisonOperator,
  type QueryPayload,
  type QueryPayloadPartial,
  type SortDescriptor,
  type WhereCondition,
  type WhereConditionGroup,
} from "$lib/backendQueries/queryGrammar";
import {
  type ProductCategory,
  ProductCategorySchema,
  type CategoryWithOfferingCount,
  CategoryWithOfferingCountSchema,
  type ProductDefinition,
  type Wholesaler,
  type WholesalerItemOffering,
  type Wio_PDef_Cat_Supp_Nested_WithLinks
} from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./apiClient";
import { createJsonAndWrapInPayload, createJsonAndWrapInPayloadPartial, createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";
import { getOfferingApi } from "./offering";
import { getSupplierApi } from "./supplier"; // <refact01> For loadSuppliersForCategory
const categoryLoadingManager = new LoadingState();
export const categoryLoadingState = categoryLoadingManager.isLoadingStore;

/**
 * Factory function to create a category-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all category and category-composition API methods.
 */
export function getCategoryApi(client: ApiClient) {
  const api = {
    // ===== CATEGORY MASTER-DATA CRUD =====

    /**
     * Loads a list of categories.
     */
    async loadCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
      const operationId = "loadCategories";
      categoryLoadingManager.start(operationId);
      try {
        const cols = genTypedQualifiedColumns(ProductCategorySchema, false);
        const fullQuery: QueryPayload<ProductCategory> = {
          select: cols,
          orderBy: [{ key: "pc.name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
          "/api/categories",
          { method: "POST", body: createJsonAndWrapInPayload(fullQuery) },
          { context: operationId },
        );
        return responseData.results as ProductCategory[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads categories with offering count from the view_categories_with_offering_count view.
     * Supports filtering and sorting through query payload.
     */
    async loadCategoriesWithOfferingCount(
      query: Partial<QueryPayload<CategoryWithOfferingCount>> = {}
    ): Promise<CategoryWithOfferingCount[]> {
      const operationId = "loadCategoriesWithOfferingCount";
      categoryLoadingManager.start(operationId);
      try {
        const cols = genTypedQualifiedColumns(CategoryWithOfferingCountSchema, false);
        const fullQuery: QueryPayload<CategoryWithOfferingCount> = {
          from: { table: "dbo.view_categories_with_offering_count", alias: "cwoc" },
          select: cols,
          orderBy: [{ key: "cwoc.category_name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const responseData = await client.apiFetch<QueryResponseData<CategoryWithOfferingCount>>(
          "/api/query",
          { method: "POST", body: createJsonAndWrapInPayload(fullQuery) },
          { context: operationId },
        );
        return responseData.results as CategoryWithOfferingCount[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads suppliers based on "where" and "orderBy".
     * @param where
     * @param orderBy
     * @returns
     */
    async loadCategoriesWithWhereAndOrder(
      where: WhereConditionGroup<ProductCategory> | null,
      orderBy: SortDescriptor<ProductCategory>[] | null,
    ): Promise<ProductCategory[]> {
      const queryPartial: Partial<QueryPayload<ProductCategory>> = {};
      if (where) {
        queryPartial.where = where;
      }
      if (orderBy) {
        queryPartial.orderBy = orderBy;
      }
      const res = await api.loadCategories(queryPartial);
      return res;
    },

    /**
     * Loads a single category by its ID.
     */
    async loadCategory(categoryId: number): Promise<ProductCategory> {
      const operationId = `loadCategory-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ category: ProductCategory }>(
          `/api/categories/${categoryId}`,
          { method: "GET" },
          { context: operationId },
        );
        return responseData.category;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new category.
     */
    async createCategory(categoryData: Omit<ProductCategory, "category_id">): Promise<ProductCategory> {
      const operationId = "createCategory";
      categoryLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ category: ProductCategory }>(
          "/api/categories/new",
          { method: "POST", body: createJsonBody(categoryData) },
          { context: operationId },
        );
        return responseData.category;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { categoryData, error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing category.
     */
    async updateCategory(categoryId: number, updates: Partial<ProductCategory>): Promise<ProductCategory> {
      const operationId = `updateCategory-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ category: ProductCategory }>(
          `/api/categories/${categoryId}`,
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
        );
        return responseData.category;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    /**
     * Deletes a category with dependency checking.
     */
    async deleteCategory(categoryId: number, cascade = false, forceCascade = false): Promise<DeleteCategoryApiResponse> {
      const operationId = `deleteCategory-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        const url = `/api/categories/${categoryId}`;
        const body = createJsonBody({ cascade, forceCascade });
        return await client.apiFetchUnion<DeleteCategoryApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    // ===== PRODUCT DEFINTIONS for category =====

    async loadProductDefsForCategory(categoryId: number): Promise<ProductDefinition[]> {
      const operationId = `loadProductDefsForCategory-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        // TODO: All endpoints should check null or empty payload. Either use default or return ApiErrorResponse.
        // /api/product-definitions handles it corretly already.
        const query: QueryPayloadPartial<ProductDefinition> = {
          where: {
            key: "pd.category_id",
            whereCondOp: ComparisonOperator.EQUALS,
            val: categoryId,
          },
          orderBy: [{ key: "pd.title", direction: "asc" }],
        };

        const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
          "/api/product-definitions",
          { method: "POST", body: createJsonAndWrapInPayloadPartial(query) },
          { context: operationId },
        );
        return responseData.results as ProductDefinition[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { categoryId, error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    // ===== SUPPLIERS  =====

    /**
     * <refact01> CHANGED: No more category assignments - loads ALL suppliers
     * Loads all suppliers (any supplier can create offerings for any category).
     * @param categoryId The ID of the category (kept for API compatibility, not used)
     * @returns A promise that resolves to an array of Wholesaler objects.
     */
    async loadSuppliersForCategory(categoryId: number): Promise<Wholesaler[]> {
      const operationId = `loadSuppliersForCategory-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        // <refact01> CHANGED: Use supplierApi.loadSuppliers() - no category filtering
        const supplierApi = getSupplierApi(client);
        return await supplierApi.loadSuppliers();
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { categoryId, error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },

    // ===== OFFERING (Category Compositions) =====

    /**
     * Loads all offerings for a specific supplier and category.
     */
    async loadOfferingsForSupplierCategory(supplierId: number, categoryId: number): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> {
      const operationId = `loadOfferingsForSupplierCategory-${supplierId}-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        const offeringClient = getOfferingApi(client);
        const orderBy: SortDescriptor<WholesalerItemOffering>[] = [{ key: "wio.created_at", direction: "desc" }];

        const where: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering> = {
          whereCondOp: "AND",
          conditions: [
            { key: "wio.wholesaler_id", whereCondOp: "=", val: supplierId },
            { key: "wio.category_id", whereCondOp: "=", val: categoryId },
          ],
        };
        const offerings = await offeringClient.loadNestedOfferingsWithLinks(where, orderBy);
        return offerings;

      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingManager.finish(operationId);
      }
    },
  };

  return api;
}
