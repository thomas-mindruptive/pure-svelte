// in lib/dataModel/cascadingDeletes.ts (oder umbenannt in z.B. `lib/dataModel/productDefinition.ts`)

import { assertDefined } from "$lib/utils/assertions";
import { log } from "$lib/utils/logger";
import type { Transaction } from "mssql";
import type {
  DeletedAttributeData,
  DeletedCategoryData,
  DeletedOfferingData,
  DeletedProductDefinitonData,
  DeletedSupplierData,
  DeletedSupplierCategoryData,
} from "$lib/api/app/appSpecificTypes";

/**
 * The shapes of the data returned after a successful deletion.
 */

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
): Promise<{ deleted: DeletedProductDefinitonData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteProductDefinition`);
  log.info(`(delete) Preparing to delete ProductDefinition ID: ${id} with cascade=${cascade}`);

  const productDefIdParam = "productDefId";

  try {
    // 1) Read product definition first (existence check + data for return)
    const selectResult = await transaction.request().input(productDefIdParam, id).query<DeletedProductDefinitonData>(`
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
        stats.total = (stats.deletedLinks ?? 0) + (stats.deletedAttributes ?? 0) + (stats.deletedOfferings ?? 0);
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
      const res = await transaction.request().input(productDefIdParam, id).query(`
          DELETE FROM dbo.product_definitions
          WHERE product_def_id = @${productDefIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
      // NOTE: Do NOT populate stats here; keep it empty to match the supplier example contract.
    }

    log.info(`(delete) Delete operation for ProductDefinition ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedProductDefData, stats };
  } catch (err: any) {
    // Self-contained error logging for both CASCADE and NON-CASCADE paths
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of ProductDefinition ${id}`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting ProductDefinition ${id}`, { error: err, cascade });
    }
    throw err; // Re-throw for parent to handle
  }
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

  try {
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
          @deletedOrderItems   INT = 0,
          @deletedOrders       INT = 0,
          @deletedLinks        INT = 0,
          @deletedAttributes   INT = 0,
          @deletedOfferings    INT = 0,
          @deletedWhCat        INT = 0,
          @deletedSupplier     INT = 0;

        -- 1) Delete order_items (indirect via offerings) - must come first as leaf nodes
        DELETE OI
        FROM dbo.order_items AS OI
        JOIN #OfferingsToDelete AS O ON O.offering_id = OI.offering_id;
        SET @deletedOrderItems = @@ROWCOUNT;

        -- 2) Delete orders (direct FK to wholesaler)
        DELETE ORD
        FROM dbo.orders AS ORD
        WHERE ORD.wholesaler_id = @${supplierIdParam};
        SET @deletedOrders = @@ROWCOUNT;

        -- 3) Delete offering links
        DELETE L
        FROM dbo.wholesaler_offering_links AS L
        JOIN #OfferingsToDelete AS O ON O.offering_id = L.offering_id;
        SET @deletedLinks = @@ROWCOUNT;

        -- 4) Delete offering attributes
        DELETE A
        FROM dbo.wholesaler_offering_attributes AS A
        JOIN #OfferingsToDelete AS O ON O.offering_id = A.offering_id;
        SET @deletedAttributes = @@ROWCOUNT;

        -- 5) Delete offerings
        DELETE O
        FROM dbo.wholesaler_item_offerings AS O
        WHERE O.wholesaler_id = @${supplierIdParam};
        SET @deletedOfferings = @@ROWCOUNT;

        -- 6) Delete wholesaler-category assignments
        DELETE C
        FROM dbo.wholesaler_categories AS C
        WHERE C.wholesaler_id = @${supplierIdParam};
        SET @deletedWhCat = @@ROWCOUNT;

        -- 7) Finally, delete the supplier
        DELETE W
        FROM dbo.wholesalers AS W
        WHERE W.wholesaler_id = @${supplierIdParam};
        SET @deletedSupplier = @@ROWCOUNT;

        -- Return deletion stats for logging
        SELECT
          @deletedOrderItems AS deletedOrderItems,
          @deletedOrders     AS deletedOrders,
          @deletedLinks      AS deletedLinks,
          @deletedAttributes AS deletedAttributes,
          @deletedOfferings  AS deletedOfferings,
          @deletedWhCat      AS deletedWholesalerCategories,
          @deletedSupplier   AS deletedSuppliers;
      `;

      const res = await transaction.request().input(supplierIdParam, id).query(cascadeDeleteQuery);

      if (res?.recordset?.[0]) {
        stats = res.recordset[0];
        stats.total = stats.deletedOrderItems + stats.deletedOrders + stats.deletedLinks + stats.deletedAttributes + stats.deletedOfferings + stats.deletedWholesalerCategories;
      } else {
        stats = {
          total: 0,
          deletedOrderItems: 0,
          deletedOrders: 0,
          deletedLinks: 0,
          deletedAttributes: 0,
          deletedOfferings: 0,
          deletedWholesalerCategories: 0,
          deletedSuppliers: 0,
        };
      }

      log.debug(
        `(delete) Cascade stats for Supplier ${id}: ` +
          `orderItems=${stats.deletedOrderItems}, orders=${stats.deletedOrders}, ` +
          `links=${stats.deletedLinks}, attrs=${stats.deletedAttributes}, ` +
          `offerings=${stats.deletedOfferings}, whCat=${stats.deletedWholesalerCategories}, suppliers=${stats.deletedSuppliers}`,
      );
    } else {
      log.debug(`(delete) Executing NON-CASCADE delete for Supplier ID: ${id}`);
      const res = await transaction.request().input(supplierIdParam, id).query(`
          DELETE FROM dbo.wholesalers
          WHERE wholesaler_id = @${supplierIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    }

    log.info(`(delete) Delete operation for Supplier ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource.
    return { deleted: deletedSupplierData, stats };
  } catch (err: any) {
    // Self-contained error logging for both CASCADE and NON-CASCADE paths
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of Supplier ${id}`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting Supplier ${id}`, { error: err, cascade });
    }
    throw err; // Re-throw for parent to handle
  }
}

export async function deleteProductCategory(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedCategoryData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteProductCategory`);
  log.info(`(delete) Preparing to delete ProductCategory ID: ${id} with cascade=${cascade}`);

  const categoryIdParam = "categoryId";

  try {
    // 1) Read product category first (existence check + data for return)
    const selectResult = await transaction.request().input(categoryIdParam, id).query<DeletedCategoryData>(`
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
      const res = await transaction.request().input(categoryIdParam, id).query(`
          DELETE FROM dbo.product_categories
          WHERE category_id = @${categoryIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    }

    log.info(`(delete) Delete operation for ProductCategory ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedCategoryData, stats };
  } catch (err: any) {
    // Self-contained error logging for both CASCADE and NON-CASCADE paths
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of ProductCategory ${id}`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting ProductCategory ${id}`, { error: err, cascade });
    }
    throw err; // Re-throw for parent to handle
  }
}

/**
 * Deletes a WholesalerItemOffering, with an option to cascade and delete all its dependencies.
 * This includes offering links and attributes.
 *
 * @param id The ID of the WholesalerItemOffering to delete.
 * @param cascade If true, performs a cascade delete of all dependent links and attributes.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted offering.
 * @throws An error if the offering with the given ID is not found.
 */
export async function deleteOffering(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedOfferingData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteOffering`);
  log.info(`(delete) Preparing to delete Offering ID: ${id} with cascade=${cascade}`);

  const offeringIdParam = "offeringId";

  try {
    // 1) Read offering first (existence check + data for return)
    const selectResult = await transaction.request().input(offeringIdParam, id).query<DeletedOfferingData>(`
        SELECT offering_id
        FROM dbo.wholesaler_item_offerings
        WHERE offering_id = @${offeringIdParam};
      `);

    if (selectResult.recordset.length === 0) {
      throw new Error(`Offering with ID ${id} not found.`);
    }
    const deletedOfferingData = selectResult.recordset[0];
    log.debug(`(delete) Found offering to delete (ID: ${id})`);

    let stats: Record<string, number> = {};

    // 2) Execute delete path
    if (cascade) {
      log.debug(`(delete) Executing CASCADE delete for Offering ID: ${id}`);

      const cascadeDeleteQuery = `
        SET XACT_ABORT ON;
        SET NOCOUNT ON;

        DECLARE
          @deletedOrderItems  INT = 0,
          @deletedLinks       INT = 0,
          @deletedAttributes  INT = 0,
          @deletedOfferings   INT = 0;

        -- 1) Delete order_items (HARD dependency - historical transaction data, must come first as leaf nodes)
        DELETE FROM dbo.order_items
        WHERE offering_id = @${offeringIdParam};
        SET @deletedOrderItems = @@ROWCOUNT;

        -- 2) Delete dependencies: links
        DELETE FROM dbo.wholesaler_offering_links
        WHERE offering_id = @${offeringIdParam};
        SET @deletedLinks = @@ROWCOUNT;

        -- 3) Delete dependencies: attributes
        DELETE FROM dbo.wholesaler_offering_attributes
        WHERE offering_id = @${offeringIdParam};
        SET @deletedAttributes = @@ROWCOUNT;

        -- 4) Finally, delete the offering itself
        DELETE FROM dbo.wholesaler_item_offerings
        WHERE offering_id = @${offeringIdParam};
        SET @deletedOfferings = @@ROWCOUNT;

        -- Return deletion stats
        SELECT
          @deletedOrderItems AS deletedOrderItems,
          @deletedLinks      AS deletedLinks,
          @deletedAttributes AS deletedAttributes,
          @deletedOfferings  AS deletedOfferings;
      `;

      const res = await transaction.request().input(offeringIdParam, id).query(cascadeDeleteQuery);

      if (res?.recordset?.[0]) {
        stats = res.recordset[0];
        stats.total = (stats.deletedOrderItems ?? 0) + (stats.deletedLinks ?? 0) + (stats.deletedAttributes ?? 0);
      } else {
        stats = { total: 0, deletedOrderItems: 0, deletedLinks: 0, deletedAttributes: 0, deletedOfferings: 0 };
      }

      log.debug(
        `(delete) Cascade stats for Offering ${id}: ` +
          `orderItems=${stats.deletedOrderItems}, links=${stats.deletedLinks}, attrs=${stats.deletedAttributes}, offerings=${stats.deletedOfferings}`,
      );
    } else {
      log.debug(`(delete) Executing NON-CASCADE delete for Offering ID: ${id}`);
      const res = await transaction.request().input(offeringIdParam, id).query(`
          DELETE FROM dbo.wholesaler_item_offerings
          WHERE offering_id = @${offeringIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    }

    log.info(`(delete) Delete operation for Offering ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedOfferingData, stats };
  } catch (err: any) {
    // Self-contained error logging for both CASCADE and NON-CASCADE paths
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of Offering ${id}`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting Offering ${id}`, { error: err, cascade });
    }
    throw err; // Re-throw for parent to handle
  }
}

