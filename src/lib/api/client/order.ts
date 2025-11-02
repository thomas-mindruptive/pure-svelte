// src/lib/api/client/supplier.ts

/**
 * @file Supplier API Client - COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for supplier-related operations.
 * This module follows the Factory Pattern to ensure SSR safety by depending on a
 * context-aware ApiClient instance.
 */

import {
  type QueryPayload,
  type SortDescriptor,
  type WhereCondition,
  type WhereConditionGroup,
  ComparisonOperator,
} from "$lib/backendQueries/queryGrammar";
import {
  type Order,
  type Order_Wholesaler,
  type OrderItem_ProdDef_Category,
  Order_Wholesaler_Schema,
  OrderItem_ProdDef_Category_Schema,
  OrderSchema,
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

import type { ApiValidationError, PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { DeleteSupplierApiResponse } from "$lib/api/app/appSpecificTypes";
import type { ApiClient } from "./apiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";
import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
import { assertDefined } from "$lib/utils/assertions";

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
    async loadOrderWholesalers(query: Partial<QueryPayload<Order_Wholesaler>> = {}): Promise<Order_Wholesaler[]> {
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
        const transformed = transformToNestedObjects(responseData.results as Record<string, unknown>[], Order_Wholesaler_Schema);

        // TODO: Validate the return objects in all APIs!
        const valRes = safeParseFirstN(Order_Wholesaler_Schema, transformed, 3);
        if (!valRes.success) {
          const message = `loadOrders: Validation failed: ${Order_Wholesaler_Schema.description} - Details see "valTree"`;
          const valTree = zodToValidationErrorTree(valRes.error);
          valTree.errors = [message];
          const err: ApiValidationError = { valTree };
          throw err;
        }
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
    async loadOrderWholesalersWithWhereAndOrder(
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
      const res = api.loadOrderWholesalers(queryPartial);
      // NOTE: loadOrders validates to schema.
      return res;
    },

    /**
     * Loads a single, complete Order object by its ID.
     */
    async loadOrder(orderId: number): Promise<Order> {
      const operationId = `loadOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order_Wholesaler }>(
          `/api/orders/${orderId}`,
          { method: "GET" },
          { context: operationId },
        );
        // TODO: Validate the return objects in all APIs!
        const valRes = OrderSchema.safeParse(responseData.order);
        if (!valRes.success) {
          const message = `loadOrder: Validation failed: ${OrderSchema.description}`;
          const valTree = zodToValidationErrorTree(valRes.error);
          valTree.errors = [message];
          const err: ApiValidationError = { valTree };
          throw err;
        }
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Load order joined with wholesaler Order_Wholesaler.
     * @param orderId
     * @returns
     */
    async loadOrderWholesaler(orderId: number): Promise<Order_Wholesaler> {
      const operationId = "loadOrderWholesaler";
      orderLoadingOperations.start(operationId);
      try {
        const predefQuery: PredefinedQueryRequest<Order_Wholesaler> = {
          namedQuery: "order->wholesaler",
          payload: { where: { key: "order_id", whereCondOp: "=", val: orderId } },
        };
        const responseData = await client.apiFetch<QueryResponseData<Order_Wholesaler>>(
          "/api/query",
          { method: "POST", body: createJsonBody(predefQuery) },
          { context: operationId },
        );
        log.info(`Load successful.`, responseData);
        if (responseData.results.length !== 1) {
          const message = `loadOrderWholesaler: Only one element in responseData.results expected but was ${responseData.results.length}`;
          const err: ApiValidationError = { valTree: { errors: [message] } };
          throw err;
        }

        // Transform flat recordset to nested objects
        const transformed = transformToNestedObjects(responseData.results as Record<string, unknown>[], Order_Wholesaler_Schema);
        const order = transformed[0];
        // TODO: Validate the return objects in all APIs!
        const valRes = Order_Wholesaler_Schema.safeParse(order);
        if (!valRes.success) {
          const message = `loadOrderWholesaler: Validation failed: ${Order_Wholesaler_Schema.description}`;
          const valTree = zodToValidationErrorTree(valRes.error);
          valTree.errors = [message];
          const err: ApiValidationError = { valTree };
          throw err;
        }
        return order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Remove the the wholesaler from the OrderWholesaler, e.g. for clean API calls.
     * @param orderWs
     * @returns
     */
    stripWholesalerFromOrderWholesaler(orderWs: Partial<Order_Wholesaler>): Partial<Order> {
      assertDefined(orderWs, "orderWs");
      // Strip wholesaler.
      const { wholesaler, ...order } = orderWs;
      void wholesaler;
      return order;
    },

    /**
     * Creates a new order from an Order_Wholesaler.
     */
    async createOrderFromOrderWholesaler(orderWholesaler: Partial<Omit<Order_Wholesaler, "wholesaler_id">>): Promise<Order_Wholesaler> {
      const operationId = "createOrder";
      orderLoadingOperations.start(operationId);
      try {
        const order = this.stripWholesalerFromOrderWholesaler(orderWholesaler);
        const responseData = await client.apiFetch<{ order: Order }>(
          "/api/orders/new",
          { method: "POST", body: createJsonBody(order) },
          { context: operationId },
        );
        // We need to return a joined Order_Wholesaler => reload the join.
        const updatedOrderWholesaler = await this.loadOrderWholesaler(responseData.order.order_id);
        return updatedOrderWholesaler;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { orderData: orderWholesaler, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing order from an Order_Wholesaler.
     */
    async updateOrderFromOrderWholesaler(orderId: number, updates: Partial<Order_Wholesaler>): Promise<Order_Wholesaler> {
      const operationId = `updateOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const orderUpdates = this.stripWholesalerFromOrderWholesaler(updates);
        const responseData = await client.apiFetch<{ order: Order }>(
          `/api/orders/${orderId}`,
          { method: "PUT", body: createJsonBody(orderUpdates) },
          { context: operationId },
        );
        // We need to return a joined Order_Wholesaler => reload the join.
        const updatedOrderWholesaler = await this.loadOrderWholesaler(responseData.order.order_id);
        return updatedOrderWholesaler;
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
     * Loads order items for order.
     */
    async loadOrderItemsForOrder(
      orderId: number,
      where?: WhereConditionGroup<OrderItem_ProdDef_Category> | null,
      orderBy?: SortDescriptor<OrderItem_ProdDef_Category>[] | null,
    ): Promise<OrderItem_ProdDef_Category[]> {
      const operationId = `loadOrderItemsForOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const orderFilterWhere = {
          key: "ord.order_id" as const,
          whereCondOp: ComparisonOperator.EQUALS,
          val: orderId,
        };

        let completeWhereGroup: WhereCondition<OrderItem_ProdDef_Category> | WhereConditionGroup<OrderItem_ProdDef_Category>;
        if (where) {
          completeWhereGroup = {
            whereCondOp: "AND",
            conditions: [orderFilterWhere, where],
          };
        } else {
          completeWhereGroup = orderFilterWhere;
        }

        const completeOrderBy: SortDescriptor<OrderItem_ProdDef_Category>[] =
          orderBy && orderBy.length > 0
            ? orderBy
            : [{ key: "pc.name", direction: "asc" }];

        const request: PredefinedQueryRequest<OrderItem_ProdDef_Category> = {
          namedQuery: "order->order_items->product_def->category",
          payload: {
            where: completeWhereGroup,
            orderBy: completeOrderBy,
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
            OrderItem_ProdDef_Category_Schema,
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
