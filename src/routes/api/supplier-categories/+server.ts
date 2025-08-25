// src/routes/api/supplier-categories/+server.ts

/**
 * Supplier Categories Assignment API - FIXED with Type Enforcement
 * 
 * @description Category Assignment Operations for Suppliers
 * 
 * @endpoints
 * - POST /api/supplier-categories - Assign category to supplier  
 * - DELETE /api/supplier-categories - Remove category from supplier
 * 
 * @features
 * - Creates/removes wholesaler_categories relationships
 * - Dependency checking for category removal
 * - Full validation and error handling
 * - Transaction safety for cascade operations
 * ✅ FIXED: Now uses proper type enforcement for all responses
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { checkCategoryDependencies } from '$lib/dataModel/dependencyChecks';
import type { WholesalerCategory } from '$lib/domain/types';

// ✅ CRITICAL: Import response types for type enforcement
import type { 
    AssignCategoryResponse, 
    RemoveCategoryResponse 
} from '$lib/api/types/category';

/**
 * Request body for category assignment
 */
interface AssignCategoryRequest {
    supplierId: number;
    categoryId: number;
    comment?: string;
    link?: string;
}

/**
 * Request body for category removal
 */
interface RemoveCategoryRequest {
    supplierId: number;
    categoryId: number;
    cascade?: boolean;
}

/**
 * POST /api/supplier-categories
 * 
 * @description Assign a category to a supplier
 * Creates entry in dbo.wholesaler_categories table
 * ✅ FIXED: Now uses AssignCategoryResponse type
 */