/**
 * Deletes an Attribute, with an option to cascade and delete all its assignments.
 *
 * @param id The ID of the Attribute to delete.
 * @param cascade If true, performs a cascade delete of all dependent offering assignments.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted attribute.
 * @throws An error if the attribute with the given ID is not found.
 */
export async function deleteAttribute(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedAttributeData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteAttribute`);
  log.info(`(delete) Preparing to delete Attribute ID: ${id} with cascade=${cascade}`);

  const attributeIdParam = "attributeId";

  try {
    // 1) Read attribute first (existence check + data for return)
    const selectResult = await transaction.request().input(attributeIdParam, id).query<DeletedAttributeData>(`
        SELECT attribute_id, name
        FROM dbo.attributes
        WHERE attribute_id = @${attributeIdParam};
      `);

    if (selectResult.recordset.length === 0) {
      throw new Error(`Attribute with ID ${id} not found.`);
    }
    const deletedAttributeData = selectResult.recordset[0];
    log.debug(`(delete) Found attribute to delete: "${deletedAttributeData.name}" (ID: ${id})`);

    let stats: Record<string, number> = {};

    // 2) Execute delete path
    if (cascade) {
      log.debug(`(delete) Executing CASCADE delete for Attribute ID: ${id}`);

      const cascadeDeleteQuery = `
        SET XACT_ABORT ON;
        SET NOCOUNT ON;

        DECLARE
          @deletedAssignments INT = 0,
          @deletedAttributes  INT = 0;

        -- 1) Delete dependencies: offering assignments
        DELETE FROM dbo.wholesaler_offering_attributes
        WHERE attribute_id = @${attributeIdParam};
        SET @deletedAssignments = @@ROWCOUNT;

        -- 2) Finally, delete the attribute itself
        DELETE FROM dbo.attributes
        WHERE attribute_id = @${attributeIdParam};
        SET @deletedAttributes = @@ROWCOUNT;

        -- Return deletion stats
        SELECT
          @deletedAssignments AS deletedAssignments,
          @deletedAttributes  AS deletedAttributes;
      `;

      const res = await transaction.request().input(attributeIdParam, id).query(cascadeDeleteQuery);

      if (res?.recordset?.[0]) {
        stats = res.recordset[0];
        stats.total = stats.deletedAssignments ?? 0;
      } else {
        stats = { total: 0, deletedAssignments: 0, deletedAttributes: 0 };
      }

      log.debug(
        `(delete) Cascade stats for Attribute ${id}: ` + `assignments=${stats.deletedAssignments}, attributes=${stats.deletedAttributes}`,
      );
    } else {
      log.debug(`(delete) Executing NON-CASCADE delete for Attribute ID: ${id}`);
      await transaction.request().input(attributeIdParam, id).query(`
          DELETE FROM dbo.attributes
          WHERE attribute_id = @${attributeIdParam};
        `);
    }

    log.info(`(delete) Delete operation for Attribute ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedAttributeData, stats };
  } catch (err: any) {
    // Error 547 is BOTH CHECK constraint AND FK constraint - analyze message to distinguish
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of Attribute ${id}`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting Attribute ${id}`, { error: err, cascade });
    }
    throw err;
  }
}

