// src/routes/api/orders/[id]/+server.ts

/**
 * @file Individual Order API Endpoints
 * @description Provides type-safe CRUD operations for a single order.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { queryConfig } from "$lib/backendQueries/queryConfig";
import { checkOrderDependencies } from "$lib/dataModel/dependencyChecks";
import { LogicalOperator, ComparisonOperator, type QueryPayload, type WhereCondition } from "$lib/backendQueries/queryGrammar";
import { OrderSchema, type Order } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiSuccessResponse,
  DeleteConflictResponse,
  DeleteRequest,
  DeleteSuccessResponse,
  QueryRequest,
  QuerySuccessResponse,
} from "$lib/api/api.types";
import { deleteOrder } from "$lib/backendQueries/cascadingDeleteOperations";
import { buildUnexpectedError, validateAndUpdateEntity, validateIdUrlParam } from "$lib/backendQueries/entityOperations";

/**
 * GET /api/orders/[id] - Get a single, complete order record.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/orders/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const result = await db.request().input("id", id).query("SELECT * FROM dbo.orders WHERE order_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Order with ID ${id} not found.`);
    }

    const order = result.recordset[0] as Order;

    const response: ApiSuccessResponse<{ order: Order }> = {
      success: true,
      message: "Order retrieved successfully.",
      data: { order },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning order data.`);
    return json(response);
  } catch (err: unknown) {
    if ((err as { status: number })?.status !== 404) {
      return buildUnexpectedError(err, info);
    }
    throw err;
  }
};

/**
 * POST /api/orders/[id] - Get a single order with flexible fields.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/orders/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as QueryRequest<Order>;
    const clientPayload = requestBody.payload;
    log.info(`[${operationId}] Parsed request body`, { clientPayload });

    const orderIdCondition: WhereCondition<Order> = { key: "order_id", whereCondOp: ComparisonOperator.EQUALS, val: id };
    const securePayload: QueryPayload<Order> = {
      ...clientPayload,
      from: { table: "dbo.orders", alias: "ord" },
      where: clientPayload.where
        ? {
            whereCondOp: LogicalOperator.AND,
            conditions: [orderIdCondition, clientPayload.where],
          }
        : {
            whereCondOp: LogicalOperator.AND,
            conditions: [orderIdCondition],
          },
      limit: 1,
    };

    const { sql, parameters, metadata } = buildQuery(securePayload, queryConfig);
    const results = await executeQuery(sql, parameters);

    const response: QuerySuccessResponse<Order> = {
      success: true,
      message: "Order retrieved successfully.",
      data: {
        results: results as Partial<Order>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: "dbo.orders",
          sql_generated: sql,
        },
      },
      meta: { timestamp: new Date().toISOString() },
    };
    log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} record(s).`);
    return json(response);
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/orders/[id] - Update an existing order.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/orders/${params.id} - ${operationId}`
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { requestData });
    return validateAndUpdateEntity(OrderSchema, id, "order_id", requestData, "order");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/orders/[id] - Delete an order with dependency checks.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/orders/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const body: DeleteRequest<Order> = await request.json();
    log.info(`[${operationId}] DELETE /orders/${id}: FN_START`, { params, request, body });

    const cascade = body.cascade || false;
    const forceCascade = body.forceCascade || false;

    const transaction = db.transaction();
    await transaction.begin();

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkOrderDependencies(id, transaction);
      let cascade_available = true;
      if (hard.length > 0) {
        cascade_available = false;
      }
      // If we have soft dependencies without cascade
      // or we have hard dependencies without forceCascade => Return error code.
      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot delete order: dependencies exist.",
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

      const deletedOrderStats = await deleteOrder(id, cascade || forceCascade, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteSuccessResponse<{ order_id: number; order_number: string | null }> = {
        success: true,
        message: `Order ${deletedOrderStats.deleted.order_number ? `"${deletedOrderStats.deleted.order_number}"` : deletedOrderStats.deleted.order_id} deleted successfully.`,
        data: {
          deleted_resource: deletedOrderStats.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: deletedOrderStats.stats.total,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Order deleted.`, {
        deletedId: deletedOrderStats.deleted.order_id,
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