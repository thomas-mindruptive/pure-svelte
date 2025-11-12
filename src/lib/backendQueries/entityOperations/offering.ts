import type { WholesalerItemOffering, Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";
import { WholesalerItemOfferingForCreateSchema } from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { buildWhereClause, type BuildContext } from "../queryBuilder";
import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "../queryGrammar";
import { assertDefined } from "$lib/utils/assertions";
import { error } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { insertRecordWithTransaction } from "../genericEntityOperations";
import type { z } from "zod";

/**
 * Loads a single nested offering by ID using the optimized approach.
 * Returns an array with a single offering object.
 */
export async function loadNestedOfferingWithJoinsAndLinksForId(transaction: Transaction, id: number): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> {
  assertDefined(transaction, "transaction");
  assertDefined(id, "id");
  const whereCondition: WhereCondition<WholesalerItemOffering> = {
    key: "wio.offering_id",
    whereCondOp: "=",
    val: id
  };
  return await loadNestedOfferingsOptimized(transaction, whereCondition);
}

/**
 * OPTIMIZED VERSION: Loads nested offerings using Table Variable approach
 *
 * Performance improvements:
 * - No correlated subqueries (Links and Shop Offerings loaded separately)
 * - Single batch with 3 statements (1 roundtrip to DB)
 * - Scalable for large result sets (100s or 1000s of offerings)
 * - Table Variable ensures ORDER BY and LIMIT work correctly
 *
 * Returns: Array of offerings with nested links (objects, not JSON string)
 */
export async function loadNestedOfferingsOptimized(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering>,
  aOrderBy?: SortDescriptor<WholesalerItemOffering>[],
  aLimit?: number,
  aOffset?: number,
  customJoinClause?: string,
): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> {
  assertDefined(transaction, "transaction");
  log.debug(`loadNestedOfferingsOptimized`, {aWhere, aOrderBy, aLimit, aOffset, customJoinClause});

  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (aWhere) {
    whereClause = buildWhereClause(aWhere, ctx, true);
  } else {
    whereClause = "1=1"; // Fallback for no WHERE clause
  }

  // Build ORDER BY clause
  let orderByClause = "";
  if (aOrderBy && aOrderBy.length > 0) {
    orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
  } else if (aLimit || aOffset) {
    orderByClause = "ORDER BY wio.offering_id ASC";
  }

  // Build LIMIT/OFFSET clause
  let limitClause = "";
  if (aLimit && aLimit > 0) {
    limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
  } else if (aOffset && aOffset > 0) {
    limitClause = `OFFSET ${aOffset} ROWS`;
  }

  const request = transaction.request();

  // Bind parameters
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  const sqlBatch = `
    -- Table Variable for filtered Offering IDs
    DECLARE @offering_ids TABLE (offering_id INT PRIMARY KEY);

    -- STEP 1: Collect IDs (with WHERE, ORDER BY, LIMIT applied)
    INSERT INTO @offering_ids (offering_id)
    SELECT wio.offering_id
    FROM dbo.wholesaler_item_offerings AS wio
    ${customJoinClause || ""}
    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
    LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
    LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
    WHERE ${whereClause}
    ${orderByClause}
    ${limitClause};

    -- STEP 2: Query for offerings and nested data (returns single JSON string)
    SELECT (
        SELECT
            wio.offering_id,
            wio.wholesaler_id,
            wio.category_id,
            wio.product_def_id,
            wio.sub_seller,
            wio.wholesaler_article_number,
            wio.material_id,
            wio.form_id,
            wio.title,
            wio.size,
            wio.dimensions,
            wio.packaging,
            wio.price,
            wio.weight_grams,
            wio.weight_range,
            wio.currency,
            wio.comment,
            wio.created_at,
            wio.is_assortment,
            wio.override_material,
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
            -- Shop offering (nested via dotted alias) - 1:1 via shop_offering_sources
            shop.offering_id AS 'shop_offering.offering_id',
            shop.wholesaler_id AS 'shop_offering.wholesaler_id',
            shop.category_id AS 'shop_offering.category_id',
            shop.product_def_id AS 'shop_offering.product_def_id',
            shop.sub_seller AS 'shop_offering.sub_seller',
            shop.material_id AS 'shop_offering.material_id',
            shop.form_id AS 'shop_offering.form_id',
            shop.title AS 'shop_offering.title',
            shop.size AS 'shop_offering.size',
            shop.dimensions AS 'shop_offering.dimensions',
            shop.price AS 'shop_offering.price',
            shop.weight_grams AS 'shop_offering.weight_grams',
            shop.weight_range AS 'shop_offering.weight_range',
            shop.currency AS 'shop_offering.currency',
            shop.comment AS 'shop_offering.comment',
            shop.created_at AS 'shop_offering.created_at',
            shop.is_assortment AS 'shop_offering.is_assortment',
            shop.override_material AS 'shop_offering.override_material'
        FROM @offering_ids ids
        INNER JOIN dbo.wholesaler_item_offerings wio ON ids.offering_id = wio.offering_id
        ${customJoinClause || ""}
        LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
        LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
        LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
        LEFT JOIN dbo.shop_offering_sources sos ON wio.offering_id = sos.source_offering_id
        LEFT JOIN dbo.wholesaler_item_offerings shop ON sos.shop_offering_id = shop.offering_id
        ${orderByClause}
        FOR JSON PATH
    ) AS offerings_json;

    -- STEP 3: Query for links (returns single JSON string)
    SELECT (
        SELECT
            l.offering_id,
            l.link_id,
            l.url,
            l.notes,
            l.created_at
        FROM dbo.wholesaler_offering_links l
        INNER JOIN @offering_ids ids ON l.offering_id = ids.offering_id
        FOR JSON PATH
    ) AS links_json;
  `;

  log.debug('========================================');
  log.debug('OPTIMIZED SQL BATCH (Table Variable):');
  log.debug(sqlBatch);
  log.debug('PARAMETERS:', ctx.parameters);
  log.debug('========================================');

  const t0 = Date.now();
  const result = await request.query(sqlBatch);
  log.debug(`[OPTIMIZED] Batch query took: ${Date.now() - t0}ms`);

  // Cast recordsets to array for type safety
  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];

  // Check if first result set is empty
  if (recordsets.length === 0 || !recordsets[0] || recordsets[0].length === 0) {
    return [];
  }

  // FOR JSON PATH returns a single row with a JSON string column
  const offeringsJson = recordsets[0][0]?.offerings_json;
  const linksJson = recordsets[1]?.[0]?.links_json;

  // Parse the JSON strings
  const offerings = offeringsJson ? JSON.parse(offeringsJson) : [];
  const links = linksJson ? JSON.parse(linksJson) : [];

  log.debug(`Found ${offerings.length} offerings and ${links.length} links.`)

  // --- Merge Process ---

  // 1. Create a map for fast access to links
  const linksByOfferingId = new Map<number, any[]>();
  links.forEach((link: any) => {
    if (!linksByOfferingId.has(link.offering_id)) {
      linksByOfferingId.set(link.offering_id, []);
    }
    linksByOfferingId.get(link.offering_id)!.push(link);
  });

  // 2. Add links to offerings
  offerings.forEach((offering: any) => {
    // shop_offering is already correctly nested (or null)
    // Add links from the map
    offering.links = linksByOfferingId.get(offering.offering_id) || [];
  });

  // Return array of objects directly (no stringify needed)
  return offerings;
}

