// File: src/routes/api/categories/[id]/+server.ts

/**
 * @file Individual Category API Endpoints - MASTER DATA
 * @description Provides type-safe CRUD operations for a single product_categories master data record.
 * This follows the established patterns from the suppliers API, including dependency
 * checking for safe deletion.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import { checkProductCategoryMasterDependencies } from "$lib/dataModel/dependencyChecks";
import { ProductCategorySchema, type ProductCategory } from "$lib/domain/domainTypes";
import { validateEntity } from "$lib/domain/domainTypes.utils";
import { v4 as uuidv4 } from "uuid";

import type { ApiErrorResponse, ApiSuccessResponse, DeleteConflictResponse, DeleteRequest } from "$lib/api/api.types";
import type { DeleteCategorySuccessResponse } from "$lib/api/app/appSpecificTypes";
import { deleteProductCategory } from "$lib/dataModel/deletes";

/**
 * GET /api/categories/[id]
 * @description Retrieves a single category master data record.
 */
export const GET: RequestHandler = async ({ params }) => {
  log.infoHeader("GET /api/categories/[id]");
  const operationId = uuidv4();
  const id = parseInt(params.id ?? "", 10);
  log.info(`[${operationId}] GET /categories/${id}: FN_START`);

  if (isNaN(id) || id <= 0) {
    throw error(400, "Invalid category ID.");
  }

  try {
    const result = await db.request().input("id", id).query("SELECT * FROM dbo.product_categories WHERE category_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Category with ID ${id} not found.`);
    }

    const category = result.recordset[0] as ProductCategory;
    const response: ApiSuccessResponse<{ category: ProductCategory }> = {
      success: true,
      message: "Category retrieved successfully.",
      data: { category },
      meta: { timestamp: new Date().toISOString() },
    };
    return json(response);
  } catch (err: unknown) {
    if ((err as { status: number })?.status !== 404) {
      const { status, message } = mssqlErrorMapper.mapToHttpError(err);
      log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during GET.`, { error: err });
      throw error(status, message);
    }
    throw err; // Re-throw the 404 error
  }
};

/**
 * PUT /api/categories/[id]
 * @description Updates an existing category master data record.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  log.infoHeader("PUT /api/categories/[id]");
  const operationId = uuidv4();
  const id = parseInt(params.id ?? "", 10);
  log.info(`[${operationId}] PUT /categories/${id}: FN_START`);

  try {
    if (isNaN(id) || id <= 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Invalid category ID.",
        status_code: 400,
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errRes, { status: 400 });
    }

    const requestData = await request.json();
    const validation = validateEntity(ProductCategorySchema, { ...requestData, category_id: id });

    if (!validation.isValid) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Validation failed.",
        status_code: 400,
        errors: validation.errors,
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errRes, { status: 400 });
    }

    const { name, description } = validation.sanitized;
    const result = await db
      .request()
      .input("id", id)
      .input("name", name)
      .input("description", description)
      .query("UPDATE dbo.product_categories SET name=@name, description=@description OUTPUT INSERTED.* WHERE category_id = @id");

    if (result.recordset.length === 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Category with ID ${id} not found.`,
        status_code: 404,
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errRes, { status: 404 });
    }

    const response: ApiSuccessResponse<{ category: ProductCategory }> = {
      success: true,
      message: "Category updated successfully.",
      data: { category: result.recordset[0] as ProductCategory },
      meta: { timestamp: new Date().toISOString() },
    };
    return json(response);
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during PUT.`, { error: err });
    throw error(status, message);
  }
};

/**
 * DELETE /api/categories/[id]
 * @description Deletes a category master data record with careful dependency checking.
 */
export const DELETE: RequestHandler = async ({ params, request, url }): Promise<Response> => {
  log.infoHeader("DELETE /api/categories/[id]");
  const operationId = uuidv4();
  const id = parseInt(params.id ?? "", 10);
  log.info(`[${operationId}] DELETE /categories/${id}: FN_START`, { params, request, url });

  const body: DeleteRequest<ProductCategory> = await request.json();
  const cascade = body.cascade || false;
  const forceCascade = body.forceCascade || false;

  try {
    if (isNaN(id) || id <= 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Invalid category ID.",
        status_code: 400,
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errRes, { status: 400 });
    }

    const transaction = db.transaction();
    await transaction.begin();
    log.info(`[${operationId}] Transaction started for category deletion.`);

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkProductCategoryMasterDependencies(id, transaction);
      log.info(`Product categrory has dependent objects:`, { hard, soft });

      let cascade_available = true;
      if (hard.length > 0) {
        cascade_available = false;
      }
      // If we have soft dependencies without cascade
      // or we have hard dependencies without forceCascade => Return error code.
      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot delete category: It is still in use by other entities (e.g., offerings).",
          status_code: 409,
          error_code: "DEPENDENCY_CONFLICT",
          dependencies: { hard, soft },
          cascade_available,
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by hard dependencies.`, { dependencies: hard });
        return json(conflictResponse, { status: 409 });
      }

      // === DELETE =================================================================================

      const deletedInfo = await deleteProductCategory(id, cascade || forceCascade, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteCategorySuccessResponse = {
        success: true,
        message: `Category "${deletedInfo.deleted.name}" deleted successfully.`,
        data: {
          deleted_resource: deletedInfo.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: deletedInfo.stats.total,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Category deleted.`, { responseData: response.data });
      return json(response);

    } catch (err) {
      await transaction.rollback();
      log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
      throw err; // Re-throw to be caught by the outer catch block
    }
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during DELETE.`, { error: err });
    throw error(status, message);
  }
};
