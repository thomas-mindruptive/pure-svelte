import { db } from "$lib/backendQueries/db";
import { loadNestedOfferingsWithJoinsAndLinks } from "$lib/backendQueries/entityOperations/offering";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * GET /api/offerings/[id]/sources
 *
 * Loads source offerings for a shop offering (wholesaler_id = 99).
 * Returns offerings linked via shop_offering_sources table, ordered by priority.
 */
export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;
  const shopOfferingId = parseInt(id, 10);

  if (isNaN(shopOfferingId)) {
    throw error(400, "Invalid offering ID");
  }

  const transaction = db.transaction();

  try {
    await transaction.begin();

    // Use loadNestedOfferingsWithJoinsAndLinks with custom JOIN
    // to get source offerings ordered by priority
    const result = await loadNestedOfferingsWithJoinsAndLinks(
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

    await transaction.commit();

    return json(result, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    await transaction.rollback();
    console.error("Failed to load source offerings:", err);
    throw error(500, `Failed to load source offerings: ${err}`);
  }
};