/**
 * Generic function to copy an offering.
 *
 * @param transaction - Database transaction
 * @param sourceOfferingId - ID of the offering to copy
 * @param modifications - Optional modifications to apply to the copied offering (e.g., change wholesaler_id, comment, etc.)
 * @returns The new offering ID
 *
 * @example
 * // Copy offering and change wholesaler to shop (99)
 * const newId = await copyOffering(transaction, 123, {
 *   wholesaler_id: 99,
 *   comment: "Copied from offering 123"
 * });
 */
export async function copyOffering(
  transaction: Transaction,
  sourceOfferingId: number,
  modifications?: Partial<WholesalerItemOffering>
): Promise<number> {
  assertDefined(transaction, "transaction");
  assertDefined(sourceOfferingId, "sourceOfferingId");

  log.debug(`copyOffering: Copying offering ${sourceOfferingId}`, { modifications });

  // 1. Load source offering
  const sourceOfferings = await loadNestedOfferingWithJoinsAndLinksForId(transaction, sourceOfferingId);

  if (!sourceOfferings || sourceOfferings.length === 0) {
    throw error(404, `Source offering ${sourceOfferingId} not found`);
  }

  const sourceOffering = sourceOfferings[0];

  // 2. Copy offering data and apply modifications
  const copiedOfferingData: z.infer<typeof WholesalerItemOfferingForCreateSchema> = {
    ...sourceOffering,
    ...modifications, // Apply any modifications (e.g., wholesaler_id, comment)
  };

  // 2.1. Extend comment (if not explicitly overridden in modifications)
  if (!modifications?.comment) {
    const originalComment = sourceOffering.comment || '';
    copiedOfferingData.comment = originalComment
      ? `${originalComment}\n\nCopied from offering ${sourceOfferingId}`
      : `Copied from offering ${sourceOfferingId}`;
  }

  // 3. Validate using schema for create (removes offering_id, created_at, etc.)
  const validated = WholesalerItemOfferingForCreateSchema.parse(copiedOfferingData);

  // 4. Insert new offering
  const insertedRecord = await insertRecordWithTransaction(
    WholesalerItemOfferingForCreateSchema,
    validated,
    transaction
  );

  const newOfferingId = insertedRecord.offering_id as number;

  log.info(`copyOffering: Created new offering ${newOfferingId} from source ${sourceOfferingId}`);

  return newOfferingId;
}

