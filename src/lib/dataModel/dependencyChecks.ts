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
 * @returns The number of dependent offerings found.
 */
export async function checkSupplierCategoryDependencies(
  wholesalerId: number,
  categoryId: number,
  transaction: Transaction,
): Promise<string[]> {
  log.info("(dependencyChecks) Checking assignment dependencies for", { wholesalerId, categoryId });
  const result = await transaction.request().input("wholesalerId", wholesalerId).input("categoryId", categoryId).query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_item_offerings
      WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId
    `;
  return [`${result.recordset[0].count} offerings`];
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
  const dependencies: string[] = [];
  log.info(`(dependencyChecks) Checking master dependencies for wholesalerId: ${wholesalerId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    const categoriesCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_categories 
      WHERE wholesaler_id = @wholesalerId
    `;
    if (categoriesCheck.recordset[0].count > 0) {
      dependencies.push(`${categoriesCheck.recordset[0].count} assigned categories`);
    }

    const offeringsCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_item_offerings 
      WHERE wholesaler_id = @wholesalerId
    `;
    if (offeringsCheck.recordset[0].count > 0) {
      dependencies.push(`${offeringsCheck.recordset[0].count} product offerings`);
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
      dependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    const attributesCheck = await transWrapper.request().input("wholesalerId", wholesalerId).query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;
    if (attributesCheck.recordset[0].count > 0) {
      dependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for wholesalerId: ${wholesalerId}`, { dependencies });
  return { soft: dependencies, hard: [] };
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
 * Check offering dependencies (attributes and links)
 */
export async function checkOfferingDependencies(
  offeringId: number,
  transaction: Transaction | null,
): Promise<{ hard: string[]; soft: string[] }> {
  const dependencies: string[] = [];

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // Check offering attributes
    const attributesCheck = await db.request().input("offeringId", offeringId).query(`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_offering_attributes 
            WHERE offering_id = @offeringId
        `);

    if (attributesCheck.recordset[0].count > 0) {
      dependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    // Check offering links
    const linksCheck = await db.request().input("offeringId", offeringId).query(`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_offering_links 
            WHERE offering_id = @offeringId
        `);
    if (linksCheck.recordset[0].count > 0) {
      dependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  // Offerings do not have hard dependencies that would prevent a cascade.
  return { hard: [], soft: dependencies };
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