/**
 * Deletes an Order, with an option to cascade and delete all its order items.
 * @param id The ID of the Order to delete.
 * @param cascade If true, performs a cascade delete of all dependent order items.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted order and deletion stats.
 * @throws An error if the order with the given ID is not found.
 */
export async function deleteOrder(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: { order_id: number; order_number: string | null }; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteOrder`);
  log.info(`(delete) Preparing to delete Order ID: ${id} with cascade=${cascade}`);

  const orderIdParam = "orderId";

  try {
    // 1) Read order first (existence check + data for return)
    const selectResult = await transaction.request().input(orderIdParam, id).query<{ order_id: number; order_number: string | null }>(`
        SELECT order_id, order_number
        FROM dbo.orders
        WHERE order_id = @${orderIdParam};
      `);

    if (selectResult.recordset.length === 0) {
      throw new Error(`Order with ID ${id} not found.`);
    }
    const deletedOrderData = selectResult.recordset[0];
    log.debug(`(delete) Found order to delete: Order #${deletedOrderData.order_number} (ID: ${id})`);

    let stats: Record<string, number> = {};

    // 2) Execute delete path
    if (cascade) {
      log.debug(`(delete) Executing CASCADE delete for Order ID: ${id}`);

      const cascadeDeleteQuery = `
        SET XACT_ABORT ON;
        SET NOCOUNT ON;

        DECLARE
          @deletedOrderItems INT = 0,
          @deletedOrders INT = 0;

        -- 1) Delete order items
        DELETE FROM dbo.order_items
        WHERE order_id = @${orderIdParam};
        SET @deletedOrderItems = @@ROWCOUNT;

        -- 2) Delete the order
        DELETE FROM dbo.orders
        WHERE order_id = @${orderIdParam};
        SET @deletedOrders = @@ROWCOUNT;

        -- Return deletion stats
        SELECT
          @deletedOrderItems AS deletedOrderItems,
          @deletedOrders AS deletedOrders;
      `;

      const res = await transaction.request().input(orderIdParam, id).query(cascadeDeleteQuery);

      if (res?.recordset?.[0]) {
        stats = res.recordset[0];
        stats.total = stats.deletedOrderItems;
      } else {
        stats = {
          total: 0,
          deletedOrderItems: 0,
          deletedOrders: 0,
        };
      }

      log.debug(`(delete) Cascade stats for Order ${id}: ` + `orderItems=${stats.deletedOrderItems}, orders=${stats.deletedOrders}`);
    } else {
      log.debug(`(delete) Executing NON-CASCADE delete for Order ID: ${id}`);
      const res = await transaction.request().input(orderIdParam, id).query(`
          DELETE FROM dbo.orders
          WHERE order_id = @${orderIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    }

    log.info(`(delete) Delete operation for Order ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedOrderData, stats };
  } catch (err: any) {
    // Error 547 is BOTH CHECK constraint AND FK constraint - analyze message to distinguish
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of Order ${id}`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting Order ${id}`, { error: err, cascade });
    }
    throw err;
  }
}