/**
 * Copies all links from a source offering to a target offering.
 *
 * @param transaction - Active database transaction
 * @param sourceOfferingId - ID of offering to copy links FROM
 * @param targetOfferingId - ID of offering to copy links TO
 * @returns Number of links copied
 *
 * @example
 * const linkCount = await copyLinksForOffering(transaction, 123, 456);
 * log.info(`Copied ${linkCount} links from offering 123 to 456`);
 */
export async function copyLinksForOffering(
  transaction: Transaction,
  sourceOfferingId: number,
  targetOfferingId: number
): Promise<number> {
  assertDefined(transaction, "transaction");
  assertDefined(sourceOfferingId, "sourceOfferingId");
  assertDefined(targetOfferingId, "targetOfferingId");

  log.debug(`copyLinksForOffering: Copying links from ${sourceOfferingId} to ${targetOfferingId}`);

  const request = transaction.request();
  request.input('sourceId', sourceOfferingId);
  request.input('targetId', targetOfferingId);

  const result = await request.query(`
    INSERT INTO dbo.wholesaler_offering_links (offering_id, url, notes)
    SELECT @targetId, url, notes
    FROM dbo.wholesaler_offering_links
    WHERE offering_id = @sourceId
  `);

  const linkCount = result.rowsAffected[0] || 0;
  log.info(`copyLinksForOffering: Copied ${linkCount} links from ${sourceOfferingId} to ${targetOfferingId}`);

  return linkCount;
}

// export async function loadFlatOfferingsWithJoinsAndLinks(
//   transaction: Transaction,
//   aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering>,
//   aOrderBy?: SortDescriptor<WholesalerItemOffering>[],
//   aLimit?: number,
//   aOffset?: number,
// ): Promise<any[]> {
//   assertDefined(transaction, "transaction");

//   const ctx: BuildContext = {
//     parameters: {},
//     paramIndex: 0,
//   };

//   let whereClause = "";
//   if (aWhere) {
//     whereClause = `WHERE ${buildWhereClause(aWhere, ctx, true)}`; // hasJoins = true (we use JOINs)
//   }

//   // Build ORDER BY clause
//   let orderByClause = "";
//   if (aOrderBy && aOrderBy.length > 0) {
//     orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
//   } else if (aLimit || aOffset) {
//     // SQL Server requires ORDER BY for OFFSET/FETCH
//     orderByClause = "ORDER BY wio.offering_id ASC";
//   }

//   // Build LIMIT/OFFSET clause (SQL Server syntax)
//   let limitClause = "";
//   if (aLimit && aLimit > 0) {
//     limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
//   } else if (aOffset && aOffset > 0) {
//     // Only OFFSET without LIMIT - fetch all remaining rows
//     limitClause = `OFFSET ${aOffset} ROWS`;
//   }

//   const request = transaction.request();

//   // Dynamische Parameter binden
//   for (const [key, value] of Object.entries(ctx.parameters)) {
//     request.input(key, value);
//   }

