// src/lib/api/client/orderItem.ts

/**
 * @file OrderItem API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for order item operations.
 * This module follows the Factory Pattern to ensure SSR safety by depending on a
 * context-aware ApiClient instance.
 */

import { ComparisonOperator } from "$lib/backendQueries/queryGrammar";
import {
  OrderItem_ProdDef_Category_Schema,
  type OrderItem,
  type OrderItem_ProdDef_Category
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

import type { PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";
import type { ApiClient } from "./ApiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

// Loading state managers remain global as they are a client-side concern.
const orderItemLoadingManager = new LoadingState();
export const orderItemLoadingState = orderItemLoadingManager.isLoadingStore;
export const orderItemLoadingOperations = orderItemLoadingManager;

/**
 * Factory function to create an order-item-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all order item API methods.
 */
export function getOrderItemApi(client: ApiClient) {
  const api = {
    // ===== ORDER ITEM CRUD =====

    /**
     * Loads a single order item by its ID (with all joined data).
     */
    async loadOrderItem(orderItemId: number): Promise<OrderItem_ProdDef_Category> {
      const operationId = `loadOrderItem-${orderItemId}`;
      orderItemLoadingOperations.start(operationId);
      try {
        const request: PredefinedQueryRequest<OrderItem_ProdDef_Category> = {
          namedQuery: "order->order_items->product_def->category",
          payload: {
            where: {
              key: "ori.order_item_id",
              whereCondOp: ComparisonOperator.EQUALS,
              val: orderItemId,
            },
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<OrderItem_ProdDef_Category>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );

        if (!responseData.results || responseData.results.length === 0) {
          throw new Error(`OrderItem with ID ${orderItemId} not found`);
        }

        // Transform flat recordset to nested objects
        const transformed = transformToNestedObjects(
          responseData.results as Record<string, unknown>[],
          OrderItem_ProdDef_Category_Schema
        );

        return transformed[0];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderItemLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new order item.
     */
    async createOrderItem(orderItemData: Partial<Omit<OrderItem, "order_item_id" | "created_at">>): Promise<OrderItem> {
      const operationId = "createOrderItem";
      orderItemLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ orderItem: OrderItem }>(
          "/api/order-items/new",
          { method: "POST", body: createJsonBody(orderItemData) },
          { context: operationId },
        );
        return responseData.orderItem;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { orderItemData, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderItemLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing order item.
     */
    async updateOrderItem(orderItemId: number, updates: Partial<OrderItem>): Promise<OrderItem> {
      const operationId = `updateOrderItem-${orderItemId}`;
      orderItemLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ orderItem: OrderItem }>(
          `/api/order-items/${orderItemId}`,
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
        );
        return responseData.orderItem;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderItemLoadingOperations.finish(operationId);
      }
    },

    /**
     * Deletes an order item.
     */
    async deleteOrderItem(orderItemId: number): Promise<{ success: boolean }> {
      const operationId = `deleteOrderItem-${orderItemId}`;
      orderItemLoadingOperations.start(operationId);
      try {
        const url = `/api/order-items/${orderItemId}`;
        return await client.apiFetch<{ success: boolean }>(url, { method: "DELETE" }, { context: operationId });
      } finally {
        orderItemLoadingOperations.finish(operationId);
      }
    },
  };

  return api;
}
