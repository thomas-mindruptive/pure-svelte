// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for supplier-related operations.
 * This module follows the Factory Pattern to ensure SSR safety by depending on a
 * context-aware ApiClient instance.
 */

import { log } from "$lib/utils/logger";
import { type QueryPayload, type SortDescriptor, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
import { OrderSchema, type Order, type OrderItem_ProdDef_Category, OrderItem_ProdDef_Category_Schema } from "$lib/domain/domainTypes";

import type { ApiClient } from "./ApiClient";
import { createPostBody, createQueryBody, getErrorMessage } from "./common";
import type { PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { DeleteSupplierApiResponse } from "$lib/api/app/appSpecificTypes";
import { LoadingState } from "./loadingState";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";

// Loading state managers remain global as they are a client-side concern.
const orderLoadingManager = new LoadingState();
export const orderLoadingState = orderLoadingManager.isLoadingStore;
export const orderLoadingOperations = orderLoadingManager;

/**
 * The default query payload used when fetching a list.
 */
const orderCols = genTypedQualifiedColumns(OrderSchema);
export const DEFAULT_ORDER_QUERY: QueryPayload<Order> = {
  select: orderCols,
  orderBy: [{ key: "order_date", direction: "desc" }],
};

/**
 * Factory function to create a supplier-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all supplier API methods.
 */
export function getOrderApi(client: ApiClient) {
  const api = {
    //
    // ===== SUPPLIER MASTER-DATA CRUD =====

    /**
     * Load a list.
     */
    async loadOrders(query: Partial<QueryPayload<Order>> = {}): Promise<Order[]> {
      const operationId = "loadOrders";
      orderLoadingOperations.start(operationId);
      try {
        const fullQuery: QueryPayload<Order> = { ...DEFAULT_ORDER_QUERY, ...query };
        const responseData = await client.apiFetch<QueryResponseData<Order>>(
          "/api/orders",
          { method: "POST", body: createQueryBody(fullQuery) },
          { context: operationId },
        );
        log.info(`Load successful.`, responseData);
        return responseData.results as Order[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads based on "where" and "orderBy".
     * @param where
     * @param orderBy
     * @returns
     */
    async loadOrdersWithWhereAndOrder(where: WhereConditionGroup<Order> | null, orderBy: SortDescriptor<Order>[] | null): Promise<Order[]> {
      const queryPartial: Partial<QueryPayload<Order>> = {};
      if (where) {
        queryPartial.where = where;
      }
      if (orderBy) {
        queryPartial.orderBy = orderBy;
      }
      const res = api.loadOrders(queryPartial);
      return res;
    },

    /**
     * Loads a single, complete supplier object by its ID.
     */
    async loadOrder(orderId: number): Promise<Order> {
      const operationId = `loadOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order }>(`/api/orders/${orderId}`, { method: "GET" }, { context: operationId });
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new supplier.
     */
    async createOrder(orderData: Partial<Omit<Order, "wholesaler_id">>): Promise<Order> {
      const operationId = "createSupplier";
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order }>(
          "/api/orders/new",
          { method: "POST", body: createPostBody(orderData) },
          { context: operationId },
        );
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { supplierData: orderData, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing supplier.
     */
    async updateOrder(orderId: number, updates: Partial<Order>): Promise<Order> {
      const operationId = `updateOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order }>(
          `/api/orders/${orderId}`,
          { method: "PUT", body: createPostBody(updates) },
          { context: operationId },
        );
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Delete.
     */
    async deleteOrder(orderId: number, cascade = false, forceCascade = false): Promise<DeleteSupplierApiResponse> {
      const operationId = `deleteOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const url = `/api/oders/${orderId}`;
        const body = createPostBody({ cascade, forceCascade });
        return await client.apiFetchUnion<DeleteSupplierApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    // ===== 1:N =====

    /**
     * Loads exactly one supplier <-> categories assignment.
     */
    async loadOrderItemsForOrder(orderId: number): Promise<OrderItem_ProdDef_Category[]> {
      const operationId = `loadOrderItemsForOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      const columns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
      try {
        const request: PredefinedQueryRequest<OrderItem_ProdDef_Category> = {
          namedQuery: "order->order_items->product_def->category",
          payload: {
            select: columns,
            where: { key: "ord.order_id", whereCondOp: "=", val: orderId },
            orderBy: [{ key: "pc.name", direction: "asc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<OrderItem_ProdDef_Category>>(
          "/api/query",
          { method: "POST", body: createPostBody(request) },
          { context: operationId },
        );
        if (responseData.results?.length > 1) {
          throw new Error("loadCategoryAssignmentForSupplier: Only one supplier <-> category assignment expectd.");
        } else if (responseData.results?.length === 1) {
          return responseData.results as OrderItem_ProdDef_Category[];
        } else {
          return [];
        }
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },
  };

  return api;
}
