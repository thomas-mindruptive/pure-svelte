// src/routes/api/order-items/new/+server.ts

/**
 * @file Create OrderItem API Endpoint
 * @description POST /api/order-items/new - Handles the creation of a new order item record.
 * It performs server-side validation and returns the newly created entity.
 */

import { type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { OrderItemForCreateSchema, type OrderItem } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import { buildUnexpectedError, validateAndInsertEntity } from "$lib/backendQueries/genericEntityOperations";

/**
 * POST /api/order-items/new
 * @description Creates a new order item.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/order-items/new - ${operationId}`;
  log.infoHeader(info);

  try {
    // 1. Expect the request body to be the new order item data.
    const requestData = (await request.json()) as Partial<Omit<OrderItem, "order_item_id">>;
    log.info(`[${operationId}] Parsed request body`, { requestData });
    return validateAndInsertEntity(OrderItemForCreateSchema, requestData, "orderItem");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};