/**
 * Deletes an OrderItem.
 * OrderItems are leaf nodes and have no dependencies, so cascade is not needed.
 * @param id The ID of the OrderItem to delete.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted order item.
 * @throws An error if the order item with the given ID is not found.
 */
export async function deleteOrderItem(
  id: number,
  transaction: Transaction,
): Promise<{ deleted: { order_item_id: number }; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteOrderItem`);
  log.info(`(delete) Preparing to delete OrderItem ID: ${id}`);

  const orderItemIdParam = "orderItemId";

  try {
    // 1) Read order item first (existence check + data for return)
    const selectResult = await transaction.request().input(orderItemIdParam, id).query<{ order_item_id: number }>(`
        SELECT order_item_id
        FROM dbo.order_items
        WHERE order_item_id = @${orderItemIdParam};
      `);

    if (selectResult.recordset.length === 0) {
      throw new Error(`OrderItem with ID ${id} not found.`);
    }
    const deletedOrderItemData = selectResult.recordset[0];
    log.debug(`(delete) Found order item to delete (ID: ${id})`);

    // 2) Delete the order item (no cascade needed - leaf node)
    log.debug(`(delete) Executing delete for OrderItem ID: ${id}`);
    const res = await transaction.request().input(orderItemIdParam, id).query(`
      DELETE FROM dbo.order_items
      WHERE order_item_id = @${orderItemIdParam};
    `);

    const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
    log.debug(`(delete) Delete affected rows: ${affected}`);

    const stats: Record<string, number> = {
      total: 0,
      deletedOrderItems: affected,
    };

    log.info(`(delete) Delete operation for OrderItem ID: ${id} completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedOrderItemData, stats };
  } catch (err: any) {
    // Error 547 is BOTH CHECK constraint AND FK constraint - analyze message to distinguish
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of OrderItem ${id}`, {
        message: err.message,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting OrderItem ${id}`, { error: err });
    }
    throw err;
  }
}

