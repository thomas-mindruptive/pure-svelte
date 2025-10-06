// File: src/lib/dataModel/dependencyChecks.ts

import { db } from "$lib/backendQueries/db";
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";
import { log } from "$lib/utils/logger";
import type { Transaction } from "mssql";

/**
 * Checks for offering dependencies within a specific supplier-category ASSIGNMENT.
 * This is used before deleting a wholesaler_categories record to see if it would orphan any offerings.
 * @param wholesalerId The ID of the supplier.
 * @param categoryId The ID of the category.
 * @param transaction The active database transaction object.
 * @returns Object with hard dependencies (order items) and soft dependencies (offerings, links, attributes).
 */
export async function checkSupplierCategoryDependencies(
  wholesalerId: number,
  categoryId: number,
  transaction: Transaction,
): Promise<{ hard: string[]; soft: string[] }> {
  const hardDependencies: string[] = [];
  const softDependencies: string[] = [];
  log.info("(dependencyChecks) Checking assignment dependencies for", { wholesalerId, categoryId });

  const transWrapper = new TransWrapper(transaction, null);
  await transWrapper.begin();

  try {
    // HARD Dependency: order_items (indirect via offerings - historical transaction data)
    const orderItemsCheck = await transWrapper.request().input("wholesalerId", wholesalerId).input("categoryId", categoryId).query`
      SELECT COUNT(*) as count
      FROM dbo.order_items oi
      INNER JOIN dbo.wholesaler_item_offerings wio ON oi.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId AND wio.category_id = @categoryId
    `;
    if (orderItemsCheck.recordset[0].count > 0) {
      hardDependencies.push(`${orderItemsCheck.recordset[0].count} order items`);
    }

    // SOFT Dependencies: offerings and their children
    const offeringsCheck = await transWrapper.request().input("wholesalerId", wholesalerId).input("categoryId", categoryId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_item_offerings
      WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId
    `;
    if (offeringsCheck.recordset[0].count > 0) {
      softDependencies.push(`${offeringsCheck.recordset[0].count} offerings`);
    }

    const linksCheck = await transWrapper.request().input("wholesalerId", wholesalerId).input("categoryId", categoryId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_offering_links wol
      INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId AND wio.category_id = @categoryId
    `;
    if (linksCheck.recordset[0].count > 0) {
      softDependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    const attributesCheck = await transWrapper.request().input("wholesalerId", wholesalerId).input("categoryId", categoryId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId AND wio.category_id = @categoryId
    `;
    if (attributesCheck.recordset[0].count > 0) {
      softDependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    await transWrapper.commit();
  } catch {
    await transWrapper.rollback();
  }

  log.info("(dependencyChecks) Found assignment dependencies", { hard: hardDependencies, soft: softDependencies });
  return { hard: hardDependencies, soft: softDependencies };
}

/**
 * Checks all master data dependencies for a Wholesaler.
 * This function is called before deleting a wholesaler to ensure data integrity.
 * @param wholesalerId The ID of the wholesaler to check.
 * @returns An array of strings describing the found dependencies.
 */
export async function checkWholesalerDependencies(
  wholesalerId: number,
  transaction: Transaction,
): Promise<{ hard: string[]; soft: string[] }> {
  const hardDependencies: string[] = [];
  const softDependencies: string[] = [];
  log.info(`(dependencyChecks) Checking master dependencies for wholesalerId: ${wholesalerId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // HARD Dependencies - these prevent cascade delete (must use forceCascade)

    // Check for orders (direct FK to wholesaler)
    const ordersCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count
      FROM dbo.orders
      WHERE wholesaler_id = @wholesalerId
    `;
    if (ordersCheck.recordset[0].count > 0) {
      hardDependencies.push(`${ordersCheck.recordset[0].count} orders`);
    }

    // Check for order_items (indirect via offerings)
    const orderItemsCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count
      FROM dbo.order_items oi
      INNER JOIN dbo.wholesaler_item_offerings wio ON oi.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;
    if (orderItemsCheck.recordset[0].count > 0) {
      hardDependencies.push(`${orderItemsCheck.recordset[0].count} order items`);
    }

    // SOFT Dependencies - these can be cascade deleted with cascade=true

    const categoriesCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_categories
      WHERE wholesaler_id = @wholesalerId
    `;
    if (categoriesCheck.recordset[0].count > 0) {
      softDependencies.push(`${categoriesCheck.recordset[0].count} assigned categories`);
    }

    const offeringsCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_item_offerings
      WHERE wholesaler_id = @wholesalerId
    `;
    if (offeringsCheck.recordset[0].count > 0) {
      softDependencies.push(`${offeringsCheck.recordset[0].count} product offerings`);
    }

    // Note: The following checks could be considered redundant if offerings are a hard dependency,
    // but are included for completeness as per the original file.
    const linksCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_offering_links wol
      INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;
    if (linksCheck.recordset[0].count > 0) {
      softDependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    const attributesCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;
    if (attributesCheck.recordset[0].count > 0) {
      softDependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for wholesalerId: ${wholesalerId}`, { hard: hardDependencies, soft: softDependencies });
  return { hard: hardDependencies, soft: softDependencies };
}

/**
 * Checks master data dependencies for a Product Category.
 * Distinguishes between "hard" dependencies (Offerings, Product Definitions) that
 * block deletion, and "soft" dependencies (Assignments) that can be cascaded.
 * @param categoryId The ID of the category to check.
 * @returns An object containing lists of hard and soft dependencies.
 */
export async function checkProductCategoryMasterDependencies(
  categoryId: number,
  transaction: Transaction | null,
): Promise<{ hard: string[]; soft: string[] }> {
  const hardDependencies: string[] = [];
  const softDependencies: string[] = [];

  log.info(`(dependencyChecks) Checking master dependencies for categoryId: ${categoryId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // 1. Hard Dependency: Product Offerings (dbo.wholesaler_item_offerings)
    const offeringsCheck = await transWrapper.request().input("categoryId", categoryId).query`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_item_offerings 
            WHERE category_id = @categoryId
        `;
    if (offeringsCheck.recordset[0].count > 0) {
      hardDependencies.push(`${offeringsCheck.recordset[0].count} product offerings`);
    }

    // 2. Hard Dependency: Product Definitions (dbo.product_definitions)
    const definitionsCheck = await transWrapper.request().input("categoryId", categoryId).query`
            SELECT COUNT(*) as count 
            FROM dbo.product_definitions 
            WHERE category_id = @categoryId
        `;
    if (definitionsCheck.recordset[0].count > 0) {
      hardDependencies.push(`${definitionsCheck.recordset[0].count} product definitions`);
    }

    // 3. Soft Dependency: Supplier Assignments (dbo.wholesaler_categories)
    const assignmentsCheck = await transWrapper.request().input("categoryId", categoryId).query`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_categories 
            WHERE category_id = @categoryId
        `;
    if (assignmentsCheck.recordset[0].count > 0) {
      softDependencies.push(`${assignmentsCheck.recordset[0].count} supplier assignments`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for categoryId: ${categoryId}`, { hard: hardDependencies, soft: softDependencies });

  return { hard: hardDependencies, soft: softDependencies };
}

/**
 * Checks for hard dependencies on a Product Definition.
 * This is used before deleting a product_definitions record to see if it would
 * orphan any offerings, which is not allowed.
 * @param productDefId The ID of the product definition to check.
 * @returns An array of strings describing the found dependencies.
 */
export async function checkProductDefinitionDependencies(
  productDefId: number,
  transaction: Transaction | null,
): Promise<{ hard: string[]; soft: string[] }> {
  const dependencies: string[] = [];
  log.info(`(dependencyChecks) Checking master dependencies for productDefId: ${productDefId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // Hard Dependency: Offerings (dbo.wholesaler_item_offerings)
    const offeringsCheck = await db.request().input("productDefId", productDefId).query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_item_offerings
      WHERE product_def_id = @productDefId
    `;

    if (offeringsCheck.recordset[0].count > 0) {
      dependencies.push(`${offeringsCheck.recordset[0].count} product offerings`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for productDefId: ${productDefId}`, {
    dependencies,
  });
  return { hard: dependencies, soft: [] };
}

/**
 * Checks for offering dependencies.
 * Distinguishes between "hard" dependencies (order_items - historical transaction data) and
 * "soft" dependencies (offering attributes and links) that can be cascaded.
 * @param offeringId The ID of the offering to check.
 * @param transaction The active database transaction object.
 * @returns An object containing lists of hard and soft dependencies.
 */
export async function checkOfferingDependencies(
  offeringId: number,
  transaction: Transaction | null,
): Promise<{ hard: string[]; soft: string[] }> {
  const hardDependencies: string[] = [];
  const softDependencies: string[] = [];
  log.info("(dependencyChecks) Checking offering dependencies for", { offeringId });

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // HARD Dependency: order_items (historical transaction data)
    const orderItemsCheck = await transWrapper.request().input("offeringId", offeringId).query`
      SELECT COUNT(*) as count
      FROM dbo.order_items
      WHERE offering_id = @offeringId
    `;
    if (orderItemsCheck.recordset[0].count > 0) {
      hardDependencies.push(`${orderItemsCheck.recordset[0].count} order items`);
    }

    // SOFT Dependencies: offering metadata

    // Check offering attributes
    const attributesCheck = await transWrapper.request().input("offeringId", offeringId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_offering_attributes
      WHERE offering_id = @offeringId
    `;
    if (attributesCheck.recordset[0].count > 0) {
      softDependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    // Check offering links
    const linksCheck = await transWrapper.request().input("offeringId", offeringId).query`
      SELECT COUNT(*) as count
      FROM dbo.wholesaler_offering_links
      WHERE offering_id = @offeringId
    `;
    if (linksCheck.recordset[0].count > 0) {
      softDependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info("(dependencyChecks) Found offering dependencies", { hard: hardDependencies, soft: softDependencies });
  return { hard: hardDependencies, soft: softDependencies };
}

/**
 * Checks for dependencies on an Attribute.
 * This is used before deleting an attributes record.
 * @param attributeId The ID of the attribute to check.
 * @returns An object containing lists of hard and soft dependencies.
 */
export async function checkAttributeDependencies(
  attributeId: number,
  transaction: Transaction | null,
): Promise<{ hard: string[]; soft: string[] }> {
  const softDependencies: string[] = [];
  log.info(`(dependencyChecks) Checking dependencies for attributeId: ${attributeId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // Soft Dependency: Assignments to offerings (dbo.wholesaler_offering_attributes)
    const assignmentsCheck = await db.request().input("attributeId", attributeId).query`
            SELECT COUNT(*) as count
            FROM dbo.wholesaler_offering_attributes
            WHERE attribute_id = @attributeId
        `;
    if (assignmentsCheck.recordset[0].count > 0) {
      softDependencies.push(`${assignmentsCheck.recordset[0].count} offering assignments`);
    }
    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  // Attributes, as master data, do not have hard dependencies that would prevent a cascade.
  return { hard: [], soft: softDependencies };
}

/**
 * Checks for dependencies on an Order.
 * This is used before deleting an orders record.
 * @param orderId The ID of the order to check.
 * @param transaction The active database transaction object.
 * @returns An object containing lists of hard and soft dependencies.
 */
export async function checkOrderDependencies(
  orderId: number,
  transaction: Transaction,
): Promise<{ hard: string[]; soft: string[] }> {
  const softDependencies: string[] = [];
  log.info(`(dependencyChecks) Checking dependencies for orderId: ${orderId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // Soft Dependency: Order Items (dbo.order_items)
    const orderItemsCheck = await transWrapper.request().input("orderId", orderId).query`
      SELECT COUNT(*) as count
      FROM dbo.order_items
      WHERE order_id = @orderId
    `;
    if (orderItemsCheck.recordset[0].count > 0) {
      softDependencies.push(`${orderItemsCheck.recordset[0].count} order items`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for orderId: ${orderId}`, { soft: softDependencies });
  // Orders do not have hard dependencies that would prevent deletion
  return { hard: [], soft: softDependencies };
}

/**
 * Checks for informative dependencies on an OrderItem.
 * OrderItems are leaf nodes and have no blocking dependencies,
 * but we return informative context about the referenced offering and supplier.
 * @param orderItemId The ID of the order item to check.
 * @param transaction The active database transaction object.
 * @returns An object containing soft dependencies with offering/supplier info (for user information only).
 */
export async function checkOrderItemDependencies(
  orderItemId: number,
  transaction: Transaction,
): Promise<{ hard: string[]; soft: string[] }> {
  const softDependencies: string[] = [];
  log.info(`(dependencyChecks) Checking dependencies for orderItemId: ${orderItemId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // Get offering and supplier information for context
    const offeringInfoCheck = await transWrapper.request().input("orderItemId", orderItemId).query`
      SELECT
        wio.offering_id,
        pd.title AS product_title,
        w.name AS supplier_name,
        w.wholesaler_id
      FROM dbo.order_items oi
      LEFT JOIN dbo.wholesaler_item_offerings wio ON oi.offering_id = wio.offering_id
      LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
      LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
      WHERE oi.order_item_id = @orderItemId
    `;

    if (offeringInfoCheck.recordset.length > 0 && offeringInfoCheck.recordset[0].offering_id) {
      const info = offeringInfoCheck.recordset[0];
      const productInfo = info.product_title || `Offering #${info.offering_id}`;
      const supplierInfo = info.supplier_name || `Supplier #${info.wholesaler_id}`;
      softDependencies.push(`References offering '${productInfo}' from supplier '${supplierInfo}'`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for orderItemId: ${orderItemId}`, { soft: softDependencies });
  // OrderItems are leaf nodes - no hard dependencies that would prevent deletion
  return { hard: [], soft: softDependencies };
}
