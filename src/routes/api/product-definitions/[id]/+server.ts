// src/routes/api/product-definitions/[id]/+server.ts

/**
 * @file Individual Product Definition API Endpoints
 * @description Provides GET, PUT, and DELETE operations for a single product definition record,
 * adhering to the schema-driven validation and dynamic update patterns.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import { checkProductDefinitionDependencies } from "$lib/dataModel/dependencyChecks";
import { ProductDefinitionSchema, type ProductDefinition } from "$lib/domain/domainTypes";
import { validateEntity } from "$lib/domain/domainTypes.utils";
import { v4 as uuidv4 } from "uuid";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  DeleteConflictResponse,
  DeleteRequest,
  DeleteSuccessResponse,
} from "$lib/api/api.types";
import { deleteProductDefinition } from "$lib/dataModel/deletes";

/**
 * GET /api/product-definitions/[id]
 * @description Retrieves a single product definition record.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const id = parseInt(params.id ?? "", 10);
  log.info(`[${operationId}] GET /product-definitions/${id}: FN_START`);

  if (isNaN(id) || id <= 0) {
    throw error(400, "Invalid product definition ID.");
  }

  try {
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
    return json(response);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err; // Re-throw SvelteKit's 404 error
    }
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during GET.`, { error: err });
    throw error(status, message);
  }
};

/**
 * PUT /api/product-definitions/[id]
 * @description Dynamically updates an existing product definition based on provided fields.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const product_def_id = parseInt(params.id ?? "", 10);
  log.info(`[${operationId}] PUT /product-definitions/${product_def_id}: FN_START`);

  if (isNaN(product_def_id) || product_def_id <= 0) {
    const errRes: ApiErrorResponse = {
      success: false,
      message: "Invalid product definition ID.",
      status_code: 400,
      error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errRes, { status: 400 });
  }

  try {
    const requestData = await request.json();
    const validation = validateEntity(ProductDefinitionSchema, {... requestData, product_def_id});

    if (!validation.isValid) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Validation failed.",
        status_code: 400,
        error_code: "VALIDATION_ERROR",
        errors: validation.errors,
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errRes, { status: 400 });
    }

    const { sanitized } = validation;
    // DO NOT update product_def_id!
    delete (sanitized as any).product_def_id;
    const fieldsToUpdate = Object.keys(sanitized);

    if (fieldsToUpdate.length === 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "No valid fields provided for update.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errRes, { status: 400 });
    }


    // Dynamically build the SET clause for the SQL query
    const setClauses = fieldsToUpdate.map((field) => `${field} = @${field}`);
    const sqlQuery = `
            UPDATE dbo.product_definitions 
            SET ${setClauses.join(", ")} 
            OUTPUT INSERTED.* 
            WHERE product_def_id = @id
        `;

    // Prepare the database request with dynamic inputs
    const dbRequest = db.request().input("id", product_def_id);
    for (const field of fieldsToUpdate) {
      dbRequest.input(field, (sanitized as Record<string, unknown>)[field]);
    }

    const result = await dbRequest.query(sqlQuery);

    if (result.recordset.length === 0) {
      throw error(404, `Product definition with ID ${product_def_id} not found.`);
    }

    const response: ApiSuccessResponse<{ productDefinition: ProductDefinition }> = {
      success: true,
      message: "Product definition updated successfully.",
      data: { productDefinition: result.recordset[0] as ProductDefinition },
      meta: { timestamp: new Date().toISOString() },
    };
    return json(response);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during PUT.`, { error: err });
    throw error(status, message);
  }
};

/**
 * DELETE /api/product-definitions/[id]
 * @description Deletes a product definition after checking for hard dependencies.
 */
export const DELETE: RequestHandler = async ({ request, params }) => {
  const operationId = uuidv4();
  const id = parseInt(params.id ?? "", 10);
  log.infoHeader(`DELETE /product-definitions/${id}`);
  log.debug(`Reuest, params:`, { request, params });

  const body: DeleteRequest<ProductDefinition> = await request.json();
  const cascade = body.cascade;
  const forceCascade = body.forceCascade || false;

  if (isNaN(id) || id <= 0) {
    const errRes: ApiErrorResponse = {
      success: false,
      message: "Invalid product definition ID.",
      status_code: 400,
      error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errRes, { status: 400 });
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
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during DELETE.`, { error: err });
    await transaction.rollback();
    throw error(status, message);
  } 
};
