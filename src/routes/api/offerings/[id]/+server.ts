// src/routes/api/offerings/[id]/+server.ts

/**
 * @file Individual Offering API Endpoint
 * @description Provides GET operation for a single, detailed offering record.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateIdUrlParam } from "$lib/backendQueries/entityOperations";
import {
  WholesalerItemOfferingSchema,
  WholesalerItemOffering_ProductDef_Category_SupplierSchema,
  type WholesalerItemOffering,
  type WholesalerItemOffering_ProductDef_Category_Supplier,
} from "$lib/domain/domainTypes";
import { validateEntity } from "$lib/domain/domainTypes.utils";
import { v4 as uuidv4 } from "uuid";
import type { ApiErrorResponse, ApiSuccessResponse, DeleteConflictResponse, DeleteRequest } from "$lib/api/api.types";
import { checkOfferingDependencies } from "$lib/backendQueries/dependencyChecks";
import type { DeleteOfferingSuccessResponse } from "$lib/api/app/appSpecificTypes";
import { deleteOffering } from "$lib/backendQueries/cascadingDeleteOperations";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";

/**
 * GET /api/offerings/[id]
 * @description Retrieves a single, detailed offering record including product and category names.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/offerings/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /offerings/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }
    // This query joins all necessary tables to build the
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

    const serialized = JSON.parse(JSON.stringify(result.recordset[0]));

    // Serialize and deserialize object to ensure validation is the same as on client.
    // If not: validation fails, because record contains "date" object whereas schema "string".
    // Changing schema to date does not help, because JSON serialization converts it to string anyway
    // => Client always receives iso-string.

    // TODO: all GET <path>/id endpoints should validate retrieved record.
    const validation = validateEntity(WholesalerItemOffering_ProductDef_Category_SupplierSchema, serialized);
    const debugError = false; // ONLY FOR DEBUG!
    if (!validation.isValid || debugError) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Data validation failed for retrieved offering record.",
        status_code: 500,
        error_code: "INTERNAL_SERVER_ERROR",
        errors: validation.errors,
        meta: { timestamp: new Date().toISOString() },
      };
      log.error(`[${operationId}] FN_FAILURE: Database record validation failed.`, { errors: validation.errors });
      return json(errRes, { status: 500 });
    }

    const offering = validation.sanitized as WholesalerItemOffering_ProductDef_Category_Supplier;

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
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/offerings/[id]
 * @description Update offering.
 */
export const PUT: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/offerings/[id] - ${operationId}`;
  log.infoHeader(info);
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

    const validation = validateEntity(WholesalerItemOfferingSchema, requestData);
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
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/offerings/[id]
 * @description Deletes an offering master data record, strictly following the established
 * architectural pattern for dependency checking and cascading.
 */
export const DELETE: RequestHandler = async ({ params, request }): Promise<Response> => {
  const operationId = uuidv4();
  const info = `DELETE /api/offerings/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /offerings/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const body: DeleteRequest<WholesalerItemOffering> = await request.json();
    const cascade = body.cascade || false;
    const forceCascade = body.forceCascade || false;
    log.debug(`[${operationId}] Parsed request body`, { id, cascade, forceCascade });

    const transaction = db.transaction();
    await transaction.begin();
    log.info(`[${operationId}] Transaction started for offering deletion.`);

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkOfferingDependencies(id, transaction);
      log.info(`Offering has dependent objects:`, { hard, soft });

      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        await rollbackTransaction(transaction);
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot delete offering: It is still in use by other entities.",
          status_code: 409,
          error_code: "DEPENDENCY_CONFLICT",
          dependencies: { hard, soft },
          cascade_available: hard.length === 0,
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies: { hard, soft } });
        return json(conflictResponse, { status: 409 });
      }

      // === DELETE =================================================================================

      const deletedInfo = await deleteOffering(id, cascade || forceCascade, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteOfferingSuccessResponse = {
        success: true,
        message: `Offering (ID: ${deletedInfo.deleted.offering_id}) deleted successfully.`,
        data: {
          deleted_resource: deletedInfo.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: deletedInfo.stats.total,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Offering deleted.`, { responseData: response.data });
      return json(response);
    } catch (err) {
      await rollbackTransaction(transaction);
      log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
