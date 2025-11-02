import { db } from "$lib/backendQueries/db";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { log } from "$lib/utils/logger";
import { v4 as uuidv4 } from "uuid";
import type { DeleteApiResponse, ApiErrorResponse, ApiSuccessResponse } from "$lib/api/api.types";

/**
 * POST /api/offerings/[shopOfferingId]/sources/[sourceOfferingId]
 *
 * Links a source offering to a shop offering.
 * Creates an entry in shop_offering_sources table with priority = 0.
 */
export const POST: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const { shopOfferingId, sourceOfferingId } = params;
  const shopId = parseInt(shopOfferingId, 10);
  const sourceId = parseInt(sourceOfferingId, 10);

  log.infoHeader(`POST /api/offerings/${shopOfferingId}/sources/${sourceOfferingId} - ${operationId}`);

  if (isNaN(shopId) || isNaN(sourceId)) {
    const errRes: ApiErrorResponse = {
      success: false,
      message: "Invalid shop offering ID or source offering ID",
      status_code: 400,
      error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() },
    };
    log.warn(`[${operationId}] FN_FAILURE: Invalid IDs`, { shopOfferingId, sourceOfferingId });
    return json(errRes, { status: 400 });
  }

  try {
    // Check if link already exists
    const checkResult = await db.request()
      .input("shopId", shopId)
      .input("sourceId", sourceId)
      .query(`
        SELECT shop_offering_id, source_offering_id
        FROM dbo.shop_offering_sources
        WHERE shop_offering_id = @shopId AND source_offering_id = @sourceId
      `);

    if (checkResult.recordset.length > 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Source offering is already linked to this shop offering",
        status_code: 409,
        error_code: "ALREADY_EXISTS",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Link already exists`, { shopId, sourceId });
      return json(errRes, { status: 409 });
    }

    // Create the link with default priority 0
    const insertResult = await db.request()
      .input("shopId", shopId)
      .input("sourceId", sourceId)
      .input("priority", 0)
      .query(`
        INSERT INTO dbo.shop_offering_sources (shop_offering_id, source_offering_id, priority)
        OUTPUT INSERTED.*
        VALUES (@shopId, @sourceId, @priority)
      `);

    const linkData = insertResult.recordset[0];

    log.info(`[${operationId}] FN_SUCCESS: Created source offering link`, {
      shopId,
      sourceId,
      linkData,
    });

    const successRes: ApiSuccessResponse<{ link: typeof linkData }> = {
      success: true,
      message: "Source offering linked successfully",
      data: { link: linkData },
      meta: { timestamp: new Date().toISOString() },
    };

    return json(successRes, { status: 201 });
  } catch (err) {
    log.error(`[${operationId}] FN_FAILURE: Failed to create source offering link`, {
      shopId,
      sourceId,
      error: err,
    });
    throw error(500, `Failed to create source offering link: ${err}`);
  }
};

/**
 * DELETE /api/offerings/[shopOfferingId]/sources/[sourceOfferingId]
 *
 * Removes the link between a shop offering and a source offering.
 * Only deletes the entry in shop_offering_sources table.
 * The source offering itself remains intact.
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const { shopOfferingId, sourceOfferingId } = params;
  const shopId = parseInt(shopOfferingId, 10);
  const sourceId = parseInt(sourceOfferingId, 10);

  log.infoHeader(`DELETE /api/offerings/${shopOfferingId}/sources/${sourceOfferingId} - ${operationId}`);
  log.debug(`[${operationId}] Parsed IDs:`, {
    shopOfferingId,
    sourceOfferingId,
    shopId,
    sourceId,
    shopIdType: typeof shopId,
    sourceIdType: typeof sourceId,
  });

  if (isNaN(shopId) || isNaN(sourceId)) {
    const errRes: ApiErrorResponse = {
      success: false,
      message: "Invalid shop offering ID or source offering ID",
      status_code: 400,
      error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() },
    };
    log.warn(`[${operationId}] FN_FAILURE: Invalid IDs`, { shopOfferingId, sourceOfferingId });
    return json(errRes, { status: 400 });
  }

  try {
    log.debug(`[${operationId}] Checking if link exists`);
    // Check if link exists before deletion
    const checkResult = await db.request()
      .input("shopId", shopId)
      .input("sourceId", sourceId)
      .query(`
        SELECT shop_offering_id, source_offering_id, priority
        FROM dbo.shop_offering_sources
        WHERE shop_offering_id = @shopId AND source_offering_id = @sourceId
      `);

    log.debug(`[${operationId}] Check result:`, {
      recordCount: checkResult.recordset.length,
      records: checkResult.recordset,
    });

    if (checkResult.recordset.length === 0) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: "Source offering link not found",
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Link not found`, { shopId, sourceId });
      return json(errRes, { status: 404 });
    }

    const linkData = checkResult.recordset[0];
    log.debug(`[${operationId}] Found link to delete:`, linkData);

    // Delete the link
    log.debug(`[${operationId}] Executing DELETE query`);
    const deleteResult = await db.request()
      .input("shopId", shopId)
      .input("sourceId", sourceId)
      .query(`
        DELETE FROM dbo.shop_offering_sources
        WHERE shop_offering_id = @shopId AND source_offering_id = @sourceId
      `);

    const rowsAffected = Array.isArray(deleteResult.rowsAffected)
      ? deleteResult.rowsAffected.reduce((a, b) => a + b, 0)
      : (deleteResult.rowsAffected ?? 0);

    log.info(`[${operationId}] FN_SUCCESS: Deleted source offering link`, {
      shopId,
      sourceId,
      rowsAffected,
      linkData,
    });

    const successRes: DeleteApiResponse<typeof linkData, never> = {
      success: true,
      message: "Source offering link removed successfully",
      data: {
        deleted_resource: linkData,
        cascade_performed: false,
        dependencies_cleared: 0,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.debug(`[${operationId}] Returning success response:`, successRes);
    return json(successRes, { status: 200 });
  } catch (err) {
    log.error(`[${operationId}] FN_FAILURE: Failed to delete source offering link`, {
      shopId,
      sourceId,
      error: err,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });
    throw error(500, `Failed to delete source offering link: ${err}`);
  }
};
