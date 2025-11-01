import { db } from "$lib/backendQueries/db";
import { loadNestedOfferingsWithJoinsAndLinks } from "$lib/backendQueries/entityOperations/offering";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { log } from "$lib/utils/logger";
import { v4 as uuidv4 } from "uuid";
import type { ApiSuccessResponse, QueryResponseData } from "$lib/api/api.types";
import type { Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";

/**
 * GET /api/offerings/[id]/sources
 *
 * Loads source offerings for a shop offering (wholesaler_id = 99).
 * Returns offerings linked via shop_offering_sources table, ordered by priority.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const { id } = params;
  const shopOfferingId = parseInt(id, 10);

  log.infoHeader(`GET /api/offerings/${id}/sources - ${operationId}`);

  if (isNaN(shopOfferingId)) {
    log.warn(`[${operationId}] FN_FAILURE: Invalid offering ID`, { id });
    throw error(400, "Invalid offering ID");
  }

  const transaction = db.transaction();
  let transactionStarted = false;

  try {
    log.debug(`[${operationId}] Starting transaction for shop offering ${shopOfferingId}`);
    await transaction.begin();
    transactionStarted = true;

    log.debug(`[${operationId}] Loading source offerings with nested joins`);
    // Use loadNestedOfferingsWithJoinsAndLinks with custom JOIN
    // to get source offerings ordered by priority
    const jsonString = await loadNestedOfferingsWithJoinsAndLinks(
      transaction,
      {
        key: "sos.shop_offering_id" as any, // Custom field from additional JOIN
        whereCondOp: "=",
        val: shopOfferingId,
      },
      [
        { key: "sos.priority" as any, direction: "asc" }, // Custom field from additional JOIN
        { key: "wio.offering_id" as any, direction: "asc" },
      ],
      undefined,
      undefined,
      // Custom JOIN to link via shop_offering_sources
      `
      INNER JOIN dbo.shop_offering_sources sos
        ON wio.offering_id = sos.source_offering_id
      `
    );

    log.debug(`[${operationId}] Committing transaction`);
    await transaction.commit();
    transactionStarted = false;

    // Parse JSON string to array (SQL Server returns null for empty results)
    const offeringsArray = jsonString ? JSON.parse(jsonString) : [];
    log.debug(`[${operationId}] Parsed ${offeringsArray.length} offerings from JSON.`);

    const responseData: QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
      results: offeringsArray as any,
      meta: {
        retrieved_at: new Date().toISOString(),
        result_count: offeringsArray.length,
        columns_selected: ["*"],
        has_joins: true,
        has_where: true,
        parameter_count: 1,
        table_fixed: "wholesaler_item_offerings",
        sql_generated: "nested JSON query with shop_offering_sources JOIN",
      },
    };

    const response: ApiSuccessResponse<QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks>> = {
      success: true,
      message: "Source offerings retrieved successfully.",
      data: responseData,
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${offeringsArray.length} source offerings.`);
    return json(response);
  } catch (err) {
    log.error(`[${operationId}] Failed to load source offerings`, {
      shopOfferingId,
      transactionStarted,
      error: err,
    });

    if (transactionStarted) {
      try {
        log.debug(`[${operationId}] Rolling back transaction`);
        await transaction.rollback();
      } catch (rollbackErr) {
        log.error(`[${operationId}] Rollback failed`, { error: rollbackErr });
      }
    }

    throw error(500, `Failed to load source offerings: ${err}`);
  }
};
