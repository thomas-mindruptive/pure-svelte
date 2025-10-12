import type { WholesalerItemOffering } from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { buildWhereClause, type BuildContext } from "../queryBuilder";
import type { WhereCondition, WhereConditionGroup } from "../queryGrammar";
import { error } from "@sveltejs/kit";

export async function loadOfferingsWithJoinsAndLinks(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering>,
): Promise<string> {
  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (aWhere) {
    whereClause = `WHERE ${buildWhereClause(aWhere, ctx)}`;
  }

  const request = transaction.request();

  // Dynamische Parameter binden
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  // Query ausführen
  const result = await request.query(`
    SELECT (
        SELECT
            wio.offering_id,
            wio.wholesaler_id,
            wio.category_id,
            wio.product_def_id,
            wio.sub_seller,
            wio.material_id,
            wio.form_id,
            wio.title,
            wio.size,
            wio.dimensions,
            wio.weight_grams,
            wio.price,
            wio.currency,
            wio.comment,
            wio.created_at,
            (
                SELECT pd.product_def_id, pd.category_id, pd.title, pd.description,
                       pd.material_id, pd.form_id, pd.for_liquids, pd.created_at
                FROM dbo.product_definitions AS pd
                WHERE pd.product_def_id = wio.product_def_id
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS product_def,
            (
                SELECT pc.category_id, pc.name, pc.description
                FROM dbo.product_categories AS pc
                WHERE pc.category_id = wio.category_id
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS category,
            (
                SELECT w.wholesaler_id, w.name, w.country, w.region,
                       w.b2b_notes, w.status, w.dropship, w.website,
                       w.email, w.price_range, w.relevance, w.created_at
                FROM dbo.wholesalers AS w
                WHERE w.wholesaler_id = wio.wholesaler_id
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS wholesaler,
            (
                SELECT l.link_id, l.url, l.notes, l.created_at
                FROM dbo.wholesaler_offering_links AS l
                WHERE l.offering_id = wio.offering_id
                FOR JSON PATH
            ) AS links
        FROM dbo.wholesaler_item_offerings AS wio
        ${whereClause}
        FOR JSON PATH, INCLUDE_NULL_VALUES
    ) AS json_result;
  `);

  if (!result.recordset?.length) {
    throw error(404, "No offerings found for the given criteria.");
  }

  const jsonString = result.recordset[0].json_result;
  return jsonString;
}

export async function loadOfferingsWithJoinsAndLinksForId(transaction: Transaction, id: number) {
  const whereCondition: WhereCondition<WholesalerItemOffering> = { key: "offering_id", whereCondOp: "=", val: id };
  const jsonString = await loadOfferingsWithJoinsAndLinks(transaction, whereCondition);
  return jsonString;
}