//   // Query ausführen - FLAT structure mit LEFT JOINs
//   const result = await request.query(`
//     SELECT
//         wio.offering_id,
//         wio.wholesaler_id,
//         wio.category_id,
//         wio.product_def_id,
//         wio.sub_seller,
//         wio.wholesaler_article_number,
//         wio.material_id,
//         wio.form_id,
//         wio.title,
//         wio.size,
//         wio.dimensions,
//         wio.packaging,
//         wio.weight_grams,
//         wio.weight_range,
//         wio.price,
//         wio.currency,
//         wio.comment,
//         wio.created_at,
//         wio.is_assortment,
//         wio.override_material,
//         pd.title AS product_def_title,
//         pd.description AS product_def_description,
//         pc.name AS category_name,
//         pc.description AS category_description,
//         w.name AS wholesaler_name,
//         (
//             SELECT l.link_id, l.offering_id, l.url, l.notes, l.created_at
//             FROM dbo.wholesaler_offering_links AS l
//             WHERE l.offering_id = wio.offering_id
//             FOR JSON PATH
//         ) AS links
//     FROM dbo.wholesaler_item_offerings AS wio
//     LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
//     LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
//     LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
//     ${whereClause}
//     ${orderByClause}
//     ${limitClause}
//   `);

//   if (!result.recordset?.length) {
//     throw error(404, "No offerings found for the given criteria.");
//   }

//   // Parse links JSON für jede Row
//   return result.recordset.map((row: any) => ({
//     ...row,
//     links: row.links ? JSON.parse(row.links) : null,
//   }));
// }

// export async function loadFlatOfferingWithJoinsAndLinksForId(transaction: Transaction, id: number): Promise<any> {
//   assertDefined(transaction, "transaction");
//   assertDefined(id, "id");

//   const whereCondition: WhereCondition<WholesalerItemOffering> = { key: "wio.offering_id", whereCondOp: "=", val: id };
//   // No need for orderBy/limit/offset when fetching single record by ID
//   const results = await loadFlatOfferingsWithJoinsAndLinks(transaction, whereCondition);

//   if (!results || results.length === 0) {
//     throw error(404, `Offering with ID ${id} not found.`);
//   }

//   return results[0];
// }

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
        wio.wholesaler_article_number,
        wio.material_id,
        wio.form_id,
        wio.surface_finish_id,
        wio.construction_type_id,
        wio.color_variant,
        wio.title,
        wio.size,
        wio.dimensions,
        wio.packaging,
        wio.weight_grams,
        wio.weight_range,
        wio.price,
        wio.currency,
        wio.comment,
        wio.created_at,
        wio.is_assortment,
        wio.override_material,

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

/**
 * Loads offerings from the view_offerings_pt_pc_pd view.
 * This provides the complete "breadth" of offering data including product type, category, and all lookups.
 *
 * @param transaction - Active database transaction
 * @param aWhere - Optional WHERE conditions (use view column names like "wioMaterialName", "pdefMatName")
 * @param aOrderBy - Optional sort descriptors (use view column names)
 * @param aLimit - Optional limit for pagination
 * @param aOffset - Optional offset for pagination
 * @returns Array of flat offering report rows
 */
export async function loadOfferingsFromView(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<any> | WhereCondition<any>,
  aOrderBy?: SortDescriptor<any>[],
  aLimit?: number,
  aOffset?: number,
): Promise<any[]> {
  assertDefined(transaction, "transaction");
  log.debug(`loadOfferingsFromView`, { aWhere, aOrderBy, aLimit, aOffset });

  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (aWhere) {
    whereClause = `WHERE ${buildWhereClause(aWhere, ctx, false)}`; // hasJoins = false (view, not table joins)
  }

  // Build ORDER BY clause
  let orderByClause = "";
  if (aOrderBy && aOrderBy.length > 0) {
    orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
  } else if (aLimit || aOffset) {
    orderByClause = "ORDER BY wioId ASC"; // Default order for pagination
  }

  // Build LIMIT/OFFSET clause
  let limitClause = "";
  if (aLimit && aLimit > 0) {
    limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
  } else if (aOffset && aOffset > 0) {
    limitClause = `OFFSET ${aOffset} ROWS`;
  }

  const request = transaction.request();

  // Bind parameters
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  const sql = `
    SELECT *
    FROM dbo.view_offerings_pt_pc_pd
    ${whereClause}
    ${orderByClause}
    ${limitClause}
  `;

  log.debug('========================================');
  log.debug('VIEW QUERY SQL:');
  log.debug(sql);
  log.debug('PARAMETERS:', ctx.parameters);
  log.debug('========================================');

  const t0 = Date.now();
  const result = await request.query(sql);
  log.debug(`[VIEW] Query took: ${Date.now() - t0}ms`);

  if (!result.recordset?.length) {
    return [];
  }

  return result.recordset;
}

