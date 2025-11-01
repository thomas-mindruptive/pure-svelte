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
  aAdditionalJoins?: string,
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
  const sqlQuery = `
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
        ) AS links,
        -- Shop offering (subquery to avoid duplicates and JOIN conflicts)
        -- JSON_QUERY prevents outer FOR JSON PATH from escaping the inner JSON as a string
        JSON_QUERY((
            SELECT TOP 1
                shop.offering_id,
                shop.wholesaler_id,
                shop.category_id,
                shop.product_def_id,
                shop.sub_seller,
                shop.material_id,
                shop.form_id,
                shop.title,
                shop.size,
                shop.dimensions,
                shop.price,
                shop.weight_grams,
                shop.currency,
                shop.comment,
                shop.created_at,
                shop.is_assortment
            FROM dbo.shop_offering_sources sos_sub
            INNER JOIN dbo.wholesaler_item_offerings shop ON sos_sub.shop_offering_id = shop.offering_id
            WHERE sos_sub.source_offering_id = wio.offering_id
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )) AS shop_offering
    FROM dbo.wholesaler_item_offerings AS wio
    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
    LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
    LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
    ${aAdditionalJoins || ''}
    ${whereClause}
    ${orderByClause}
    ${limitClause}
    FOR JSON PATH
  `;

  console.log('========================================');
  console.log('COMPLETE SQL QUERY:');
  console.log(sqlQuery);
  console.log('PARAMETERS:', ctx.parameters);
  console.log('========================================');

  const result = await request.query(sqlQuery);

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
  const whereCondition: WhereCondition<WholesalerItemOffering> = { key: "wio.offering_id" as any, whereCondOp: "=", val: id };
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

/**
 * Loads offerings with all lookup data needed for AI image generation analysis.
 * Includes JOINs for: product_def, material, form, surface_finish, construction_type.
 * Uses FOR JSON PATH to return nested structure.
 *
 * @param transaction - Active database transaction
 * @param filters - Filter criteria for image generation
 * @returns JSON string with offerings including all lookup data
 */
export interface ImageAnalysisFilters {
  is_assortment?: boolean;
  min_price?: number;
  max_price?: number;
  category_ids?: number[];
  material_ids?: number[];
  wholesaler_ids?: number[];
}

export async function loadOfferingsForImageAnalysis(
  transaction: Transaction,
  filters: ImageAnalysisFilters = {}
): Promise<string> {
  assertDefined(transaction, "transaction");

  const request = transaction.request();

  // Build WHERE conditions dynamically
  const whereConditions: string[] = [];

  if (filters.is_assortment !== undefined) {
    request.input('is_assortment', filters.is_assortment);
    whereConditions.push('wio.is_assortment = @is_assortment');
  }

  if (filters.min_price !== undefined) {
    request.input('min_price', filters.min_price);
    whereConditions.push('wio.price >= @min_price');
  }

  if (filters.max_price !== undefined) {
    request.input('max_price', filters.max_price);
    whereConditions.push('wio.price <= @max_price');
  }

  if (filters.category_ids && filters.category_ids.length > 0) {
    whereConditions.push(`pd.category_id IN (${filters.category_ids.join(',')})`);
  }

  if (filters.material_ids && filters.material_ids.length > 0) {
    whereConditions.push(`wio.material_id IN (${filters.material_ids.join(',')})`);
  }

  if (filters.wholesaler_ids && filters.wholesaler_ids.length > 0) {
    whereConditions.push(`wio.wholesaler_id IN (${filters.wholesaler_ids.join(',')})`);
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

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
        wio.surface_finish_id,
        wio.construction_type_id,
        wio.color_variant,
        wio.title,
        wio.size,
        wio.dimensions,
        wio.weight_grams,
        wio.price,
        wio.currency,
        wio.comment,
        wio.created_at,
        wio.is_assortment,

        -- Product definition (nested)
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

        -- Product definition's category with product_type
        pc.category_id AS 'product_def.category.category_id',
        pc.name AS 'product_def.category.name',
        pc.product_type_id AS 'product_def.category.product_type_id',

        pt.product_type_id AS 'product_def.category.product_type.product_type_id',
        pt.name AS 'product_def.category.product_type.name',

        -- Product definition's lookups (nested in product_def)
        pd_m.material_id AS 'product_def.material.material_id',
        pd_m.name AS 'product_def.material.name',
        pd_m.essence_type AS 'product_def.material.essence_type',

        pd_f.form_id AS 'product_def.form.form_id',
        pd_f.name AS 'product_def.form.name',

        pd_sf.surface_finish_id AS 'product_def.surface_finish.surface_finish_id',
        pd_sf.name AS 'product_def.surface_finish.name',
        pd_sf.description AS 'product_def.surface_finish.description',

        pd_ct.construction_type_id AS 'product_def.construction_type.construction_type_id',
        pd_ct.name AS 'product_def.construction_type.name',
        pd_ct.description AS 'product_def.construction_type.description',

        -- Material (nested)
        m.material_id AS 'material.material_id',
        m.name AS 'material.name',
        m.essence_type AS 'material.essence_type',

        -- Form (nested)
        f.form_id AS 'form.form_id',
        f.name AS 'form.name',

        -- Surface Finish (nested)
        sf.surface_finish_id AS 'surface_finish.surface_finish_id',
        sf.name AS 'surface_finish.name',
        sf.description AS 'surface_finish.description',

        -- Construction Type (nested)
        ct.construction_type_id AS 'construction_type.construction_type_id',
        ct.name AS 'construction_type.name',
        ct.description AS 'construction_type.description'

    FROM dbo.wholesaler_item_offerings AS wio
    INNER JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
    -- Product definition's category and product_type
    LEFT JOIN dbo.product_categories pc ON pd.category_id = pc.category_id
    LEFT JOIN dbo.product_types pt ON pc.product_type_id = pt.product_type_id
    -- Offering's own lookups
    LEFT JOIN dbo.materials m ON wio.material_id = m.material_id
    LEFT JOIN dbo.forms f ON wio.form_id = f.form_id
    LEFT JOIN dbo.surface_finishes sf ON wio.surface_finish_id = sf.surface_finish_id
    LEFT JOIN dbo.construction_types ct ON wio.construction_type_id = ct.construction_type_id
    -- Product definition's lookups (for COALESCE inheritance)
    LEFT JOIN dbo.materials pd_m ON pd.material_id = pd_m.material_id
    LEFT JOIN dbo.forms pd_f ON pd.form_id = pd_f.form_id
    LEFT JOIN dbo.surface_finishes pd_sf ON pd.surface_finish_id = pd_sf.surface_finish_id
    LEFT JOIN dbo.construction_types pd_ct ON pd.construction_type_id = pd_ct.construction_type_id
    ${whereClause}
    ORDER BY wio.offering_id ASC
    FOR JSON PATH
  `);

  if (!result.recordset?.length) {
    return "[]"; // Return empty array if no results
  }

  // FOR JSON PATH returns JSON in the first column of the first row
  const firstRow = result.recordset[0];
  const jsonString = firstRow[Object.keys(firstRow)[0]];

  return jsonString || "[]";
}
