// src/routes/api/product-definitions/[id]/+server.ts

/**
 * @file Individual Product Definition API Endpoints
 * @description Provides GET, PUT, and DELETE operations for a single product definition record,
 * adhering to the schema-driven validation and dynamic update patterns.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateIdUrlParam, validateAndUpdateEntity } from "$lib/backendQueries/genericEntityOperations";
import { checkProductDefinitionDependencies } from "$lib/backendQueries/dependencyChecks";
import { ProductDefinitionSchema, type ProductDefinition } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import type { ApiSuccessResponse, DeleteConflictResponse, DeleteRequest, DeleteSuccessResponse } from "$lib/api/api.types";
import { deleteProductDefinition } from "$lib/backendQueries/cascadingDeleteOperations";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";

/**
 * GET /api/product-definitions/[id]
 * @description Retrieves a single product definition record.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/product-definitions/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /product-definitions/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const result = await db.request().input("id", id).query("SELECT * FROM dbo.product_definitions WHERE product_def_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Product definition with ID ${id} not found.`);
    }

    const response: ApiSuccessResponse<{ productDefinition: ProductDefinition }> = {
      success: true,
      message: "Product definition retrieved successfully.",
      data: { productDefinition: result.recordset[0] as ProductDefinition },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning product definition data.`);
    return json(response);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/product-definitions/[id]
 * @description Dynamically updates an existing product definition based on provided fields.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/product-definitions/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] PUT /product-definitions/${params.id}: FN_START`);

  try {
    const { id: product_def_id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    return validateAndUpdateEntity(ProductDefinitionSchema, product_def_id, "product_def_id", requestData, "productDefinition");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/product-definitions/[id]
 * @description Deletes a product definition after checking for hard dependencies.
 */
export const DELETE: RequestHandler = async ({ request, params }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/product-definitions/${params.id} - ${operationId}`;
  log.infoHeader(`DELETE /product-definitions/${params.id}`);
  log.debug(`Reuest, params:`, { request, params });

  const body: DeleteRequest<ProductDefinition> = await request.json();
  const cascade = body.cascade;
  const forceCascade = body.forceCascade || false;

  const { id, errorResponse } = validateIdUrlParam(params.id);
  if (errorResponse) {
    return errorResponse;
  }

  const transaction = db.transaction();
  await transaction.begin();

  try {
    // === CHECK DEPENDENCIES =====================================================================

    const { hard, soft } = await checkProductDefinitionDependencies(id, transaction);
    let cascade_available = true;
    if (hard.length > 0) {
      cascade_available = false;
    }

    // If we have soft dependencies without cascade
    // or we have hard dependencies without forceCascade => Return error code.
    if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
      const conflictResponse: DeleteConflictResponse<string[]> = {
        success: false,
        message: "Cannot delete product definition: It is referenced by dependent objects.",
        status_code: 409,
        error_code: "DEPENDENCY_CONFLICT",
        dependencies: { hard, soft },
        cascade_available,
        meta: { timestamp: new Date().toISOString() },
      };
      return json(conflictResponse, { status: 409 });
    }

    // === DELETE =================================================================================

    // We correctly check for hard and soft dependencies above => It is safe to "cascade || forceCascade".
    const deleteInfo = await deleteProductDefinition(id, cascade || forceCascade, transaction);
    await transaction.commit();
    log.info(`[${operationId}] Transaction committed.`);

    // === RETURN RESPONSE ========================================================================

    const response: DeleteSuccessResponse<Pick<ProductDefinition, "product_def_id" | "title">> = {
      success: true,
      message: `Product definition "${deleteInfo.deleted.title}" deleted successfully.`,
      data: {
        deleted_resource: deleteInfo.deleted,
        cascade_performed: false,
        dependencies_cleared: deleteInfo.stats.total,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    return json(response);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    await rollbackTransaction(transaction);
    return buildUnexpectedError(err, info);
  }
};