/**
 * Loads offerings from the view_offerings_pt_pc_pd view WITH LINKS.
 * Similar to loadNestedOfferingsOptimized, but uses the view as base.
 *
 * @param transaction - Active database transaction
 * @param aWhere - Optional WHERE conditions (use view column names)
 * @param aOrderBy - Optional sort descriptors (use view column names)
 * @param aLimit - Optional limit for pagination
 * @param aOffset - Optional offset for pagination
 * @returns Array of flat offering report rows with links array added
 */
export async function loadOfferingsFromViewWithLinks(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<any> | WhereCondition<any>,
  aOrderBy?: SortDescriptor<any>[],
  aLimit?: number,
  aOffset?: number,
  rawWhere?: string,
): Promise<any[]> {
  assertDefined(transaction, "transaction");
  log.debug(`loadOfferingsFromViewWithLinks`, { aWhere, aOrderBy, aLimit, aOffset, rawWhere });

  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (rawWhere) {
    // Superuser mode: use raw SQL WHERE clause directly
    // Validation should be done by caller!
    whereClause = `WHERE ${rawWhere}`;
    log.warn(`[SUPERUSER MODE] Using raw WHERE clause: ${rawWhere}`);
  } else if (aWhere) {
    whereClause = `WHERE ${buildWhereClause(aWhere, ctx, false)}`;
  }

  // Build ORDER BY clause
  let orderByClause = "";
  if (aOrderBy && aOrderBy.length > 0) {
    orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
  } else if (aLimit || aOffset) {
    orderByClause = "ORDER BY wioId ASC";
  }

  // Build LIMIT/OFFSET clause
  let limitClause = "";
  if (aLimit && aLimit > 0) {
    limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
  } else if (aOffset && aOffset > 0) {
    limitClause = `OFFSET ${aOffset} ROWS`;
  }

  const request = transaction.request();

  // Bind parameters
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  // Batch query: View + Links (similar pattern to loadNestedOfferingsOptimized)
  const sqlBatch = `
    -- Table Variable for filtered Offering IDs
    DECLARE @offering_ids TABLE (offering_id INT PRIMARY KEY);

    -- STEP 1: Collect IDs from view (with WHERE, ORDER BY, LIMIT applied)
    INSERT INTO @offering_ids (offering_id)
    SELECT wioId
    FROM dbo.view_offerings_pt_pc_pd
    ${whereClause}
    ${orderByClause}
    ${limitClause};

    -- STEP 2: Query view data for these IDs (maintains sort order)
    SELECT *
    FROM dbo.view_offerings_pt_pc_pd v
    INNER JOIN @offering_ids ids ON v.wioId = ids.offering_id
    ${orderByClause};

    -- STEP 3: Query for links (returns single JSON string)
    SELECT (
        SELECT
            l.offering_id,
            l.link_id,
            l.url,
            l.notes,
            l.created_at
        FROM dbo.wholesaler_offering_links l
        INNER JOIN @offering_ids ids ON l.offering_id = ids.offering_id
        FOR JSON PATH
    ) AS links_json;
  `;

  log.debug('========================================');
  log.debug('VIEW WITH LINKS SQL BATCH:');
  log.debug(sqlBatch);
  log.debug('PARAMETERS:', ctx.parameters);
  log.debug('========================================');

  const t0 = Date.now();
  const result = await request.query(sqlBatch);
  log.debug(`[VIEW WITH LINKS] Batch query took: ${Date.now() - t0}ms`);

  // Cast recordsets to array for type safety
  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];

  // Check if first result set is empty
  if (recordsets.length === 0 || !recordsets[0] || recordsets[0].length === 0) {
    return [];
  }

  // Offerings from view (recordset 0)
  const offerings = recordsets[0];

  // Links JSON (recordset 1)
  const linksJson = recordsets[1]?.[0]?.links_json;
  const links = linksJson ? JSON.parse(linksJson) : [];

  log.debug(`Found ${offerings.length} offerings and ${links.length} links.`);

  // --- Merge Process ---

  // 1. Create a map for fast access to links
  const linksByOfferingId = new Map<number, any[]>();
  links.forEach((link: any) => {
    if (!linksByOfferingId.has(link.offering_id)) {
      linksByOfferingId.set(link.offering_id, []);
    }
    linksByOfferingId.get(link.offering_id)!.push(link);
  });

  // 2. Add links to offerings (view uses wioId)
  offerings.forEach((offering: any) => {
    offering.links = linksByOfferingId.get(offering.wioId) || [];
  });

  return offerings;
}
