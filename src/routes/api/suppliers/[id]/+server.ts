// src/routes/api/suppliers/[id]/+server.ts

/**
 * @file Individual Supplier API Endpoints - FINAL ARCHITECTURE
 * @description Provides type-safe CRUD operations for a single supplier, fully aligned
 * with the final generic type system and comprehensive logging standards.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildQuery, executeQuery } from "$lib/backendQueries/queryBuilder";
import { supplierQueryConfig } from "$lib/backendQueries/queryConfig";
import { checkWholesalerDependencies } from "$lib/dataModel/dependencyChecks";
import { LogicalOperator, ComparisonOperator, type QueryPayload, type WhereCondition } from "$lib/backendQueries/queryGrammar";
import { WholesalerSchema, type Wholesaler } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiSuccessResponse,
  DeleteConflictResponse,
  DeleteRequest,
  QueryRequest,
  QuerySuccessResponse,
} from "$lib/api/api.types";
import { deleteSupplier } from "$lib/dataModel/deletes";
import type { DeleteSupplierSuccessResponse } from "$lib/api/app/appSpecificTypes";
import { buildUnexpectedError, validateAndUpdateEntity, validateIdUrlParam } from "$lib/backendQueries/entityOperations";

/**
 * GET /api/suppliers/[id] - Get a single, complete supplier record.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/suppliers/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    // Return an ApiErrorResponse and an appropriated HTTP status.
    if (errorResponse) {
      return errorResponse;
    }

    // Direkte Abfrage, da keine komplexe Filterung vom Client kommt
    const result = await db.request().input("id", id).query("SELECT * FROM dbo.wholesalers WHERE wholesaler_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Supplier with ID ${id} not found.`);
    }

    const supplier = result.recordset[0] as Wholesaler;

    // Einfache, direkte Erfolgsantwort ohne Query-Metadaten
    const response: ApiSuccessResponse<{ supplier: Wholesaler }> = {
      success: true,
      message: "Supplier retrieved successfully.",
      data: { supplier },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning supplier data.`);
    return json(response);
  } catch (err: unknown) {
    // Wenn es kein 404-Fehler war, den Smart Error Handler nutzen
    if ((err as { status: number })?.status !== 404) {
      return buildUnexpectedError(err, info);
    }
    throw err; // Den 404-Fehler erneut werfen
  }
};

/**
 * POST /api/suppliers/[id] - Get a single supplier with flexible fields.
 * ⚠️ Does NOT create a supplier. => /api/suppliers/new POST
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/suppliers/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    // Return an ApiErrorResponse and an appropriated HTTP status.
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = (await request.json()) as QueryRequest<Wholesaler>;
    const clientPayload = requestBody.payload;
    log.info(`[${operationId}] Parsed request body`, { clientPayload });

    const supplierIdCondition: WhereCondition<Wholesaler> = { key: "wholesaler_id", whereCondOp: ComparisonOperator.EQUALS, val: id };
    const securePayload: QueryPayload<Wholesaler> = {
      ...clientPayload,
      from: { table: "dbo.wholesalers", alias: "w" },
      where: clientPayload.where
        ? {
            whereCondOp: LogicalOperator.AND,
            conditions: [supplierIdCondition, clientPayload.where],
          }
        : {
            whereCondOp: LogicalOperator.AND,
            conditions: [supplierIdCondition],
          },
      limit: 1,
    };

    const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
    const results = await executeQuery(sql, parameters);

    const response: QuerySuccessResponse<Wholesaler> = {
      success: true,
      message: "Supplier retrieved successfully.",
      data: {
        results: results as Partial<Wholesaler>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: "dbo.wholesalers",
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
 * PUT /api/suppliers/[id] - Update an existing supplier.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/suppliers/${params.id} - ${operationId}`
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    // Return an ApiErrorResponse and an appropriated HTTP status.
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { requestData });
    return validateAndUpdateEntity(WholesalerSchema, id, "wholesaler_id", requestData, "supplier");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/suppliers/[id] - Delete a supplier with dependency checks.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/suppliers/${params.id} - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    // Return an ApiErrorResponse and an appropriated HTTP status.
    if (errorResponse) {
      return errorResponse;
    }

    const body: DeleteRequest<Wholesaler> = await request.json();
    log.info(`[${operationId}] DELETE /suppliers/${id}: FN_START`, { params, request, body });

    const cascade = body.cascade || false;
    const forceCascade = body.forceCascade || false;

    const transaction = db.transaction();
    await transaction.begin();

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkWholesalerDependencies(id, transaction);
      let cascade_available = true;
      if (hard.length > 0) {
        cascade_available = false;
      }
      // If we have soft dependencies without cascade
      // or we have hard dependencies without forceCascade => Return error code.
      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot delete supplier: dependencies exist.",
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

      // We correctly check for hard and soft dependencies above => It is safe to "cascade || forceCascade".
      const deletedSupplierStats = await deleteSupplier(id, cascade || forceCascade, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteSupplierSuccessResponse = {
        success: true,
        message: `Supplier "${deletedSupplierStats.deleted.name}" deleted successfully.`,
        data: {
          deleted_resource: deletedSupplierStats.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: deletedSupplierStats.stats.total,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Supplier deleted.`, {
        deletedId: deletedSupplierStats.deleted.wholesaler_id,
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
