// src/routes/api/supplier-categories/+server.ts

/**
 * @file Supplier-Category Assignment API - FINAL ARCHITECTURE
 * @description Handles the n:m relationship with proper, explicit type usage for all
 * success and error responses, returning structured JSON for handled errors
 * instead of throwing.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import { checkSupplierCategoryDependencies } from "$lib/dataModel/dependencyChecks";
import { deleteSupplierCategoryAssignment } from "$lib/backendQueries/cascadingDeleteOperations";
import type { ProductCategory, Wholesaler, WholesalerCategory } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiErrorResponse,
  AssignmentRequest,
  AssignmentSuccessResponse,
  DeleteConflictResponse,
  DeleteSuccessResponse,
  RemoveAssignmentRequest,
} from "$lib/api/api.types";
import type { DeletedSupplierCategoryData } from "$lib/api/app/appSpecificTypes";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";

/**
 * POST /api/supplier-categories
 * @description Assigns a category to a supplier.
 */
export const POST: RequestHandler = async ({ request }) => {
  log.infoHeader("POST /api/supplier-categories");
  const operationId = uuidv4();
  log.info(`[${operationId}] POST /supplier-categories: FN_START`);

  try {
    const body = (await request.json()) as AssignmentRequest<Wholesaler, ProductCategory, WholesalerCategory>;
    const { parent1Id: supplierId, parent2Id: categoryId, data: wholesalerProductCategory } = body;
    log.info(`[${operationId}] Parsed request body`, { supplierId, categoryId });

    if (!supplierId || !categoryId) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "supplierId (parentId) and categoryId (childId) are required.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
      return json(errRes, { status: 400 });
    }

    if (!wholesalerProductCategory) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Product category data is required.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing product category data.`, { error: errRes });
      return json(errRes, { status: 400 });
    }

    const checkResult = await db.request().input("supplierId", supplierId).input("categoryId", categoryId).query(`
                SELECT (SELECT name FROM dbo.wholesalers WHERE wholesaler_id = @supplierId) as supplier_name,
                       (SELECT name FROM dbo.product_categories WHERE category_id = @categoryId) as category_name,
                       (SELECT COUNT(*) FROM dbo.wholesaler_categories WHERE wholesaler_id = @supplierId AND category_id = @categoryId) as assignment_count;
            `);
    const { supplier_name, category_name, assignment_count } = checkResult.recordset[0];

    if (!supplier_name) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Supplier with ID ${supplierId} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Supplier not found.`, { supplierId });
      return json(errRes, { status: 404 });
    }
    if (!category_name) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Category with ID ${categoryId} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Category not found.`, { categoryId });
      return json(errRes, { status: 404 });
    }
    if (assignment_count > 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Category "${category_name}" is already assigned to supplier "${supplier_name}".`,
        status_code: 409,
        error_code: "ASSIGNMENT_CONFLICT",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Assignment already exists.`, { supplierId, categoryId });
      return json(errRes, { status: 409 });
    }

    const result = await db
      .request()
      .input("supplierId", supplierId)
      .input("categoryId", categoryId)
      .input("comment", wholesalerProductCategory.comment || null)
      .input("link", wholesalerProductCategory.link || null)
      .query(
        "INSERT INTO dbo.wholesaler_categories (wholesaler_id, category_id, comment, link) OUTPUT INSERTED.* VALUES (@supplierId, @categoryId, @comment, @link)",
      );

    const response: AssignmentSuccessResponse<WholesalerCategory> = {
      success: true,
      message: `Category "${category_name}" assigned to supplier "${supplier_name}".`,
      data: {
        assignment: result.recordset[0] as WholesalerCategory,
        meta: { assigned_at: new Date().toISOString(), parent_name: supplier_name, child_name: category_name },
      },
      meta: { timestamp: new Date().toISOString() },
    };
    log.info(`[${operationId}] FN_SUCCESS: Assignment created.`, { supplierId, categoryId });
    return json(response, { status: 201 });
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during assignment.`, { error: err });
    // Only THROW for unexpected server errors.
    throw error(status, message);
  }
};

/**
 * DELETE /api/supplier-categories
 * @description Removes a category assignment.
 */
export const DELETE: RequestHandler = async ({ request }) => {
  log.infoHeader("DELETE /api/supplier-categories");
  const operationId = uuidv4();
  log.info(`[${operationId}] DELETE /supplier-categories: FN_START`);

  try {
    const body = (await request.json()) as RemoveAssignmentRequest<Wholesaler, ProductCategory>;
    const { parent1Id: supplierId, parent2Id: categoryId, cascade = false, forceCascade = false } = body;
    log.info(`[${operationId}] Parsed request body`, { supplierId, categoryId, cascade, forceCascade });

    if (!supplierId || !categoryId) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "supplierId (parentId) and categoryId (childId) are required.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
      return json(errRes, { status: 400 });
    }

    const transaction = db.transaction();
    await transaction.begin();
    log.info(`[${operationId}] Transaction started.`);

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkSupplierCategoryDependencies(supplierId, categoryId, transaction);
      let cascade_available = true;
      if (hard.length > 0) {
        cascade_available = false;
      }

      // If we have soft dependencies without cascade
      // or we have hard dependencies without forceCascade => Return error code.
      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        await rollbackTransaction(transaction);
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot remove assignment: dependencies exist.",
          status_code: 409,
          error_code: "DEPENDENCY_CONFLICT",
          dependencies: { soft, hard },
          cascade_available,
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn(`[${operationId}] FN_FAILURE: Removal blocked by dependencies.`, { hard, soft });
        return json(conflictResponse, { status: 409 });
      }

      // === DELETE =================================================================================

      const deletedAssignmentStats = await deleteSupplierCategoryAssignment(supplierId, categoryId, cascade || forceCascade, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteSuccessResponse<DeletedSupplierCategoryData> = {
        success: true,
        message: `Category assignment "${deletedAssignmentStats.deleted.category_name}" removed successfully.`,
        data: {
          deleted_resource: deletedAssignmentStats.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: deletedAssignmentStats.stats.total,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Assignment removed.`, {
        supplierId,
        categoryId,
        cascade,
        forceCascade,
      });
      return json(response);
    } catch (err) {
      log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
      await rollbackTransaction(transaction);
      throw err; // Re-throw to be caught by the outer catch block
    }
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during removal.`, { error: err });
    throw error(status, message);
  }
};
