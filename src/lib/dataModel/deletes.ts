// in lib/dataModel/cascadingDeletes.ts (oder umbenannt in z.B. `lib/dataModel/productDefinition.ts`)

import { assertDefined } from "$lib/utils/validation/assertions";
import { log } from "$lib/utils/logger";
import type { Transaction } from "mssql";
import type { ProductDefinition, Wholesaler } from "$lib/domain/domainTypes";

/**
 * The shapes of the data returned after a successful deletion.
 */
export type DeletedProductDefinitionData = Pick<ProductDefinition, "product_def_id" | "title">;
export type DeletedSupplierData = Pick<Wholesaler, 'wholesaler_id' | 'name'>;


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
): Promise<DeletedProductDefinitionData> {
  assertDefined(id, `id must be defined for deleteProductDefinition`);
  log.info(`(delete) Preparing to delete ProductDefinition ID: ${id} with cascade=${cascade}`);

  const productDefIdParam = "productDefId";

  // Step 1: Always query the product definition first to get its details for the response
  // and to verify that it exists.
  const selectResult = await transaction.request().input(productDefIdParam, id).query<DeletedProductDefinitionData>(`
            SELECT product_def_id, title 
            FROM dbo.product_definitions 
            WHERE product_def_id = @${productDefIdParam};
        `);

  if (selectResult.recordset.length === 0) {
    // If the record doesn't exist, we can't delete it.
    throw new Error(`Product Definition with ID ${id} not found.`);
  }
  const deletedProductDefData = selectResult.recordset[0];
  log.debug(`(delete) Found product definition to delete: "${deletedProductDefData.title}"`);

  // Step 2: Execute the appropriate delete logic based on the cascade flag.
  if (cascade) {
    log.debug(`(delete) Executing CASCADE delete logic for ProductDefinition ID: ${id}`);
    const cascadeDeleteQuery = `
            WITH OfferingsToDelete AS (
                SELECT o.offering_id
                FROM dbo.wholesaler_item_offerings AS o
                WHERE o.product_def_id = @${productDefIdParam}
            )
            DELETE L FROM dbo.wholesaler_offering_links AS L JOIN OfferingsToDelete AS O ON O.offering_id = L.offering_id;
            DELETE A FROM dbo.wholesaler_offering_attributes AS A JOIN OfferingsToDelete AS O ON O.offering_id = A.offering_id;
            DELETE O FROM dbo.wholesaler_item_offerings AS O WHERE O.product_def_id = @${productDefIdParam};
            DELETE P FROM dbo.product_definitions AS P WHERE P.product_def_id = @${productDefIdParam};
        `;
    await transaction.request().input(productDefIdParam, id).query(cascadeDeleteQuery);
  } else {
    log.debug(`(delete) Executing NON-CASCADE delete for ProductDefinition ID: ${id}`);
    // This will fail with a foreign key constraint violation if dependencies exist, which is the expected behavior.
    await transaction.request().input(productDefIdParam, id).query(`
                DELETE FROM dbo.product_definitions
                WHERE product_def_id = @${productDefIdParam};
            `);
  }

  log.info(`(delete) Delete operation for ProductDefinition ID: ${id} completed successfully within the transaction.`);

  // Step 3: Return the data of the now-deleted resource.
  return deletedProductDefData;
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
    transaction: Transaction
): Promise<DeletedSupplierData> {
    assertDefined(id, `id must be defined for deleteSupplier`);
    log.info(`(delete) Preparing to delete Supplier ID: ${id} with cascade=${cascade}`);

    const supplierIdParam = 'supplierId';

    // Step 1: Always query the supplier first to get its details for the response
    // and to verify that it exists.
    const selectResult = await transaction.request()
        .input(supplierIdParam, id)
        .query<DeletedSupplierData>(`
            SELECT wholesaler_id, name 
            FROM dbo.wholesalers 
            WHERE wholesaler_id = @${supplierIdParam};
        `);

    if (selectResult.recordset.length === 0) {
        throw new Error(`Supplier with ID ${id} not found.`);
    }
    const deletedSupplierData = selectResult.recordset[0];
    log.debug(`(delete) Found supplier to delete: "${deletedSupplierData.name}"`);

    // Step 2: Execute the appropriate delete logic based on the cascade flag.
    if (cascade) {
        log.debug(`(delete) Executing CASCADE delete logic for Supplier ID: ${id}`);
        const cascadeDeleteQuery = `
            -- Define a CTE to find all offerings related to the supplier.
            -- This is needed to delete the indirect dependencies (links, attributes).
            WITH OfferingsToDelete AS (
                SELECT o.offering_id
                FROM dbo.wholesaler_item_offerings AS o
                WHERE o.wholesaler_id = @${supplierIdParam}
            )
            
            -- 1. Delete indirect dependencies: Links
            DELETE L FROM dbo.wholesaler_offering_links AS L
            JOIN OfferingsToDelete AS O ON O.offering_id = L.offering_id;

            -- 2. Delete indirect dependencies: Attributes
            DELETE A FROM dbo.wholesaler_offering_attributes AS A
            JOIN OfferingsToDelete AS O ON O.offering_id = A.offering_id;

            -- 3. Delete direct dependencies: Offerings
            DELETE FROM dbo.wholesaler_item_offerings
            WHERE wholesaler_id = @${supplierIdParam};

            -- 4. Delete direct dependencies: Category Assignments
            DELETE FROM dbo.wholesaler_categories
            WHERE wholesaler_id = @${supplierIdParam};

            -- 5. Finally, delete the master Supplier record.
            DELETE FROM dbo.wholesalers
            WHERE wholesaler_id = @${supplierIdParam};
        `;
        await transaction.request()
            .input(supplierIdParam, id)
            .query(cascadeDeleteQuery);
    } else {
        log.debug(`(delete) Executing NON-CASCADE delete for Supplier ID: ${id}`);
        // This will fail with a foreign key constraint violation if dependencies exist.
        await transaction.request()
            .input(supplierIdParam, id)
            .query(`
                DELETE FROM dbo.wholesalers
                WHERE wholesaler_id = @${supplierIdParam};
            `);
    }
    
    log.info(`(delete) Delete operation for Supplier ID: ${id} completed successfully.`);

    // Step 3: Return the data of the now-deleted resource.
    return deletedSupplierData;
}
