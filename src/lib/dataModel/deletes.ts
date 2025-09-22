// in lib/dataModel/cascadingDeletes.ts (oder umbenannt in z.B. `lib/dataModel/productDefinition.ts`)

import { assertDefined } from "$lib/utils/assertions";
import { log } from "$lib/utils/logger";
import type { Transaction } from "mssql";
import type { ProductCategory, ProductDefinition, Wholesaler } from "$lib/domain/domainTypes";

/**
 * The shapes of the data returned after a successful deletion.
 */
export type DeletedProductDefinitionData = Pick<ProductDefinition, "product_def_id" | "title">;
export type DeletedSupplierData = Pick<Wholesaler, "wholesaler_id" | "name">;
export type DeletedProductCategoryData = Pick<ProductCategory, "category_id" | "name">;

/**
 * Deletes a Product Definition, with an option to cascade and delete all its dependencies.
 * It first queries the product definition to retrieve its data for the response,
 * then executes the appropriate delete logic within the provided transaction.
 *
 * @param id The ID of the ProductDefinition to delete.
 * @param cascade If true, performs a deep cascade delete of all dependent offerings, attributes, and links.
 *                If false, attempts to delete only the product definition itself.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted product definition.
 * @throws An error if the product definition with the given ID is not found.
 */
export async function deleteProductDefinition(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedProductDefinitionData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteProductDefinition`);
  log.info(`(delete) Preparing to delete ProductDefinition ID: ${id} with cascade=${cascade}`);

  const productDefIdParam = "productDefId";

  // 1) Read product definition first (existence check + data for return)
  const selectResult = await transaction
    .request()
    .input(productDefIdParam, id)
    .query<DeletedProductDefinitionData>(`
      SELECT product_def_id, title
      FROM dbo.product_definitions
      WHERE product_def_id = @${productDefIdParam};
    `);

  if (selectResult.recordset.length === 0) {
    throw new Error(`Product Definition with ID ${id} not found.`);
  }
  const deletedProductDefData = selectResult.recordset[0];
  log.debug(`(delete) Found product definition to delete: "${deletedProductDefData.title}" (ID: ${id})`);

  let stats: Record<string, number> = {};

  // 2) Execute delete path
  if (cascade) {
    log.debug(`(delete) Executing CASCADE delete (manual) for ProductDefinition ID: ${id}`);

    // One batch, deterministic ordering, returns per-step row counts for logging.
    const cascadeDeleteQuery = `
      SET XACT_ABORT ON;
      SET NOCOUNT ON;

      -- Use a temp table (not a CTE) because we need the set across multiple DELETE statements.
      IF OBJECT_ID('tempdb..#OfferingsToDelete') IS NOT NULL DROP TABLE #OfferingsToDelete;
      CREATE TABLE #OfferingsToDelete (offering_id INT NOT NULL PRIMARY KEY);

      -- Lock the target offerings to prevent concurrent inserts until we finish deleting dependents.
      INSERT INTO #OfferingsToDelete (offering_id)
      SELECT o.offering_id
      FROM dbo.wholesaler_item_offerings AS o WITH (UPDLOCK, HOLDLOCK)
      WHERE o.product_def_id = @${productDefIdParam};

      DECLARE
        @deletedLinks       INT = 0,
        @deletedAttributes  INT = 0,
        @deletedOfferings   INT = 0,
        @deletedPdefs       INT = 0;

      -- 1) Delete indirect dependencies: links
      DELETE L
      FROM dbo.wholesaler_offering_links AS L
      JOIN #OfferingsToDelete AS O ON O.offering_id = L.offering_id;
      SET @deletedLinks = @@ROWCOUNT;

      -- 2) Delete indirect dependencies: attributes
      DELETE A
      FROM dbo.wholesaler_offering_attributes AS A
      JOIN #OfferingsToDelete AS O ON O.offering_id = A.offering_id;
      SET @deletedAttributes = @@ROWCOUNT;

      -- 3) Delete direct dependencies: offerings
      DELETE O
      FROM dbo.wholesaler_item_offerings AS O
      WHERE O.product_def_id = @${productDefIdParam};
      SET @deletedOfferings = @@ROWCOUNT;

      -- 4) Finally, delete the product definition
      DELETE P
      FROM dbo.product_definitions AS P
      WHERE P.product_def_id = @${productDefIdParam};
      SET @deletedPdefs = @@ROWCOUNT;

      -- Return deletion stats for logging
      SELECT
        @deletedLinks      AS deletedLinks,
        @deletedAttributes AS deletedAttributes,
        @deletedOfferings  AS deletedOfferings,
        @deletedPdefs      AS deletedProductDefinitions;
    `;

    const res = await transaction.request().input(productDefIdParam, id).query(cascadeDeleteQuery);

    if (res?.recordset?.[0]) {
      stats = res.recordset[0];
      // "total" = sum of children (not including the master row)
      stats.total =
        (stats.deletedLinks ?? 0) +
        (stats.deletedAttributes ?? 0) +
        (stats.deletedOfferings ?? 0);
    } else {
      stats = {
        total: 0,
        deletedLinks: 0,
        deletedAttributes: 0,
        deletedOfferings: 0,
        deletedProductDefinitions: 0,
      };
    }

    log.debug(
      `(delete) Cascade stats for ProductDefinition ${id}: ` +
        `links=${stats.deletedLinks}, attrs=${stats.deletedAttributes}, ` +
        `offerings=${stats.deletedOfferings}, pdefs=${stats.deletedProductDefinitions}`,
    );
  } else {
    log.debug(`(delete) Executing NON-CASCADE delete for ProductDefinition ID: ${id}`);
    try {
      const res = await transaction
        .request()
        .input(productDefIdParam, id)
        .query(`
          DELETE FROM dbo.product_definitions
          WHERE product_def_id = @${productDefIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected)
        ? res.rowsAffected.reduce((a, b) => a + b, 0)
        : (res.rowsAffected ?? 0);

      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
      // NOTE: Do NOT populate stats here; keep it empty to match the supplier example contract.
    } catch (err: any) {
      if (err && (err.number === 547 || err.code === "EREQUEST")) {
        throw new Error(
          `Cannot delete ProductDefinition ID ${id} without cascade: dependent rows exist (offerings, links, attributes).`,
        );
      }
      throw err;
    }
  }

  log.info(`(delete) Delete operation for ProductDefinition ID: ${id} completed successfully.`);

  // 3) Return the data of the now-deleted resource + stats
  return { deleted: deletedProductDefData, stats };
}

