import { db } from "$lib/backendQueries/db";
import { copyOffering } from "$lib/backendQueries/entityOperations/offering";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { v4 as uuidv4 } from "uuid";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError } from "$lib/backendQueries/genericEntityOperations";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";

/**
 * POST /api/offerings/[id]/copy
 *
 * Creates a copy of an offering by copying all its data.
 * No special logic - just a generic copy with optional modifications via request body.
 *
 * Request body (optional):
 * {
 *   modifications?: Partial<WholesalerItemOffering>
 * }
 *
 * Returns: { new_offering_id: number }
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/${params.id}/copy - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /offerings/${params.id}/copy: FN_START`);

  const { id } = params;
  const sourceOfferingId = parseInt(id, 10);

  if (isNaN(sourceOfferingId)) {
    log.warn(`[${operationId}] FN_FAILURE: Invalid offering ID`, { id });
    throw error(400, "Invalid offering ID");
  }

  const transaction = db.transaction();

  try {
    // Parse optional request body for modifications
    let modifications: any = {};
    try {
      const body = await request.json();
      modifications = body.modifications || {};
      log.debug(`[${operationId}] Request body parsed`, { modifications });
    } catch (err) {
      // No body or invalid JSON - that's fine, use empty modifications
      log.debug(`[${operationId}] No request body or invalid JSON, using empty modifications`);
    }

    // Add default comment if not provided
    if (!modifications.comment) {
      modifications.comment = `Copied from offering ${sourceOfferingId}`;
    }

    log.info(`[${operationId}] Starting transaction for copying offering ${sourceOfferingId}`);
    await transaction.begin();

    try {
      log.debug(`[${operationId}] Calling copyOffering()`, { sourceOfferingId, modifications });
      const newOfferingId = await copyOffering(transaction, sourceOfferingId, modifications);

      log.debug(`[${operationId}] Committing transaction`);
      await transaction.commit();

      log.info(`[${operationId}] FN_SUCCESS: Offering copied successfully`, {
        source_offering_id: sourceOfferingId,
        new_offering_id: newOfferingId,
      });

      return json(
        {
          success: true,
          message: "Offering copied successfully",
          data: { new_offering_id: newOfferingId },
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 201 },
      );
    } catch (err) {
      await rollbackTransaction(transaction);
      log.error(`[${operationId}] Transaction failed, rolling back`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    log.error(`[${operationId}] FN_FAILURE: Failed to copy offering`, {
      sourceOfferingId,
      error: err,
    });
    return buildUnexpectedError(err, info);
  }
};
