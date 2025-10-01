// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for supplier-related operations.
 * This module follows the Factory Pattern to ensure SSR safety by depending on a
 * context-aware ApiClient instance.
 */

import { type QueryPayload, type SortDescriptor, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
import {
  type Order,
  type Order_Wholesaler,
  type OrderItem_ProdDef_Category,
  Order_Wholesaler_Schema,
  OrderItem_ProdDef_Category_Schema
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

import type { PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { DeleteSupplierApiResponse } from "$lib/api/app/appSpecificTypes";
import type { ApiClient } from "./ApiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";

// Loading state managers remain global as they are a client-side concern.
const orderLoadingManager = new LoadingState();
export const orderLoadingState = orderLoadingManager.isLoadingStore;
export const orderLoadingOperations = orderLoadingManager;

/**
 * The default query payload used when fetching a list.
 */

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
    async loadOrders(query: Partial<QueryPayload<Order_Wholesaler>> = {}): Promise<Order_Wholesaler[]> {
      const operationId = "loadOrders";
      orderLoadingOperations.start(operationId);
      try {
        const predefQuery: PredefinedQueryRequest<Order_Wholesaler> = {
          namedQuery: "order->wholesaler",
          payload: query,
        };
        const responseData = await client.apiFetch<QueryResponseData<Order_Wholesaler>>(
          "/api/query",
          { method: "POST", body: createJsonBody(predefQuery) },
          { context: operationId },
        );
        log.info(`Load successful.`, responseData);
        // Transform flat recordset to nested objects
        const transformed = transformToNestedObjects(
          responseData.results as Record<string, unknown>[],
          Order_Wholesaler_Schema
        );
        return transformed;
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
    async loadOrdersWithWhereAndOrder(
      where: WhereConditionGroup<Order_Wholesaler> | null,
      orderBy: SortDescriptor<Order_Wholesaler>[] | null,
    ): Promise<Order_Wholesaler[]> {
      const queryPartial: Partial<QueryPayload<Order_Wholesaler>> = {};
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
    async loadOrder(orderId: number): Promise<Order_Wholesaler> {
      const operationId = `loadOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order_Wholesaler }>(
          `/api/orders/${orderId}`,
          { method: "GET" },
          { context: operationId },
        );
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
          { method: "POST", body: createJsonBody(orderData) },
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
          { method: "PUT", body: createJsonBody(updates) },
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
        const body = createJsonBody({ cascade, forceCascade });
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
      try {
        const request: PredefinedQueryRequest<OrderItem_ProdDef_Category> = {
          namedQuery: "order->order_items->product_def->category",
          payload: {
            where: { key: "ord.order_id", whereCondOp: "=", val: orderId },
            orderBy: [{ key: "pc.name", direction: "asc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<OrderItem_ProdDef_Category>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        if (responseData.results && responseData.results.length > 0) {
          // Transform flat recordset to nested objects
          const transformed = transformToNestedObjects(
            responseData.results as Record<string, unknown>[],
            OrderItem_ProdDef_Category_Schema
          );
          return transformed;
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