/**
 * Deletes a Supplier, with an option to cascade and delete all its dependencies.
 * This includes category assignments, offerings, and the offerings' own attributes and links.
 *
 * @param id The ID of the Supplier (Wholesaler) to delete.
 * @param cascade If true, performs a deep cascade delete of all dependent records.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted supplier.
 * @throws An error if the supplier with the given ID is not found.
 */
export async function deleteSupplier(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedSupplierData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteSupplier`);
  log.info(`(delete) Preparing to delete Supplier ID: ${id} with cascade=${cascade}`);

  const supplierIdParam = "supplierId";

  // 1) Read supplier first (existence check + data for return)
  const selectResult = await transaction.request().input(supplierIdParam, id).query<DeletedSupplierData>(`
      SELECT wholesaler_id, name
      FROM dbo.wholesalers
      WHERE wholesaler_id = @${supplierIdParam};
    `);

  if (selectResult.recordset.length === 0) {
    throw new Error(`Supplier with ID ${id} not found.`);
  }
  const deletedSupplierData = selectResult.recordset[0];
  log.debug(`(delete) Found supplier to delete: "${deletedSupplierData.name}" (ID: ${id})`);

  let stats: Record<string, number> = {};

  // 2) Execute the appropriate delete path
  if (cascade) {
    log.debug(`(delete) Executing CASCADE delete (manual) for Supplier ID: ${id}`);

    // One batch, deterministic ordering, returns per-step row counts for logging.
    const cascadeDeleteQuery = `
      SET XACT_ABORT ON;
      SET NOCOUNT ON;

      -- Use a temp table (not a CTE) because we need the set across multiple DELETE statements.
      IF OBJECT_ID('tempdb..#OfferingsToDelete') IS NOT NULL DROP TABLE #OfferingsToDelete;
      CREATE TABLE #OfferingsToDelete (offering_id INT NOT NULL PRIMARY KEY);

      -- Lock the target offerings to prevent concurrent inserts until we finish deleting dependents.
      INSERT INTO #OfferingsToDelete (offering_id)
      SELECT o.offering_id
      FROM dbo.wholesaler_item_offerings AS o WITH (UPDLOCK, HOLDLOCK)
      WHERE o.wholesaler_id = @${supplierIdParam};

      DECLARE
        @deletedLinks        INT = 0,
        @deletedAttributes   INT = 0,
        @deletedOfferings    INT = 0,
        @deletedWhCat        INT = 0,
        @deletedSupplier     INT = 0;

      -- 1) Delete indirect dependencies: links
      DELETE L
      FROM dbo.wholesaler_offering_links AS L
      JOIN #OfferingsToDelete AS O ON O.offering_id = L.offering_id;
      SET @deletedLinks = @@ROWCOUNT;

      -- 2) Delete indirect dependencies: attributes
      DELETE A
      FROM dbo.wholesaler_offering_attributes AS A
      JOIN #OfferingsToDelete AS O ON O.offering_id = A.offering_id;
      SET @deletedAttributes = @@ROWCOUNT;

      -- 3) Delete direct dependencies: offerings
      DELETE O
      FROM dbo.wholesaler_item_offerings AS O
      WHERE O.wholesaler_id = @${supplierIdParam};
      SET @deletedOfferings = @@ROWCOUNT;

      -- 4) Delete direct dependencies: wholesaler-category assignments
      DELETE C
      FROM dbo.wholesaler_categories AS C
      WHERE C.wholesaler_id = @${supplierIdParam};
      SET @deletedWhCat = @@ROWCOUNT;

      -- 5) Finally, delete the supplier
      DELETE W
      FROM dbo.wholesalers AS W
      WHERE W.wholesaler_id = @${supplierIdParam};
      SET @deletedSupplier = @@ROWCOUNT;

      -- Return deletion stats for logging
      SELECT
        @deletedLinks      AS deletedLinks,
        @deletedAttributes AS deletedAttributes,
        @deletedOfferings  AS deletedOfferings,
        @deletedWhCat      AS deletedWholesalerCategories,
        @deletedSupplier   AS deletedSuppliers;
    `;

    const res = await transaction.request().input(supplierIdParam, id).query(cascadeDeleteQuery);

    if (res?.recordset?.[0]) {
      stats = res.recordset[0];
      stats.total = stats.deletedLinks + stats.deletedAttributes + stats.deletedOfferings + stats.deletedWholesalerCategories;
    } else {
      stats = {
        total: 0,
        deletedLinks: 0,
        deletedAttributes: 0,
        deletedOfferings: 0,
        deletedWholesalerCategories: 0,
        deletedSuppliers: 0,
      };
    }

    log.debug(
      `(delete) Cascade stats for Supplier ${id}: ` +
        `links=${stats.deletedLinks}, attrs=${stats.deletedAttributes}, ` +
        `offerings=${stats.deletedOfferings}, whCat=${stats.deletedWholesalerCategories}, suppliers=${stats.deletedSuppliers}`,
    );
  } else {
    log.debug(`(delete) Executing NON-CASCADE delete for Supplier ID: ${id}`);
    try {
      const res = await transaction.request().input(supplierIdParam, id).query(`
          DELETE FROM dbo.wholesalers
          WHERE wholesaler_id = @${supplierIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    } catch (err: any) {
      // Helpful message when FK constraints block the delete
      if (err && (err.number === 547 || err.code === "EREQUEST")) {
        // 547 = FK violation in SQL Server; EREQUEST is the generic mssql error code
        throw new Error(
          `Cannot delete Supplier ID ${id} without cascade: dependent rows exist (offerings, links, attributes, or category assignments).`,
        );
      }
      throw err;
    }
  }

  log.info(`(delete) Delete operation for Supplier ID: ${id} completed successfully.`);

  // 3) Return the data of the now-deleted resource.
  return { deleted: deletedSupplierData, stats };
}

