// src/routes/api/offerings/[id]/+server.ts

/**
 * @file Individual Offering API Endpoint
 * @description Provides GET operation for a single, detailed offering record.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import type { WholesalerItemOffering, WholesalerItemOffering_ProductDef_Category_Supplier } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  DeleteConflictResponse,
  DeleteRequest,
  DeleteSuccessResponse,
} from "$lib/api/api.types";
import { validateOffering } from "$lib/server/validation/domainValidator";
import { checkOfferingDependencies } from "$lib/dataModel/dependencyChecks";

/**
 * GET /api/offerings/[id]
 * @description Retrieves a single, detailed offering record including product and category names.
 */
export const GET: RequestHandler = async ({ params }) => {
  log.infoHeader("GET /api/offerings/[id]");
  const operationId = uuidv4();
  const id = parseInt(params.id ?? "", 10);
  log.info(`[${operationId}] GET /offerings/${id}: FN_START`);

  if (isNaN(id) || id <= 0) {
    throw error(400, "Invalid offering ID.");
  }

  try {
    // This query now correctly joins all necessary tables to build the
    // WholesalerItemOffering_ProductDef_Category type.
    const result = await db.request().input("id", id).query(`
                SELECT 
                    wio.*,
                    pd.title AS product_def_title,
                    pd.description AS product_def_description,
                    pc.name AS category_name,
                    w.name AS wholesaler_name
                FROM dbo.wholesaler_item_offerings wio
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                WHERE wio.offering_id = @id
            `);

    if (result.recordset.length === 0) {
      throw error(404, `Offering with ID ${id} not found.`);
    }

    const offering = result.recordset[0] as WholesalerItemOffering_ProductDef_Category_Supplier;

    // The response now correctly wraps the data in an 'offering' property.
    const response: ApiSuccessResponse<{ offering: WholesalerItemOffering_ProductDef_Category_Supplier }> = {
      success: true,
      message: "Offering retrieved successfully.",
      data: { offering },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning detailed offering data.`);
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
 * PUT /api/offerings/[id]
 * @description Update offering.
 */
export const PUT: RequestHandler = async ({ request }) => {
  log.infoHeader("PUT /api/offerings/[id]");
  const operationId = uuidv4();
  log.info(`[${operationId}] PUT /category-offerings: FN_START`);

  try {
    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    // Extract offering ID from the request data
    const { offering_id } = requestData;
    if (!offering_id) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "offering_id is required for update operations.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Missing offering_id.`);
      return json(errRes, { status: 400 });
    }

    const validation = validateOffering(requestData, { mode: "update" });
    if (!validation.isValid) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Validation failed.",
        status_code: 400,
        error_code: "VALIDATION_ERROR",
        errors: validation.errors,
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
      return json(errRes, { status: 400 });
    }

    const { wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment } =
      validation.sanitized as Partial<WholesalerItemOffering>;

    // Verify the offering exists and get current context
    const existsCheck = await db.request().input("offeringId", offering_id).query(`
                SELECT wio.offering_id, wio.wholesaler_id, wio.category_id,
                       w.name as supplier_name, pc.name as category_name
                FROM dbo.wholesaler_item_offerings wio
                LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                WHERE wio.offering_id = @offeringId
            `);

    if (existsCheck.recordset.length === 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Offering with ID ${offering_id} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Offering not found for update.`, { offering_id });
      return json(errRes, { status: 404 });
    }

    const result = await db
      .request()
      .input("offering_id", offering_id)
      .input("wholesaler_id", wholesaler_id)
      .input("category_id", category_id)
      .input("product_def_id", product_def_id)
      .input("size", size)
      .input("dimensions", dimensions)
      .input("price", price)
      .input("currency", currency)
      .input("comment", comment).query(`
                UPDATE dbo.wholesaler_item_offerings 
                SET wholesaler_id=@wholesaler_id, category_id=@category_id, product_def_id=@product_def_id,
                    size=@size, dimensions=@dimensions, price=@price, currency=@currency, comment=@comment
                OUTPUT INSERTED.* 
                WHERE offering_id = @offering_id
            `);

    if (result.recordset.length === 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Offering with ID ${offering_id} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Offering not found for update.`);
      return json(errRes, { status: 404 });
    }

    const response: ApiSuccessResponse<{ offering: WholesalerItemOffering }> = {
      success: true,
      message: "Offering updated successfully.",
      data: { offering: result.recordset[0] as WholesalerItemOffering },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Offering updated.`, { offering_id });
    return json(response);
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
    throw error(status, message);
  }
};

/**
 * DELETE /api/category-offerings
 * @description Deletes an offering with dependency checks.
 */
export const DELETE: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  log.infoHeader(`DELETE /api/offerings/[id] - ${operationId}`);

  try {
    const body: DeleteRequest<WholesalerItemOffering> = await request.json();
    const { id: offering_id, cascade = false } = body;
    log.debug(`[${operationId}] Parsed request body`, { offering_id, cascade });

    if (!offering_id) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "offering_id is required.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing offering_id.`);
      return json(errRes, { status: 400 });
    }

    const dependencies = await checkOfferingDependencies(offering_id);
    if (dependencies.length > 0 && !cascade) {
      const conflictResponse: DeleteConflictResponse<string[]> = {
        success: false,
        message: "Cannot delete offering: dependencies exist.",
        status_code: 409,
        error_code: "DEPENDENCY_CONFLICT",
        dependencies: {soft: dependencies, hard: []},
        cascade_available: true,
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies });
      return json(conflictResponse, { status: 409 });
    }

    const transaction = db.transaction();
    await transaction.begin();
    log.info(`[${operationId}] Transaction started.`);

    try {
      if (cascade && dependencies.length > 0) {
        log.info(`[${operationId}] Performing cascade delete.`);

        // Delete offering attributes
        await transaction
          .request()
          .input("offeringId", offering_id)
          .query("DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id = @offeringId");

        // Delete offering links
        await transaction
          .request()
          .input("offeringId", offering_id)
          .query("DELETE FROM dbo.wholesaler_offering_links WHERE offering_id = @offeringId");
      }

      // Get offering details before deletion
      const offeringResult = await transaction.request().input("offering_id", offering_id).query(`
                    SELECT wio.offering_id, pd.title as product_def_title,
                           w.name as supplier_name, pc.name as category_name
                    FROM dbo.wholesaler_item_offerings wio
                    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                    LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                    LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                    WHERE wio.offering_id = @offering_id
                `);

      if (offeringResult.recordset.length === 0) {
        await transaction.rollback();
        const errRes: ApiErrorResponse = {
          success: false,
          message: `Offering with ID ${offering_id} not found to delete.`,
          status_code: 404,
          error_code: "NOT_FOUND",
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn(`[${operationId}] FN_FAILURE: Offering not found during delete.`);
        return json(errRes, { status: 404 });
      }

      const offeringDetails = offeringResult.recordset[0];

      // Delete the offering
      await transaction
        .request()
        .input("offering_id", offering_id)
        .query("DELETE FROM dbo.wholesaler_item_offerings WHERE offering_id = @offering_id");

      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      const response: DeleteSuccessResponse<{
        offering_id: number;
        product_def_title: string;
        supplier_name: string;
        category_name: string;
      }> = {
        success: true,
        message: `Offering "${offeringDetails.product_def_title}" deleted successfully from category "${offeringDetails.category_name}".`,
        data: {
          deleted_resource: {
            offering_id: offeringDetails.offering_id,
            product_def_title: offeringDetails.product_def_title || "Unknown Product",
            supplier_name: offeringDetails.supplier_name || "Unknown Supplier",
            category_name: offeringDetails.category_name || "Unknown Category",
          },
          cascade_performed: cascade,
          dependencies_cleared: dependencies.length,
        },
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: Offering deleted.`, {
        deletedId: offeringDetails.offering_id,
        cascade,
      });
      return json(response);
    } catch (err) {
      await transaction.rollback();
      log.error(`[${operationId}] FN_EXCEPTION: Transaction failed and was rolled back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
    throw error(status, message);
  }
};
