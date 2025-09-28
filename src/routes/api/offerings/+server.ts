// src/routes/api/offerings/+server.ts

/**
 * @file Offerings List API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/offerings - Provides type-safe, paginated, and filterable
 * access to the wholesaler_item_offerings list. It strictly follows the "Secure Entity Endpoint"
 * pattern by enforcing the database table name on the server.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { supplierQueryConfig } from "$lib/backendQueries/queryConfig";
import { buildUnexpectedError } from "$lib/backendQueries/entityOperations";
import type { WholesalerItemOffering } from "$lib/domain/domainTypes";
import type {
  QueryRequest,
  QuerySuccessResponse,
  ApiErrorResponse,
} from "$lib/api/api.types";
import { v4 as uuidv4 } from "uuid";


/**
 * POST /api/offerings
 * @description Fetches a list of offerings based on a client-provided query payload.
 * This endpoint provides access to wholesaler item offerings with optional filtering,
 * sorting, and pagination capabilities.
 */
export const POST: RequestHandler = async (event) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /offerings: FN_START`);

  try {
    // 1. Expect the standard QueryRequest envelope and extract the payload.
    const requestBody = (await event.request.json()) as QueryRequest<WholesalerItemOffering>;
    const clientPayload = requestBody.payload;

    if (!clientPayload) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Request body must be a valid QueryRequest object containing a `payload`.",
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Malformed request body.`, { body: requestBody });
      return json(errRes, { status: 400 });
    }

    log.info(`[${operationId}] Parsed request payload`, {
      select: clientPayload.select,
      where: clientPayload.where,
      limit: clientPayload.limit,
      hasOrderBy: !!clientPayload.orderBy,
    });

    // 3. Build and execute the query.
    const { sql, parameters, metadata } = buildQuery(clientPayload, supplierQueryConfig, undefined, {
      table: "dbo.wholesaler_item_offerings",
      alias: "wio",
    });
    const results = await executeQuery(sql, parameters);

    // 4. Format the response using the standard `QuerySuccessResponse` type.
    const response: QuerySuccessResponse<WholesalerItemOffering> = {
      success: true,
      message: "Offerings retrieved successfully.",
      data: {
        results: results as Partial<WholesalerItemOffering>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: "dbo.wholesaler_item_offerings",
          sql_generated: sql.replace(/\s+/g, " ").trim(),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} offerings.`, {
      hasFilter: metadata.hasWhere,
      hasJoins: metadata.hasJoins,
      executionTime: metadata.parameterCount,
    });

    return json(response);
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

// /**
//  * PUT /api/category-offerings
//  * @description Updates an existing offering within category context.
//  */
// export const PUT: RequestHandler = async ({ request }) => {
//   log.infoHeader("PUT /api/offerings/[id]");
//   const operationId = uuidv4();
//   log.info(`[${operationId}] PUT /category-offerings: FN_START`);

//   try {
//     const requestData = await request.json();
//     log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

//     // Extract offering ID from the request data
//     const { offering_id } = requestData;
//     if (!offering_id) {
//       const errRes: ApiErrorResponse = {
//         success: false,
//         message: "offering_id is required for update operations.",
//         status_code: 400,
//         error_code: "BAD_REQUEST",
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.warn(`[${operationId}] FN_FAILURE: Missing offering_id.`);
//       return json(errRes, { status: 400 });
//     }

//     const validation = validateOffering(requestData, { mode: "update" });
//     if (!validation.isValid) {
//       const errRes: ApiErrorResponse = {
//         success: false,
//         message: "Validation failed.",
//         status_code: 400,
//         error_code: "VALIDATION_ERROR",
//         errors: validation.errors,
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
//       return json(errRes, { status: 400 });
//     }

//     const { wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment } =
//       validation.sanitized as Partial<WholesalerItemOffering>;

//     // Verify the offering exists and get current context
//     const existsCheck = await db.request().input("offeringId", offering_id).query(`
//                 SELECT wio.offering_id, wio.wholesaler_id, wio.category_id,
//                        w.name as supplier_name, pc.name as category_name
//                 FROM dbo.wholesaler_item_offerings wio
//                 LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
//                 LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
//                 WHERE wio.offering_id = @offeringId
//             `);

//     if (existsCheck.recordset.length === 0) {
//       const errRes: ApiErrorResponse = {
//         success: false,
//         message: `Offering with ID ${offering_id} not found.`,
//         status_code: 404,
//         error_code: "NOT_FOUND",
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.warn(`[${operationId}] FN_FAILURE: Offering not found for update.`, { offering_id });
//       return json(errRes, { status: 404 });
//     }

//     const result = await db
//       .request()
//       .input("offering_id", offering_id)
//       .input("wholesaler_id", wholesaler_id)
//       .input("category_id", category_id)
//       .input("product_def_id", product_def_id)
//       .input("size", size)
//       .input("dimensions", dimensions)
//       .input("price", price)
//       .input("currency", currency)
//       .input("comment", comment).query(`
//                 UPDATE dbo.wholesaler_item_offerings 
//                 SET wholesaler_id=@wholesaler_id, category_id=@category_id, product_def_id=@product_def_id,
//                     size=@size, dimensions=@dimensions, price=@price, currency=@currency, comment=@comment
//                 OUTPUT INSERTED.* 
//                 WHERE offering_id = @offering_id
//             `);

//     if (result.recordset.length === 0) {
//       const errRes: ApiErrorResponse = {
//         success: false,
//         message: `Offering with ID ${offering_id} not found.`,
//         status_code: 404,
//         error_code: "NOT_FOUND",
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.warn(`[${operationId}] FN_FAILURE: Offering not found for update.`);
//       return json(errRes, { status: 404 });
//     }

//     const response: ApiSuccessResponse<{ offering: WholesalerItemOffering }> = {
//       success: true,
//       message: "Offering updated successfully.",
//       data: { offering: result.recordset[0] as WholesalerItemOffering },
//       meta: { timestamp: new Date().toISOString() },
//     };

//     log.info(`[${operationId}] FN_SUCCESS: Offering updated.`, { offering_id });
//     return json(response);
//   } catch (err: unknown) {
//     const { status, message } = mssqlErrorMapper.mapToHttpError(err);
//     log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
//     throw error(status, message);
//   }
// };

// /**
//  * DELETE /api/category-offerings
//  * @description Deletes an offering from a category context with dependency checks.
//  */
// export const DELETE: RequestHandler = async ({ request }) => {
//   log.infoHeader("DELETE /api/offerings/[id]");
//   const operationId = uuidv4();
//   log.info(`[${operationId}] DELETE /category-offerings: FN_START`);

//   try {
//     const body: DeleteRequest<WholesalerItemOffering> = await request.json();
//     const { id: offering_id, cascade = false } = body;
//     log.debug(`[${operationId}] Parsed request body`, { offering_id, cascade });

//     if (!offering_id) {
//       const errRes: ApiErrorResponse = {
//         success: false,
//         message: "offering_id is required.",
//         status_code: 400,
//         error_code: "BAD_REQUEST",
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing offering_id.`);
//       return json(errRes, { status: 400 });
//     }

//     const dependencies = await checkOfferingDependencies(offering_id);
//     if (dependencies.length > 0 && !cascade) {
//       const conflictResponse: DeleteConflictResponse<string[]> = {
//         success: false,
//         message: "Cannot delete offering: dependencies exist.",
//         status_code: 409,
//         error_code: "DEPENDENCY_CONFLICT",
//         dependencies: { soft: dependencies, hard: [] },
//         cascade_available: true,
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies });
//       return json(conflictResponse, { status: 409 });
//     }

//     const transaction = db.transaction();
//     await transaction.begin();
//     log.info(`[${operationId}] Transaction started.`);

//     try {
//       if (cascade && dependencies.length > 0) {
//         log.info(`[${operationId}] Performing cascade delete.`);

//         // Delete offering attributes
//         await transaction
//           .request()
//           .input("offeringId", offering_id)
//           .query("DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id = @offeringId");

//         // Delete offering links
//         await transaction
//           .request()
//           .input("offeringId", offering_id)
//           .query("DELETE FROM dbo.wholesaler_offering_links WHERE offering_id = @offeringId");
//       }

//       // Get offering details before deletion
//       const offeringResult = await transaction.request().input("offering_id", offering_id).query(`
//                     SELECT wio.offering_id, pd.title as product_def_title,
//                            w.name as supplier_name, pc.name as category_name
//                     FROM dbo.wholesaler_item_offerings wio
//                     LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
//                     LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
//                     LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
//                     WHERE wio.offering_id = @offering_id
//                 `);

//       if (offeringResult.recordset.length === 0) {
//         await transaction.rollback();
//         const errRes: ApiErrorResponse = {
//           success: false,
//           message: `Offering with ID ${offering_id} not found to delete.`,
//           status_code: 404,
//           error_code: "NOT_FOUND",
//           meta: { timestamp: new Date().toISOString() },
//         };
//         log.warn(`[${operationId}] FN_FAILURE: Offering not found during delete.`);
//         return json(errRes, { status: 404 });
//       }

//       const offeringDetails = offeringResult.recordset[0];

//       // Delete the offering
//       await transaction
//         .request()
//         .input("offering_id", offering_id)
//         .query("DELETE FROM dbo.wholesaler_item_offerings WHERE offering_id = @offering_id");

//       await transaction.commit();
//       log.info(`[${operationId}] Transaction committed.`);

//       const response: DeleteSuccessResponse<{
//         offering_id: number;
//         product_def_title: string;
//         supplier_name: string;
//         category_name: string;
//       }> = {
//         success: true,
//         message: `Offering "${offeringDetails.product_def_title}" deleted successfully from category "${offeringDetails.category_name}".`,
//         data: {
//           deleted_resource: {
//             offering_id: offeringDetails.offering_id,
//             product_def_title: offeringDetails.product_def_title || "Unknown Product",
//             supplier_name: offeringDetails.supplier_name || "Unknown Supplier",
//             category_name: offeringDetails.category_name || "Unknown Category",
//           },
//           cascade_performed: cascade,
//           dependencies_cleared: dependencies.length,
//         },
//         meta: { timestamp: new Date().toISOString() },
//       };

//       log.info(`[${operationId}] FN_SUCCESS: Offering deleted.`, {
//         deletedId: offeringDetails.offering_id,
//         cascade,
//       });
//       return json(response);
//     } catch (err) {
//       await transaction.rollback();
//       log.error(`[${operationId}] FN_EXCEPTION: Transaction failed and was rolled back.`, { error: err });
//       throw err;
//     }
//   } catch (err: unknown) {
//     const { status, message } = mssqlErrorMapper.mapToHttpError(err);
//     log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
//     throw error(status, message);
//   }
// };