export async function deleteProductCategory(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedProductCategoryData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteProductCategory`);
  log.info(`(delete) Preparing to delete ProductCategory ID: ${id} with cascade=${cascade}`);

  const categoryIdParam = "categoryId";

  // 1) Read product category first (existence check + data for return)
  const selectResult = await transaction
    .request()
    .input(categoryIdParam, id)
    .query<DeletedProductCategoryData>(`
      SELECT category_id, name
      FROM dbo.product_categories
      WHERE category_id = @${categoryIdParam};
    `);

  if (selectResult.recordset.length === 0) {
    throw new Error(`Product Category with ID ${id} not found.`);
  }
  const deletedCategoryData = selectResult.recordset[0];
  log.debug(`(delete) Found product category to delete: "${deletedCategoryData.name}" (ID: ${id})`);

  let stats: Record<string, number> = {};

  // 2) Execute delete path
  if (cascade) {
    log.debug(`(delete) Executing CASCADE delete (manual) for ProductCategory ID: ${id}`);

    // One batch, deterministic ordering, returns per-step row counts for logging.
    const cascadeDeleteQuery = `
      SET XACT_ABORT ON;
      SET NOCOUNT ON;

      -- We need offerings for this category to remove indirect dependents (links, attributes).
      IF OBJECT_ID('tempdb..#OfferingsToDelete') IS NOT NULL DROP TABLE #OfferingsToDelete;
      CREATE TABLE #OfferingsToDelete (offering_id INT NOT NULL PRIMARY KEY);

      -- Stabilize the set while we delete dependents (protects from concurrent inserts)
      INSERT INTO #OfferingsToDelete (offering_id)
      SELECT o.offering_id
      FROM dbo.wholesaler_item_offerings AS o WITH (UPDLOCK, HOLDLOCK)
      WHERE o.category_id = @${categoryIdParam};

      DECLARE
        @deletedLinks                INT = 0,
        @deletedAttributes           INT = 0,
        @deletedOfferings            INT = 0,
        @deletedProductDefinitions   INT = 0,
        @deletedWholesalerCategories INT = 0,
        @deletedProductCategories    INT = 0;

      -- 1) Delete indirect dependencies: links for offerings in this category
      DELETE L
      FROM dbo.wholesaler_offering_links AS L
      JOIN #OfferingsToDelete AS O ON O.offering_id = L.offering_id;
      SET @deletedLinks = @@ROWCOUNT;

      -- 2) Delete indirect dependencies: attributes for offerings in this category
      DELETE A
      FROM dbo.wholesaler_offering_attributes AS A
      JOIN #OfferingsToDelete AS O ON O.offering_id = A.offering_id;
      SET @deletedAttributes = @@ROWCOUNT;

      -- 3) Delete direct dependencies: offerings in this category
      DELETE O
      FROM dbo.wholesaler_item_offerings AS O
      WHERE O.category_id = @${categoryIdParam};
      SET @deletedOfferings = @@ROWCOUNT;

      -- 4) Delete direct dependencies: product definitions in this category
      DELETE P
      FROM dbo.product_definitions AS P
      WHERE P.category_id = @${categoryIdParam};
      SET @deletedProductDefinitions = @@ROWCOUNT;

      -- 5) Delete direct dependencies: wholesaler-category assignments for this category
      DELETE C
      FROM dbo.wholesaler_categories AS C
      WHERE C.category_id = @${categoryIdParam};
      SET @deletedWholesalerCategories = @@ROWCOUNT;

      -- 6) Finally, delete the product category itself
      DELETE PC
      FROM dbo.product_categories AS PC
      WHERE PC.category_id = @${categoryIdParam};
      SET @deletedProductCategories = @@ROWCOUNT;

      -- Return deletion stats for logging
      SELECT
        @deletedLinks                AS deletedLinks,
        @deletedAttributes           AS deletedAttributes,
        @deletedOfferings            AS deletedOfferings,
        @deletedProductDefinitions   AS deletedProductDefinitions,
        @deletedWholesalerCategories AS deletedWholesalerCategories,
        @deletedProductCategories    AS deletedProductCategories;
    `;

    const res = await transaction.request().input(categoryIdParam, id).query(cascadeDeleteQuery);

    if (res?.recordset?.[0]) {
      stats = res.recordset[0];
      // "total" = sum of children (not including the master row)
      stats.total =
        (stats.deletedLinks ?? 0) +
        (stats.deletedAttributes ?? 0) +
        (stats.deletedOfferings ?? 0) +
        (stats.deletedProductDefinitions ?? 0) +
        (stats.deletedWholesalerCategories ?? 0);
    } else {
      stats = {
        total: 0,
        deletedLinks: 0,
        deletedAttributes: 0,
        deletedOfferings: 0,
        deletedProductDefinitions: 0,
        deletedWholesalerCategories: 0,
        deletedProductCategories: 0,
      };
    }

    log.debug(
      `(delete) Cascade stats for ProductCategory ${id}: ` +
        `links=${stats.deletedLinks}, attrs=${stats.deletedAttributes}, ` +
        `offerings=${stats.deletedOfferings}, pdefs=${stats.deletedProductDefinitions}, ` +
        `whCat=${stats.deletedWholesalerCategories}, categories=${stats.deletedProductCategories}`,
    );
  } else {
    log.debug(`(delete) Executing NON-CASCADE delete for ProductCategory ID: ${id}`);
    try {
      const res = await transaction
        .request()
        .input(categoryIdParam, id)
        .query(`
          DELETE FROM dbo.product_categories
          WHERE category_id = @${categoryIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected)
        ? res.rowsAffected.reduce((a, b) => a + b, 0)
        : (res.rowsAffected ?? 0);

      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    } catch (err: any) {
      // Likely FK violations (offerings, product definitions, or wholesaler-category rows)
      if (err && (err.number === 547 || err.code === "EREQUEST")) {
        throw new Error(
          `Cannot delete ProductCategory ID ${id} without cascade: dependent rows exist (offerings, product definitions, or wholesaler-category assignments).`,
        );
      }
      throw err;
    }
  }

  log.info(`(delete) Delete operation for ProductCategory ID: ${id} completed successfully.`);

  // 3) Return the data of the now-deleted resource + stats
  return { deleted: deletedCategoryData, stats };
}

