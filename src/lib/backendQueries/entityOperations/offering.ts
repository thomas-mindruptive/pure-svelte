import type { WholesalerItemOffering } from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { buildWhereClause, type BuildContext } from "../queryBuilder";
import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "../queryGrammar";
import { error } from "@sveltejs/kit";
import { assertDefined } from "$lib/utils/assertions";

export async function loadNestedOfferingsWithJoinsAndLinks(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering>,
  aOrderBy?: SortDescriptor<WholesalerItemOffering>[],
  aLimit?: number,
  aOffset?: number,
): Promise<string> {
  assertDefined(transaction, "transaction");

  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (aWhere) {
    whereClause = `WHERE ${buildWhereClause(aWhere, ctx, true)}`; // hasJoins = true (we use JOINs)
  }

  // Build ORDER BY clause
  let orderByClause = "";
  if (aOrderBy && aOrderBy.length > 0) {
    orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
  } else if (aLimit || aOffset) {
    // SQL Server requires ORDER BY for OFFSET/FETCH
    orderByClause = "ORDER BY wio.offering_id ASC";
  }

  // Build LIMIT/OFFSET clause (SQL Server syntax)
  let limitClause = "";
  if (aLimit && aLimit > 0) {
    limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
  } else if (aOffset && aOffset > 0) {
    // Only OFFSET without LIMIT - fetch all remaining rows
    limitClause = `OFFSET ${aOffset} ROWS`;
  }

  const request = transaction.request();

  // Dynamische Parameter binden
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  // Using JOINs instead of subqueries for better performance.
  // JSON PATH automatically nests based on dotted aliases (e.g. 'product_def.title').
  const result = await request.query(`
    SELECT
        -- Main offering columns
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
        wio.price,
        wio.weight_grams,
        wio.currency,
        wio.comment,
        wio.created_at,
        wio.is_assortment,
        -- Product definition (nested via dotted alias)
        pd.product_def_id AS 'product_def.product_def_id',
        pd.category_id AS 'product_def.category_id',
        pd.title AS 'product_def.title',
        pd.description AS 'product_def.description',
        pd.material_id AS 'product_def.material_id',
        pd.form_id AS 'product_def.form_id',
        pd.construction_type_id AS 'product_def.construction_type_id',
        pd.surface_finish_id AS 'product_def.surface_finish_id',
        pd.for_liquids AS 'product_def.for_liquids',
        pd.created_at AS 'product_def.created_at',
        -- Category (nested via dotted alias)
        pc.category_id AS 'category.category_id',
        pc.product_type_id AS 'category.product_type_id',
        pc.name AS 'category.name',
        pc.description AS 'category.description',
        -- Wholesaler (nested via dotted alias)
        w.wholesaler_id AS 'wholesaler.wholesaler_id',
        w.name AS 'wholesaler.name',
        w.country AS 'wholesaler.country',
        w.region AS 'wholesaler.region',
        w.b2b_notes AS 'wholesaler.b2b_notes',
        w.status AS 'wholesaler.status',
        w.dropship AS 'wholesaler.dropship',
        w.website AS 'wholesaler.website',
        w.email AS 'wholesaler.email',
        w.price_range AS 'wholesaler.price_range',
        w.relevance AS 'wholesaler.relevance',
        w.created_at AS 'wholesaler.created_at',
        -- Links (still subquery due to 1:N relationship)
        (
            SELECT l.link_id, l.offering_id, l.url, l.notes, l.created_at
            FROM dbo.wholesaler_offering_links AS l
            WHERE l.offering_id = wio.offering_id
            FOR JSON PATH
        ) AS links
    FROM dbo.wholesaler_item_offerings AS wio
    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
    LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
    LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
    ${whereClause}
    ${orderByClause}
    ${limitClause}
    FOR JSON PATH, INCLUDE_NULL_VALUES
  `);

  if (!result.recordset?.length) {
    throw error(404, "No offerings found for the given criteria.");
  }

  // FOR JSON PATH returns JSON in the first column of the first row
  const firstRow = result.recordset[0];
  const jsonString = firstRow[Object.keys(firstRow)[0]];
  return jsonString;
}

export async function loadNestedOfferingWithJoinsAndLinksForId(transaction: Transaction, id: number) {
  assertDefined(transaction, "transaction");
  assertDefined(id, "id");
  const whereCondition: WhereCondition<WholesalerItemOffering> = { key: "offering_id", whereCondOp: "=", val: id };
  const jsonString = await loadNestedOfferingsWithJoinsAndLinks(transaction, whereCondition);
  return jsonString;
}

export async function loadFlatOfferingsWithJoinsAndLinks(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering>,
  aOrderBy?: SortDescriptor<WholesalerItemOffering>[],
  aLimit?: number,
  aOffset?: number,
): Promise<any[]> {
  assertDefined(transaction, "transaction");

  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (aWhere) {
    whereClause = `WHERE ${buildWhereClause(aWhere, ctx, true)}`; // hasJoins = true (we use JOINs)
  }

  // Build ORDER BY clause
  let orderByClause = "";
  if (aOrderBy && aOrderBy.length > 0) {
    orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
  } else if (aLimit || aOffset) {
    // SQL Server requires ORDER BY for OFFSET/FETCH
    orderByClause = "ORDER BY wio.offering_id ASC";
  }

  // Build LIMIT/OFFSET clause (SQL Server syntax)
  let limitClause = "";
  if (aLimit && aLimit > 0) {
    limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
  } else if (aOffset && aOffset > 0) {
    // Only OFFSET without LIMIT - fetch all remaining rows
    limitClause = `OFFSET ${aOffset} ROWS`;
  }

  const request = transaction.request();

  // Dynamische Parameter binden
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  // Query ausführen - FLAT structure mit LEFT JOINs
  const result = await request.query(`
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
        wio.is_assortment,
        pd.title AS product_def_title,
        pd.description AS product_def_description,
        pc.name AS category_name,
        pc.description AS category_description,
        w.name AS wholesaler_name,
        (
            SELECT l.link_id, l.offering_id, l.url, l.notes, l.created_at
            FROM dbo.wholesaler_offering_links AS l
            WHERE l.offering_id = wio.offering_id
            FOR JSON PATH
        ) AS links
    FROM dbo.wholesaler_item_offerings AS wio
    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
    LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
    LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
    ${whereClause}
    ${orderByClause}
    ${limitClause}
  `);

  if (!result.recordset?.length) {
    throw error(404, "No offerings found for the given criteria.");
  }

  // Parse links JSON für jede Row
  return result.recordset.map((row: any) => ({
    ...row,
    links: row.links ? JSON.parse(row.links) : null,
  }));
}

export async function loadFlatOfferingWithJoinsAndLinksForId(transaction: Transaction, id: number): Promise<any> {
  assertDefined(transaction, "transaction");
  assertDefined(id, "id");

  const whereCondition: WhereCondition<WholesalerItemOffering> = { key: "wio.offering_id", whereCondOp: "=", val: id };
  // No need for orderBy/limit/offset when fetching single record by ID
  const results = await loadFlatOfferingsWithJoinsAndLinks(transaction, whereCondition);

  if (!results || results.length === 0) {
    throw error(404, `Offering with ID ${id} not found.`);
  }

  return results[0];
}