/**
 * Deletes a Supplier-Category Assignment, with an option to cascade and delete all dependent offerings.
 * @param wholesalerId The ID of the supplier.
 * @param categoryId The ID of the category.
 * @param cascade If true, performs a cascade delete of all dependent offerings and their children.
 * @param transaction The active MSSQL transaction object.
 * @returns A promise that resolves with the data of the deleted assignment and deletion stats.
 * @throws An error if the assignment with the given IDs is not found.
 */
export async function deleteSupplierCategoryAssignment(
  wholesalerId: number,
  categoryId: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{
  deleted: DeletedSupplierCategoryData;
  stats: Record<string, number>;
}> {
  assertDefined(wholesalerId, `wholesalerId must be defined for deleteSupplierCategoryAssignment`);
  assertDefined(categoryId, `categoryId must be defined for deleteSupplierCategoryAssignment`);
  log.info(`(delete) Preparing to delete Supplier-Category Assignment: Supplier ${wholesalerId}, Category ${categoryId} with cascade=${cascade}`);

  const wholesalerIdParam = "wholesalerId";
  const categoryIdParam = "categoryId";

  try {
    // 1) Read assignment first (existence check + data for return)
    const selectResult = await transaction
      .request()
      .input(wholesalerIdParam, wholesalerId)
      .input(categoryIdParam, categoryId).query<DeletedSupplierCategoryData>(`
        SELECT
          wc.wholesaler_id,
          wc.category_id,
          pc.name AS category_name
        FROM dbo.wholesaler_categories wc
        INNER JOIN dbo.product_categories pc ON wc.category_id = pc.category_id
        WHERE wc.wholesaler_id = @${wholesalerIdParam} AND wc.category_id = @${categoryIdParam};
      `);

    if (selectResult.recordset.length === 0) {
      throw new Error(`Supplier-Category Assignment (Supplier ${wholesalerId}, Category ${categoryId}) not found.`);
    }
    const deletedAssignmentData = selectResult.recordset[0];
    log.debug(
      `(delete) Found assignment to delete: Category "${deletedAssignmentData.category_name}" (wholesaler_id: ${deletedAssignmentData.wholesaler_id}, category_id: ${deletedAssignmentData.category_id})`,
    );

    let stats: Record<string, number> = {};

    // 2) Execute delete path
    if (cascade) {
      log.debug(`(delete) Executing CASCADE delete for Supplier-Category Assignment`);

      const cascadeDeleteQuery = `
        SET XACT_ABORT ON;
        SET NOCOUNT ON;

        DECLARE
          @deletedOrderItems   INT = 0,
          @deletedAttributes   INT = 0,
          @deletedLinks        INT = 0,
          @deletedOfferings    INT = 0,
          @deletedAssignments  INT = 0;

        -- 1) Delete order_items (indirect via offerings - must come first as leaf nodes)
        DELETE oi
        FROM dbo.order_items oi
        INNER JOIN dbo.wholesaler_item_offerings wio ON oi.offering_id = wio.offering_id
        WHERE wio.wholesaler_id = @${wholesalerIdParam} AND wio.category_id = @${categoryIdParam};
        SET @deletedOrderItems = @@ROWCOUNT;

        -- 2) Delete offering_attributes
        DELETE woa
        FROM dbo.wholesaler_offering_attributes woa
        INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
        WHERE wio.wholesaler_id = @${wholesalerIdParam} AND wio.category_id = @${categoryIdParam};
        SET @deletedAttributes = @@ROWCOUNT;

        -- 3) Delete offering_links
        DELETE wol
        FROM dbo.wholesaler_offering_links wol
        INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
        WHERE wio.wholesaler_id = @${wholesalerIdParam} AND wio.category_id = @${categoryIdParam};
        SET @deletedLinks = @@ROWCOUNT;

        -- 4) Delete offerings
        DELETE FROM dbo.wholesaler_item_offerings
        WHERE wholesaler_id = @${wholesalerIdParam} AND category_id = @${categoryIdParam};
        SET @deletedOfferings = @@ROWCOUNT;

        -- 5) Finally, delete the assignment
        DELETE FROM dbo.wholesaler_categories
        WHERE wholesaler_id = @${wholesalerIdParam} AND category_id = @${categoryIdParam};
        SET @deletedAssignments = @@ROWCOUNT;

        -- Return deletion stats
        SELECT
          @deletedOrderItems  AS deletedOrderItems,
          @deletedAttributes  AS deletedAttributes,
          @deletedLinks       AS deletedLinks,
          @deletedOfferings   AS deletedOfferings,
          @deletedAssignments AS deletedAssignments;
      `;

      const res = await transaction
        .request()
        .input(wholesalerIdParam, wholesalerId)
        .input(categoryIdParam, categoryId)
        .query(cascadeDeleteQuery);

      if (res?.recordset?.[0]) {
        stats = res.recordset[0];
        stats.total = stats.deletedOrderItems + stats.deletedAttributes + stats.deletedLinks + stats.deletedOfferings;
      } else {
        stats = {
          total: 0,
          deletedOrderItems: 0,
          deletedAttributes: 0,
          deletedLinks: 0,
          deletedOfferings: 0,
          deletedAssignments: 0,
        };
      }

      log.debug(
        `(delete) Cascade stats for Supplier-Category Assignment: ` +
          `orderItems=${stats.deletedOrderItems}, attrs=${stats.deletedAttributes}, ` +
          `links=${stats.deletedLinks}, offerings=${stats.deletedOfferings}, assignments=${stats.deletedAssignments}`,
      );
    } else {
      log.debug(`(delete) Executing NON-CASCADE delete for Supplier-Category Assignment`);
      const res = await transaction
        .request()
        .input(wholesalerIdParam, wholesalerId)
        .input(categoryIdParam, categoryId)
        .query(`
          DELETE FROM dbo.wholesaler_categories
          WHERE wholesaler_id = @${wholesalerIdParam} AND category_id = @${categoryIdParam};
        `);

      const affected = Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : (res.rowsAffected ?? 0);
      log.debug(`(delete) Non-cascade delete affected rows: ${affected}`);
    }

    log.info(`(delete) Delete operation for Supplier-Category Assignment completed successfully.`);

    // 3) Return the data of the now-deleted resource + stats
    return { deleted: deletedAssignmentData, stats };
  } catch (err: any) {
    // Error 547 is BOTH CHECK constraint AND FK constraint - analyze message to distinguish
    if (err.number === 547) {
      log.error(`(delete) FK constraint prevented delete of Supplier-Category Assignment (Supplier ${wholesalerId}, Category ${categoryId})`, {
        message: err.message,
        cascade,
        constraint: err.message?.match(/FK_[\w]+/)?.[0],
      });
    } else {
      log.error(`(delete) Unexpected error deleting Supplier-Category Assignment (Supplier ${wholesalerId}, Category ${categoryId})`, {
        error: err,
        cascade,
      });
    }
    throw err;
  }
}
