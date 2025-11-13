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
      where: WhereConditionGroup<Wholesaler> | WhereCondition<Wholesaler> | null,
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
