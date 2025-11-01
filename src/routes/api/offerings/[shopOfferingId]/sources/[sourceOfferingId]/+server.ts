import { db } from "$lib/backendQueries/db";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { log } from "$lib/utils/logger";
import { v4 as uuidv4 } from "uuid";
import type { DeleteApiResponse, ApiErrorResponse } from "$lib/api/api.types";

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
    // Check if link exists before deletion
    const checkResult = await db.request()
      .input("shopId", shopId)
      .input("sourceId", sourceId)
      .query(`
        SELECT shop_offering_id, source_offering_id, priority
        FROM dbo.shop_offering_sources
        WHERE shop_offering_id = @shopId AND source_offering_id = @sourceId
      `);

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

    // Delete the link
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

    log.info(`[${operationId}] Successfully deleted source offering link`, {
      shopId,
      sourceId,
      rowsAffected,
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

    return json(successRes, { status: 200 });
  } catch (err) {
    log.error(`[${operationId}] Failed to delete source offering link`, { error: err });
    throw error(500, `Failed to delete source offering link: ${err}`);
  }
};
