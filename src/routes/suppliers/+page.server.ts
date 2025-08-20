import { db } from '$lib/server/db';
import { error, fail } from '@sveltejs/kit';
import type { Actions } from './$types';

/**
 * Helper function to check all dependencies for a wholesaler
 * Based on the actual database schema provided
 */
async function checkWholesalerDependencies(wholesalerId: number) {
  const dependencies = [];

  // 1. Check wholesaler_categories (direct dependency)
  const categoriesCheck = await db.request()
    .input('wholesalerId', wholesalerId)
    .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_categories 
      WHERE wholesaler_id = @wholesalerId
    `;
  
  if (categoriesCheck.recordset[0].count > 0) {
    dependencies.push(`${categoriesCheck.recordset[0].count} assigned categories`);
  }

  // 2. Check wholesaler_item_offerings (depends on wholesaler_categories)
  const offeringsCheck = await db.request()
    .input('wholesalerId', wholesalerId)
    .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_item_offerings 
      WHERE wholesaler_id = @wholesalerId
    `;
  
  if (offeringsCheck.recordset[0].count > 0) {
    dependencies.push(`${offeringsCheck.recordset[0].count} product offerings`);
  }

  // 3. Check wholesaler_offering_links (depends on offerings)
  const linksCheck = await db.request()
    .input('wholesalerId', wholesalerId)
    .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_offering_links wol
      INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;
  
  if (linksCheck.recordset[0].count > 0) {
    dependencies.push(`${linksCheck.recordset[0].count} offering links`);
  }

  // 4. Check wholesaler_offering_attributes (depends on offerings)
  const attributesCheck = await db.request()
    .input('wholesalerId', wholesalerId)
    .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;
  
  if (attributesCheck.recordset[0].count > 0) {
    dependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
  }

  return dependencies;
}

/**
 * Cascading delete function that removes all dependent records
 * in the correct order based on foreign key constraints
 */
async function cascadeDeleteWholesaler(wholesalerId: number, transaction: any) {
  // Delete in reverse dependency order:

  // 1. Delete wholesaler_offering_attributes first
  await transaction.request()
    .input('wholesalerId', wholesalerId)
    .query`
      DELETE woa 
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;

  // 2. Delete wholesaler_offering_links
  await transaction.request()
    .input('wholesalerId', wholesalerId)
    .query`
      DELETE wol 
      FROM dbo.wholesaler_offering_links wol
      INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;

  // 3. Delete wholesaler_item_offerings
  await transaction.request()
    .input('wholesalerId', wholesalerId)
    .query`
      DELETE FROM dbo.wholesaler_item_offerings 
      WHERE wholesaler_id = @wholesalerId
    `;

  // 4. Delete wholesaler_categories
  await transaction.request()
    .input('wholesalerId', wholesalerId)
    .query`
      DELETE FROM dbo.wholesaler_categories 
      WHERE wholesaler_id = @wholesalerId
    `;

  // 5. Finally delete the wholesaler
  const result = await transaction.request()
    .input('wholesalerId', wholesalerId)
    .query`
      DELETE FROM dbo.wholesalers 
      WHERE wholesaler_id = @wholesalerId
    `;

  return result.rowsAffected[0];
}

export const actions: Actions = {
  /**
   * Action for DELETING a wholesaler with all dependencies
   * Based on the actual database schema
   */
  delete: async ({ request }) => {
    const formData = await request.formData();
    const supplierIdStr = formData.get('supplierId') as string;
    const cascade = formData.get('cascade') === 'true'; // Option for cascade delete
    
    if (!supplierIdStr) {
      return fail(400, { 
        action: 'delete', 
        error: 'Supplier ID is required.' 
      });
    }

    const supplierId = parseInt(supplierIdStr);
    if (isNaN(supplierId)) {
      return fail(400, { 
        action: 'delete', 
        error: 'Invalid supplier ID format.' 
      });
    }

    // Start transaction for consistency
    const transaction = db.transaction();
    
    try {
      await transaction.begin();

      // 1. Check if wholesaler exists
      const supplierCheck = await transaction.request()
        .input('supplierId', supplierId)
        .query`
          SELECT wholesaler_id, name, status 
          FROM dbo.wholesalers 
          WHERE wholesaler_id = @supplierId
        `;

      if (supplierCheck.recordset.length === 0) {
        await transaction.rollback();
        return fail(404, { 
          action: 'delete', 
          error: 'Supplier not found.' 
        });
      }

      const supplier = supplierCheck.recordset[0];

      // 2. Check for dependencies
      const dependencies = await checkWholesalerDependencies(supplierId);

      if (dependencies.length > 0 && !cascade) {
        await transaction.rollback();
        const dependencyList = dependencies.join(', ');
        return fail(400, { 
          action: 'delete', 
          error: `Cannot delete supplier: The following dependencies exist: ${dependencyList}. Use cascade delete to remove all related data.`,
          dependencies: dependencies,
          supplier: supplier,
          showCascadeOption: true
        });
      }

      // 3. Perform the delete
      let deletedRows = 0;
      
      if (dependencies.length > 0 && cascade) {
        // Cascade delete all dependencies
        deletedRows = await cascadeDeleteWholesaler(supplierId, transaction);
      } else {
        // Simple delete (no dependencies)
        const result = await transaction.request()
          .input('supplierId', supplierId)
          .query`
            DELETE FROM dbo.wholesalers 
            WHERE wholesaler_id = @supplierId
          `;
        deletedRows = result.rowsAffected[0];
      }

      if (deletedRows === 0) {
        await transaction.rollback();
        return fail(500, { 
          action: 'delete', 
          error: 'Failed to delete supplier from database.' 
        });
      }

      // 4. Commit transaction
      await transaction.commit();

      return { 
        action: 'delete', 
        success: cascade 
          ? `Supplier "${supplier.name}" and all related data deleted successfully!`
          : `Supplier "${supplier.name}" deleted successfully!`,
        cascadeDelete: cascade,
        deletedDependencies: cascade ? dependencies : []
      };

    } catch (err: any) {
      await transaction.rollback();
      console.error("Error deleting supplier:", err);
      
      // Enhanced error handling based on SQL Server error numbers
      if (err.number) {
        switch (err.number) {
          case 547: // Foreign key constraint violation
            return fail(400, { 
              action: 'delete', 
              error: 'Cannot delete supplier: Foreign key constraint violation. Some dependencies may still exist.' 
            });
          case 2: // Timeout
            return fail(408, { 
              action: 'delete', 
              error: 'Database timeout. The supplier has many dependencies. Please try again.' 
            });
          case 1205: // Deadlock
            return fail(409, { 
              action: 'delete', 
              error: 'Database deadlock occurred. Please try again.' 
            });
          default:
            return fail(500, { 
              action: 'delete', 
              error: `Database error (${err.number}): ${err.message}` 
            });
        }
      }
      
      return fail(500, { 
        action: 'delete', 
        error: 'An unexpected error occurred while deleting the supplier.' 
      });
    }
  }
};