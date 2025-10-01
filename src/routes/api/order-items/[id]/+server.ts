// src/routes/api/order-items/[id]/+server.ts

/**
 * @file Individual OrderItem API Endpoints
 * @description Provides type-safe CRUD operations for a single order item.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { OrderItemSchema, type OrderItem } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

import type { ApiSuccessResponse, DeleteSuccessResponse, DeleteConflictResponse, DeleteRequest } from "$lib/api/api.types";
import { buildUnexpectedError, validateAndUpdateEntity, validateIdUrlParam } from "$lib/backendQueries/entityOperations";
import { checkOrderItemDependencies } from "$lib/dataModel/dependencyChecks";
import { deleteOrderItem } from "$lib/backendQueries/cascadingDeleteOperations";

/**
 * GET /api/order-items/[id] - Get a single order item record.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/order-items/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const result = await db.request().input("id", id).query("SELECT * FROM dbo.order_items WHERE order_item_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `OrderItem with ID ${id} not found.`);
    }

    const orderItem = result.recordset[0] as OrderItem;

    const response: ApiSuccessResponse<{ orderItem: OrderItem }> = {
      success: true,
      message: "OrderItem retrieved successfully.",
      data: { orderItem },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning order item data.`);
    return json(response);
  } catch (err: unknown) {
    if ((err as { status: number })?.status !== 404) {
      return buildUnexpectedError(err, info);
    }
    throw err;
  }
};

/**
 * PUT /api/order-items/[id] - Update an existing order item.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/order-items/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { requestData });
    return validateAndUpdateEntity(OrderItemSchema, id, "order_item_id", requestData, "orderItem");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/order-items/[id] - Delete an order item with dependency checks.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/order-items/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const body: DeleteRequest<OrderItem> = await request.json();
    log.info(`[${operationId}] DELETE /order-items/${id}: FN_START`, { params, body });

    const cascade = body.cascade || false;
    const forceCascade = body.forceCascade || false;

    const transaction = db.transaction();
    await transaction.begin();

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkOrderItemDependencies(id, transaction);
      let cascade_available = true;
      if (hard.length > 0) {
        cascade_available = false;
      }

      // If we have soft dependencies without cascade
      // or we have hard dependencies without forceCascade => Return conflict
      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot delete order item: dependencies exist.",
          status_code: 409,
          error_code: "DEPENDENCY_CONFLICT",
          dependencies: { soft, hard },
          cascade_available,
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { hard, soft });
        return json(conflictResponse, { status: 409 });
      }

      // === DELETE =================================================================================

      const deletedOrderItemStats = await deleteOrderItem(id, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteSuccessResponse<{ order_item_id: number }> = {
        success: true,
        message: `OrderItem ${id} deleted successfully.`,
        data: {
          deleted_resource: deletedOrderItemStats.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: 0, // OrderItems are leaf nodes
        },
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: OrderItem deleted.`, {
        deletedId: deletedOrderItemStats.deleted.order_item_id,
        cascade,
        forceCascade,
      });
      return json(response);
    } catch (err) {
      await transaction.rollback();
      log.error(`[${operationId}] FN_EXCEPTION: Transaction failed and was rolled back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};
