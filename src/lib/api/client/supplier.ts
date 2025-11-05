// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for supplier-related operations.
 * This module follows the Factory Pattern to ensure SSR safety by depending on a
 * context-aware ApiClient instance.
 */

import {
  ComparisonOperator,
  /* <refact01> DEPRECATED: wholesaler_categories removed
  LogicalOperator,
  */
  type QueryPayload,
  type SortDescriptor,
  type WhereCondition,
  type WhereConditionGroup,
} from "$lib/backendQueries/queryGrammar";
import {
  Order_Wholesaler_Schema,
  Wio_PDef_Cat_Supp_Nested_Schema,
  WholesalerSchema,
  type Order_Wholesaler,
  type ProductCategory,
  type Wholesaler,
  /* <refact01> DEPRECATED: wholesaler_categories removed
  type WholesalerCategory,
  type WholesalerCategory_Category,
  type WholesalerCategoryWithCount,
  */
  type Wio_PDef_Cat_Supp_Nested,
  /* <refact01> DEPRECATED: wholesaler_categories removed
  WholesalerCategory_Category_Nested_Schema,
  type WholesalerCategory_Category_Nested,
  */
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

import type {
  ApiValidationError,
  /* <refact01> DEPRECATED: wholesaler_categories removed
  AssignmentRequest,
  AssignmentSuccessData,
  */
  PredefinedQueryRequest,
  QueryResponseData,
  /* <refact01> DEPRECATED: wholesaler_categories removed
  RemoveAssignmentRequest,
  */
} from "$lib/api/api.types";
import type { DeleteSupplierApiResponse /* <refact01> , RemoveCategoryApiResponse */ } from "$lib/api/app/appSpecificTypes";
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";
import { genTypedQualifiedColumns, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
import type { ApiClient } from "./apiClient";
import { createJsonAndWrapInPayload, createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";
import { getCategoryApi } from "./category"; // <refact01> For mini wrapper methods

// Loading state managers remain global as they are a client-side concern.
const supplierLoadingManager = new LoadingState();
export const supplierLoadingState = supplierLoadingManager.isLoadingStore;
export const supplierLoadingOperations = supplierLoadingManager;

/**
 * The default query payload used when fetching a list of suppliers.
 */
//const supplierCols = genQualifiedColumns(WholesalerSchema, TableRegistry)
export const DEFAULT_SUPPLIER_QUERY: QueryPayload<Wholesaler> = {
  select: [
    "wholesaler_id",
    "name",
    "country",
    "region",
    "price_range",
    "relevance",
    "status",
    "dropship",
    "website",
    "created_at",
    "email",
  ],
  orderBy: [{ key: "name", direction: "asc" }],
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
      const operationId = "loadSuppliers";
      supplierLoadingOperations.start(operationId);
      try {
        const fullQuery: QueryPayload<Wholesaler> = { ...DEFAULT_SUPPLIER_QUERY, ...query };
        const responseData = await client.apiFetch<QueryResponseData<Wholesaler>>(
          "/api/suppliers",
          { method: "POST", body: createJsonAndWrapInPayload(fullQuery) },
          { context: operationId },
        );
        log.info(`loadSuppliers: successful.`, responseData);
        return responseData.results as Wholesaler[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads suppliers based on "where" and "orderBy".
     * @param where
     * @param orderBy
     * @returns
     */
    async loadSuppliersWithWhereAndOrder(
      where: WhereConditionGroup<Wholesaler> | null,
      orderBy: SortDescriptor<Wholesaler>[] | null,
    ): Promise<Wholesaler[]> {
      const queryPartial: Partial<QueryPayload<Wholesaler>> = {};
      if (where) {
        queryPartial.where = where;
      }
      if (orderBy) {
        queryPartial.orderBy = orderBy;
      }
      const res = await api.loadSuppliers(queryPartial);
      return res;
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
          { method: "GET" },
          { context: operationId },
        );
        const valRes = WholesalerSchema.safeParse(responseData.supplier);
        if (!valRes.success) {
          const message = `loadOrderWholesaler: Validation failed: ${WholesalerSchema.description}`;
          const valTree = zodToValidationErrorTree(valRes.error);
          valTree.errors = [message];
          const err: ApiValidationError = { valTree };
          throw err;
        }
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
    async createSupplier(supplierData: Partial<Omit<Wholesaler, "wholesaler_id">>): Promise<Wholesaler> {
      const operationId = "createSupplier";
      supplierLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ supplier: Wholesaler }>(
          "/api/suppliers/new",
          { method: "POST", body: createJsonBody(supplierData) },
          { context: operationId },
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
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
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
    async deleteSupplier(supplierId: number, cascade = false, forceCascade = false): Promise<DeleteSupplierApiResponse> {
      const operationId = `deleteSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const url = `/api/suppliers/${supplierId}`;
        const body = createJsonBody({ cascade, forceCascade });
        return await client.apiFetchUnion<DeleteSupplierApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    // ===== CATEGORY ASSIGNMENT CRUD =====

    /**
     * Loads categories for a supplier.
     * <refact01> CHANGED: Mini wrapper to categoryApi.loadCategories() - returns ALL categories.
     * supplierId parameter kept for backward compatibility but is unused.
     */
    async loadCategoriesForSupplier(
      supplierId: number,
      where?: WhereConditionGroup<ProductCategory> | null,
      orderBy?: SortDescriptor<ProductCategory>[] | null,
    ): Promise<ProductCategory[]> {
      // <refact01> Delegate to categoryApi.loadCategories with where/orderBy support
      const categoryApi = getCategoryApi(client);
      const queryPartial: Partial<QueryPayload<ProductCategory>> = {};
      if (where) queryPartial.where = where;
      if (orderBy) queryPartial.orderBy = orderBy;
      return categoryApi.loadCategories(queryPartial);
    },

    /* <refact01> DEPRECATED: wholesaler_categories removed
    /**
     * Loads exactly one supplier <-> categories assignment.
     *-/
    async loadCategoryAssignmentForSupplier(supplierId: number, categoryId: number): Promise<WholesalerCategory_Category | null> {
      const operationId = `loadCategoriesForSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const request: PredefinedQueryRequest<WholesalerCategoryWithCount> = {
          namedQuery: "supplier_category->category",
          payload: {
            select: ["wc.wholesaler_id", "wc.category_id", "pc.name AS category_name", "wc.comment", "wc.link"],
            where: {
              whereCondOp: LogicalOperator.AND,
              conditions: [
                { key: "wc.wholesaler_id", whereCondOp: ComparisonOperator.EQUALS, val: supplierId },
                { key: "wc.category_id", whereCondOp: ComparisonOperator.EQUALS, val: categoryId },
              ],
            },
            orderBy: [{ key: "pc.name", direction: "asc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<WholesalerCategory_Category>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        if (responseData.results?.length > 1) {
          throw new Error("loadCategoryAssignmentForSupplier: Only one supplier <-> category assignment expectd.");
        } else if (responseData.results?.length === 1) {
          return responseData.results[0] as WholesalerCategory_Category;
        } else {
          return null;
        }
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },
    */

    /* <refact01> DEPRECATED: Removed - use categoryApi.loadCategories() directly
    // Loads all available categories from master data.
    async loadAvailableCategories(): Promise<ProductCategory[]> {
      const operationId = "loadAvailableCategories";
      supplierLoadingOperations.start(operationId);
      try {
        const query: QueryPayload<ProductCategory> = {
          select: ["category_id", "name", "description"],
          orderBy: [{ key: "name", direction: "asc" }],
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
          "/api/categories",
          { method: "POST", body: createJsonAndWrapInPayload(query) },
          { context: operationId },
        );
        return responseData.results as ProductCategory[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },
    */

    /* <refact01> DEPRECATED: Removed - use categoryApi.loadCategories() directly
    // Gets available categories for a supplier.
    // CHANGED: Mini wrapper to categoryApi.loadCategories() - returns ALL categories.
    // supplierId parameter kept for backward compatibility but is unused.
    async loadAvailableCategoriesForSupplier(supplierId: number): Promise<ProductCategory[]> {
      // Simply delegate to categoryApi - all categories are available
      const categoryApi = getCategoryApi(client);
      return categoryApi.loadCategories();
    },
    */

    /* <refact01> DEPRECATED: wholesaler_categories removed
    /**
     * Assigns a category to a supplier.
     *-/
    async assignCategoryToSupplier(
      supplierId: number,
      category: Omit<WholesalerCategory, "wholesaler_id">,
    ): Promise<AssignmentSuccessData<WholesalerCategory>> {
      const operationId = "assignCategoryToSupplier";
      supplierLoadingOperations.start(operationId);
      try {
        const requestBody: AssignmentRequest<Wholesaler, ProductCategory, Omit<WholesalerCategory, "wholesaler_id">> = {
          parent1Id: supplierId,
          parent2Id: category.category_id,
          data: category,
        };
        const response = await client.apiFetch<AssignmentSuccessData<WholesalerCategory>>(
          "/api/supplier-categories",
          { method: "POST", body: createJsonBody(requestBody) },
          { context: operationId },
        );
        return response;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { supplierId, category, error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },
    */

    /* <refact01> DEPRECATED: wholesaler_categories removed
    /**
     * Updates an existing category assignment for a supplier.
     *-/
    async updateSupplierCategoryAssignment(
      supplierId: number,
      categoryId: number,
      updates: Partial<WholesalerCategory>,
    ): Promise<WholesalerCategory> {
      const operationId = `updateSupplierCategoryAssignment-${supplierId}-${categoryId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const requestBody: AssignmentRequest<Wholesaler, ProductCategory, Partial<WholesalerCategory>> = {
          parent1Id: supplierId,
          parent2Id: categoryId,
          data: updates,
        };
        const response = await client.apiFetch<AssignmentSuccessData<WholesalerCategory>>(
          "/api/supplier-categories",
          { method: "PUT", body: createJsonBody(requestBody) },
          { context: operationId },
        );
        return response.assignment;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { supplierId, categoryId, updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },
    */

    /* <refact01> DEPRECATED: wholesaler_categories removed
    /**
     * Removes a category assignment from a supplier.
     *-/
    async removeCategoryFromSupplier(
      supplierId: number,
      categoryId: number,
      cascade: boolean = false,
      forceCascade: boolean = false,
    ): Promise<RemoveCategoryApiResponse> {
      const operationId = "removeCategoryFromSupplier";
      supplierLoadingOperations.start(operationId);
      try {
        const requestBody: RemoveAssignmentRequest<Wholesaler, ProductCategory> = {
          parent1Id: supplierId,
          parent2Id: categoryId,
          cascade: cascade || false,
          forceCascade: forceCascade || false,
        };
        return await client.apiFetchUnion<RemoveCategoryApiResponse>(
          "/api/supplier-categories",
          { method: "DELETE", body: createJsonBody(requestBody) },
          { context: operationId },
        );
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },
    */

    // ===== OFFERINGS =====

    /**
     * Loads all offerings for a specific supplier (across all categories).
     * Uses nested schema with transformToNestedObjects for proper data structure.
     * Returns offerings with nested product_def, category, and wholesaler objects.
     */
    async loadOfferingsForSupplier(supplierId: number): Promise<Wio_PDef_Cat_Supp_Nested[]> {
      const operationId = `loadOfferingsForSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const cols = genTypedQualifiedColumns(Wio_PDef_Cat_Supp_Nested_Schema, true);
        const request: PredefinedQueryRequest<Wio_PDef_Cat_Supp_Nested> = {
          namedQuery: "offering->product_def->category->wholesaler",
          payload: {
            select: cols,
            where: {
              key: "wio.wholesaler_id",
              whereCondOp: ComparisonOperator.EQUALS,
              val: supplierId,
            },
            orderBy: [{ key: "wio.created_at", direction: "desc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<Wio_PDef_Cat_Supp_Nested>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        // Transform flat recordset to nested objects
        const transformed = transformToNestedObjects(responseData.results as Record<string, unknown>[], Wio_PDef_Cat_Supp_Nested_Schema);
        return transformed;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },

    // ===== ORDERS =================================================================================

    /**
     * Loads order items for order.
     */
    async loadOrdersForSupplier(
      supplierId: number,
      where?: WhereConditionGroup<Order_Wholesaler> | null,
      orderBy?: SortDescriptor<Order_Wholesaler>[] | null,
    ): Promise<Order_Wholesaler[]> {
      const operationId = `loadOrdersForSupplier-${supplierId}`;
      supplierLoadingOperations.start(operationId);
      try {
        const supplierFilterWhere = {
          key: "w.wholesaler_id" as const,
          whereCondOp: ComparisonOperator.EQUALS,
          val: supplierId,
        };

        let completeWhereGroup: WhereCondition<Order_Wholesaler> | WhereConditionGroup<Order_Wholesaler>;
        if (where) {
          completeWhereGroup = {
            whereCondOp: "AND",
            conditions: [supplierFilterWhere, where],
          };
        } else {
          completeWhereGroup = supplierFilterWhere;
        }

        const completeOrderBy: SortDescriptor<Order_Wholesaler>[] =
          orderBy && orderBy.length > 0
            ? orderBy
            : [{ key: "ord.created_at", direction: "desc" }];

        const request: PredefinedQueryRequest<Order_Wholesaler> = {
          namedQuery: "order->wholesaler",
          payload: {
            where: completeWhereGroup,
            orderBy: completeOrderBy,
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<Order_Wholesaler>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        if (responseData.results && responseData.results.length > 0) {
          // Transform flat recordset to nested objects
          const transformed = transformToNestedObjects(responseData.results as Record<string, unknown>[], Order_Wholesaler_Schema);
          return transformed;
        } else {
          return [];
        }
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        supplierLoadingOperations.finish(operationId);
      }
    },
  };

  return api;
}