export const POST: RequestHandler = async (event) => {
    try {
        const requestData = await event.request.json() as AssignCategoryRequest;
        const { supplierId, categoryId, comment, link } = requestData;

        // Validate required fields
        if (!supplierId || !categoryId) {
            throw error(400, 'supplierId and categoryId are required');
        }

        if (typeof supplierId !== 'number' || supplierId <= 0) {
            throw error(400, 'supplierId must be a positive number');
        }

        if (typeof categoryId !== 'number' || categoryId <= 0) {
            throw error(400, 'categoryId must be a positive number');
        }

        log.info("API: Assigning category to supplier", {
            supplierId,
            categoryId,
            hasComment: !!comment,
            hasLink: !!link
        });

        // Check if supplier exists
        const supplierCheck = await db.request()
            .input('supplierId', supplierId)
            .query('SELECT wholesaler_id, name FROM dbo.wholesalers WHERE wholesaler_id = @supplierId');

        if (supplierCheck.recordset.length === 0) {
            throw error(404, `Supplier with ID ${supplierId} not found`);
        }

        const supplier = supplierCheck.recordset[0];

        // Check if category exists  
        const categoryCheck = await db.request()
            .input('categoryId', categoryId)
            .query('SELECT category_id, name FROM dbo.product_categories WHERE category_id = @categoryId');

        if (categoryCheck.recordset.length === 0) {
            throw error(404, `Category with ID ${categoryId} not found`);
        }

        const category = categoryCheck.recordset[0];

        // Check if assignment already exists
        const existingCheck = await db.request()
            .input('supplierId', supplierId)
            .input('categoryId', categoryId)
            .query(`
                SELECT COUNT(*) as count 
                FROM dbo.wholesaler_categories 
                WHERE wholesaler_id = @supplierId AND category_id = @categoryId
            `);

        if (existingCheck.recordset[0].count > 0) {
            throw error(409, `Category "${category.name}" is already assigned to supplier "${supplier.name}"`);
        }

        // Create the assignment
        const result = await db.request()
            .input('supplierId', supplierId)
            .input('categoryId', categoryId)
            .input('comment', comment || null)
            .input('link', link || null)
            .query(`
                INSERT INTO dbo.wholesaler_categories (
                    wholesaler_id, 
                    category_id, 
                    comment, 
                    link,
                    created_at
                )
                OUTPUT 
                    INSERTED.wholesaler_id,
                    INSERTED.category_id,
                    INSERTED.comment,
                    INSERTED.link,
                    INSERTED.created_at
                VALUES (
                    @supplierId, 
                    @categoryId, 
                    @comment, 
                    @link,
                    SYSUTCDATETIME()
                )
            `);

        const assignment = result.recordset[0] as WholesalerCategory;

        log.info("API: Category assigned successfully", {
            supplierId,
            categoryId,
            supplierName: supplier.name,
            categoryName: category.name
        });

        // ✅ FIXED: Use proper type enforcement
        const response: AssignCategoryResponse = {
            success: true,
            message: `Category "${category.name}" assigned to supplier "${supplier.name}" successfully`,
            assignment,
            meta: {
                timestamp: new Date().toISOString(),
                assigned_at: new Date().toISOString(),
                supplier_name: supplier.name,
                category_name: category.name
            }
        };

        return json(response);

    } catch (err: unknown) {
        // Handle SvelteKit errors (400, 404, 409, etc.)
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        // Handle database constraint errors
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Failed to assign category to supplier", {
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};

/**
 * DELETE /api/supplier-categories
 * 
 * @description Remove a category assignment from a supplier
 * Removes entry from dbo.wholesaler_categories table
 * Supports cascade delete of related offerings
 * ✅ FIXED: Now uses RemoveCategoryResponse type
 */
export const DELETE: RequestHandler = async (event) => {
    try {
        const requestData = await event.request.json() as RemoveCategoryRequest;
        const { supplierId, categoryId, cascade = false } = requestData;

        // Validate required fields
        if (!supplierId || !categoryId) {
            throw error(400, 'supplierId and categoryId are required');
        }

        if (typeof supplierId !== 'number' || supplierId <= 0) {
            throw error(400, 'supplierId must be a positive number');
        }

        if (typeof categoryId !== 'number' || categoryId <= 0) {
            throw error(400, 'categoryId must be a positive number');
        }

        log.info("API: Removing category assignment", {
            supplierId,
            categoryId,
            cascade
        });

        // Check if assignment exists
        const assignmentCheck = await db.request()
            .input('supplierId', supplierId)
            .input('categoryId', categoryId)
            .query(`
                SELECT wc.*, w.name as supplier_name, pc.name as category_name
                FROM dbo.wholesaler_categories wc
                JOIN dbo.wholesalers w ON wc.wholesaler_id = w.wholesaler_id
                JOIN dbo.product_categories pc ON wc.category_id = pc.category_id
                WHERE wc.wholesaler_id = @supplierId AND wc.category_id = @categoryId
            `);

        if (assignmentCheck.recordset.length === 0) {
            throw error(404, 'Category assignment not found');
        }

        const assignment = assignmentCheck.recordset[0];

        // Begin transaction for safe deletion
        const transaction = db.transaction();

        try {
            await transaction.begin();

            // Check for dependencies (offerings in this category for this supplier)
            const dependencyCount = await checkCategoryDependencies(supplierId, categoryId, transaction);

            if (dependencyCount > 0 && !cascade) {
                await transaction.rollback();

                log.info("API: Category has dependencies, cascade required", {
                    supplierId,
                    categoryId,
                    dependencyCount
                });

                // ✅ FIXED: Use proper type enforcement for conflict response
                const response: RemoveCategoryResponse = {
                    success: false,
                    message: `Cannot remove category "${assignment.category_name}": has ${dependencyCount} product offerings`,
                    dependencies: {
                        offering_count: dependencyCount,
                        cascade_recommended: true
                    },
                    cascade_available: true,
                    meta: {
                        timestamp: new Date().toISOString()
                    }
                };

                return json(response, { status: 409 });
            }

            if (cascade && dependencyCount > 0) {
                log.info("API: Performing cascade delete", {
                    supplierId,
                    categoryId,
                    offeringsToDelete: dependencyCount
                });

                // Delete related offerings and their dependencies in proper order

                // 1. Delete offering attributes
                await transaction.request()
                    .input('supplierId', supplierId)
                    .input('categoryId', categoryId)
                    .query(`
                        DELETE woa 
                        FROM dbo.wholesaler_offering_attributes woa
                        INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
                        WHERE wio.wholesaler_id = @supplierId AND wio.category_id = @categoryId
                    `);

                // 2. Delete offering links
                await transaction.request()
                    .input('supplierId', supplierId)
                    .input('categoryId', categoryId)
                    .query(`
                        DELETE wol 
                        FROM dbo.wholesaler_offering_links wol
                        INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
                        WHERE wio.wholesaler_id = @supplierId AND wio.category_id = @categoryId
                    `);

                // 3. Delete offerings
                await transaction.request()
                    .input('supplierId', supplierId)
                    .input('categoryId', categoryId)
                    .query(`
                        DELETE FROM dbo.wholesaler_item_offerings 
                        WHERE wholesaler_id = @supplierId AND category_id = @categoryId
                    `);
            }

            // Finally, delete the category assignment
            await transaction.request()
                .input('supplierId', supplierId)
                .input('categoryId', categoryId)
                .query(`
                    DELETE FROM dbo.wholesaler_categories
                    WHERE wholesaler_id = @supplierId AND category_id = @categoryId
                `);

            await transaction.commit();

            log.info("API: Category assignment removed successfully", {
                supplierId,
                categoryId,
                supplierName: assignment.supplier_name,
                categoryName: assignment.category_name,
                cascade,
                offeringsRemoved: cascade ? dependencyCount : 0
            });

            // ✅ FIXED: Use proper type enforcement for success response
            const response: RemoveCategoryResponse = {
                success: true,
                message: cascade
                    ? `Category "${assignment.category_name}" and ${dependencyCount} related offerings removed from supplier "${assignment.supplier_name}"`
                    : `Category "${assignment.category_name}" removed from supplier "${assignment.supplier_name}"`,
                removed_assignment: {
                    supplier_id: supplierId,
                    category_id: categoryId,
                    supplier_name: assignment.supplier_name,
                    category_name: assignment.category_name
                },
                cascade_performed: cascade,
                offerings_removed: cascade ? dependencyCount : 0,
                meta: {
                    timestamp: new Date().toISOString(),
                    removed_at: new Date().toISOString()
                }
            };

            return json(response);

        } catch (transactionError) {
            await transaction.rollback();
            throw transactionError;
        }

    } catch (err: unknown) {
        // Handle SvelteKit errors (400, 404, 409, etc.)
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        // Handle database errors
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Failed to remove category assignment", {
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};