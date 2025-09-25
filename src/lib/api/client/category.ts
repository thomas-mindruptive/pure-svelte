// src/lib/api/client/category.ts

/**
 * @file Category API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for category-related operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from "$lib/utils/logger";
import { ComparisonOperator, type QueryPayload, type SortDescriptor, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
import type {
  ProductCategory,
  ProductDefinition,
  Wholesaler,
  WholesalerItemOffering_ProductDef_Category_Supplier,
} from "$lib/domain/domainTypes";
import type { ApiClient } from "./ApiClient";
import { createPostBody, createQueryBody, getErrorMessage } from "./common";
import type { PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { DeleteCategoryApiResponse } from "$lib/api/app/appSpecificTypes"; // CORRECTED IMPORT PATH
import { LoadingState } from "./loadingState";
const categoryLoadingManager = new LoadingState();
export const categoryLoadingState = categoryLoadingManager.isLoadingStore;

export type OfferingWithDetails = WholesalerItemOffering_ProductDef_Category_Supplier;

/**
 * Factory function to create a category-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all category and category-composition API methods.
 */
export function getCategoryApi(client: ApiClient) {
  const api =  {
    // ===== CATEGORY MASTER-DATA CRUD =====

    /**
     * Loads a list of categories.
     */
    async loadCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
      const operationId = "loadCategories";
      categoryLoadingManager.start(operationId);
      try {
        const fullQuery: QueryPayload<ProductCategory> = {
          select: ["category_id", "name", "description"],
          orderBy: [{ key: "name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
          "/api/categories",
          { method: "POST", body: createQueryBody(fullQuery) },
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
      const res = api.loadCategories(queryPartial);
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
          { method: "POST", body: createPostBody(categoryData) },
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
          { method: "PUT", body: createPostBody(updates) },
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
        const body = createPostBody({ cascade, forceCascade });
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
        const query: QueryPayload<ProductDefinition> = {
          from: { table: "dbo.product_definitions", alias: "pd" },
          select: ["pd.product_def_id", "pd.title", "pd.category_id"],
          where: {
            key: "pd.category_id",
            whereCondOp: ComparisonOperator.EQUALS,
            val: categoryId,
          },
          orderBy: [{ key: "pd.title", direction: "asc" }],
        };

        const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
          "/api/product-definitions", // Nutzt den Standard-Endpunkt
          { method: "POST", body: createQueryBody(query) },
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
     * Loads all suppliers that are assigned to a specific product category.
     * This function utilizes the predefined 'supplier_categories' join configuration on the server,
     * which connects wholesalers, wholesaler_categories, and product_categories.
     * @param categoryId The ID of the category for which to load the assigned suppliers.
     * @returns A promise that resolves to an array of Wholesaler objects.
     */
    async loadSuppliersForCategory(categoryId: number): Promise<Wholesaler[]> {
      const operationId = `loadSuppliersForCategory-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        // 1. Define the request object for the generic /api/query endpoint.
        const request: PredefinedQueryRequest = {
          // 2. Specify the name of the server-side join configuration to use.
          //    This join correctly links wholesalers (w) to product_categories (pc).
          namedQuery: "supplier_categories",
          payload: {
            // 3. Select only the columns from the 'wholesalers' table (aliased as 'w').
            //    This ensures the result matches the Wholesaler type.
            select: ["w.wholesaler_id", "w.name", "w.country", "w.region", "w.status", "w.dropship"],
            // 4. Filter the result set by the provided categoryId.
            //    The alias for the product_categories table in the join is 'pc'.
            where: {
              key: "pc.category_id",
              whereCondOp: ComparisonOperator.EQUALS,
              val: categoryId,
            },
            // 5. Order the results alphabetically by the supplier's name for a consistent UI.
            orderBy: [{ key: "w.name", direction: "asc" }],
          },
        };

        // 6. Send the request to the generic query endpoint.
        const responseData = await client.apiFetch<QueryResponseData<Wholesaler>>(
          "/api/query",
          { method: "POST", body: createPostBody(request) },
          { context: operationId },
        );

        // 7. Return the list of suppliers from the response.
        return responseData.results as Wholesaler[];
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
    async loadOfferingsForSupplierCategory(supplierId: number, categoryId: number): Promise<OfferingWithDetails[]> {
      const operationId = `loadOfferingsForSupplierCategory-${supplierId}-${categoryId}`;
      categoryLoadingManager.start(operationId);
      try {
        const request: PredefinedQueryRequest = {
          namedQuery: "category_offerings",
          payload: {
            select: [
              "wio.offering_id",
              "wio.wholesaler_id",
              "wio.category_id",
              "wio.product_def_id",
              "wio.price",
              "wio.currency",
              "wio.size",
              "wio.dimensions",
              "wio.comment",
              "wio.created_at",
              "pd.title AS product_def_title",
              "pd.description AS product_def_description",
              "pc.name AS category_name",
            ],
            where: {
              whereCondOp: "AND",
              conditions: [
                { key: "wio.wholesaler_id", whereCondOp: "=", val: supplierId },
                { key: "wio.category_id", whereCondOp: "=", val: categoryId },
              ],
            },
            orderBy: [{ key: "wio.created_at", direction: "desc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<OfferingWithDetails>>(
          "/api/query",
          { method: "POST", body: createPostBody(request) },
          { context: operationId },
        );
        return responseData.results as OfferingWithDetails[];
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
