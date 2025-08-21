// src/routes/suppliers/+page.server.ts - FIXED für korrekte Serialisierung

import { db } from '$lib/server/db';
import { error, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { log } from '$lib/utils/logger';
import { checkWholesalerDependencies } from '$lib/dataModel/dependencyChecks';


async function cascadeDeleteWholesaler(wholesalerId: number, transaction: any) {
    await transaction.request()
        .input('wholesalerId', wholesalerId)
        .query`
      DELETE woa 
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;

    await transaction.request()
        .input('wholesalerId', wholesalerId)
        .query`
      DELETE wol 
      FROM dbo.wholesaler_offering_links wol
      INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;

    await transaction.request()
        .input('wholesalerId', wholesalerId)
        .query`
      DELETE FROM dbo.wholesaler_item_offerings 
      WHERE wholesaler_id = @wholesalerId
    `;

    await transaction.request()
        .input('wholesalerId', wholesalerId)
        .query`
      DELETE FROM dbo.wholesaler_categories 
      WHERE wholesaler_id = @wholesalerId
    `;

    const result = await transaction.request()
        .input('wholesalerId', wholesalerId)
        .query`
      DELETE FROM dbo.wholesalers 
      WHERE wholesaler_id = @wholesalerId
    `;

    return result.rowsAffected[0];
}

export const actions: Actions = {
    delete: async ({ request }) => {
        const formData = await request.formData();
        log.info("\n******************\n suppliers/+page.server.ts: ", formData);
        const supplierIdStr = formData.get('supplierId') as string;
        const cascade = formData.get('cascade') === 'true';

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

        const transaction = db.transaction();

        try {
            await transaction.begin();

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

            const dependencies = await checkWholesalerDependencies(supplierId);

            if (dependencies.length > 0 && !cascade) {
                log.info("\n******************\n suppliers/+page.server.ts: dependencies && cascade == false");
                await transaction.rollback();
                const dependencyList = dependencies.join(', ');

                // ✅ FIX: Create a clean object without circular references
                const cleanSupplier = {
                    wholesaler_id: supplier.wholesaler_id,
                    name: supplier.name,
                    status: supplier.status
                };

                return fail(400, {
                    action: 'delete',
                    error: `Cannot delete supplier: The following dependencies exist: ${dependencyList}. Use cascade delete to remove all related data.`,
                    dependencies: dependencies,
                    supplier: cleanSupplier,
                    showCascadeOption: true
                });
            }

            let deletedRows = 0;

            if (dependencies.length > 0 && cascade) {
                deletedRows = await cascadeDeleteWholesaler(supplierId, transaction);
            } else {
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

            await transaction.commit();

            // ✅ FIX: Return clean success object
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
            log.error("Error during supplier deletion:", err);

            if (err.number) {
                switch (err.number) {
                    case 547:
                        return fail(400, {
                            action: 'delete',
                            error: 'Cannot delete supplier: Foreign key constraint violation. Some dependencies may still exist.'
                        });
                    case 2:
                        return fail(408, {
                            action: 'delete',
                            error: 'Database timeout. The supplier has many dependencies. Please try again.'
                        });
                    case 1205:
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