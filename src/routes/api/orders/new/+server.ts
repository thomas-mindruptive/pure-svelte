// src/routes/api/orders/new/+server.ts

/**
 * @file Create Order API Endpoint
 * @description POST /api/orders/new - Handles the creation of a new order record.
 * It performs server-side validation and returns the newly created entity.
 */

import { type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { OrderForCreateSchema, type Order } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import { buildUnexpectedError, validateAndInsertEntity } from "$lib/backendQueries/entityOperations";

/**
 * POST /api/orders/new
 * @description Creates a new order.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/orders/new - ${operationId}`;
  log.infoHeader(info);

  try {
    // 1. Expect the request body to be the new order data.
    const requestData = (await request.json()) as Partial<Omit<Order, "order_id">>;
    log.info(`[${operationId}] Parsed request body`, { requestData });
    return validateAndInsertEntity(OrderForCreateSchema, requestData, "order");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};