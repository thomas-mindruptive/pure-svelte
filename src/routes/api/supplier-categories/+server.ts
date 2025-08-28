// src/routes/api/supplier-categories/+server.ts

/**
 * @file Supplier-Category Assignment API - FINAL ARCHITECTURE
 * @description Handles the n:m relationship with proper, explicit type usage for all
 * success and error responses, returning structured JSON for handled errors
 * instead of throwing.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { checkCategoryDependencies } from '$lib/dataModel/dependencyChecks';
import type { ProductCategory, Wholesaler, WholesalerCategory } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    AssignmentRequest,
    AssignmentSuccessResponse,
    DeleteConflictResponse,
    DeleteSuccessResponse,
    RemoveAssignmentRequest
} from '$lib/api/types/common';

/**
 * POST /api/supplier-categories
 * @description Assigns a category to a supplier.
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /supplier-categories: FN_START`);

    try {
        const body = (await request.json()) as AssignmentRequest<Wholesaler, ProductCategory, { comment?: string; link?: string }>;
        const { parentId: supplierId, childId: categoryId, comment, link } = body;
        log.info(`[${operationId}] Parsed request body`, { supplierId, categoryId });

        if (!supplierId || !categoryId) {
            const errRes: ApiErrorResponse = { success: false, message: 'supplierId (parentId) and categoryId (childId) are required.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
            return json(errRes, { status: 400 });
        }

        const checkResult = await db.request().input('supplierId', supplierId).input('categoryId', categoryId)
            .query(`
                SELECT (SELECT name FROM dbo.wholesalers WHERE wholesaler_id = @supplierId) as supplier_name,
                       (SELECT name FROM dbo.product_categories WHERE category_id = @categoryId) as category_name,
                       (SELECT COUNT(*) FROM dbo.wholesaler_categories WHERE wholesaler_id = @supplierId AND category_id = @categoryId) as assignment_count;
            `);
        const { supplier_name, category_name, assignment_count } = checkResult.recordset[0];

        if (!supplier_name) {
            const errRes: ApiErrorResponse = { success: false, message: `Supplier with ID ${supplierId} not found.`, status_code: 404, error_code: 'NOT_FOUND', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Supplier not found.`, { supplierId });
            return json(errRes, { status: 404 });
        }
        if (!category_name) {
            const errRes: ApiErrorResponse = { success: false, message: `Category with ID ${categoryId} not found.`, status_code: 404, error_code: 'NOT_FOUND', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Category not found.`, { categoryId });
            return json(errRes, { status: 404 });
        }
        if (assignment_count > 0) {
            const errRes: ApiErrorResponse = { success: false, message: `Category "${category_name}" is already assigned to supplier "${supplier_name}".`, status_code: 409, error_code: 'ASSIGNMENT_CONFLICT', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Assignment already exists.`, { supplierId, categoryId });
            return json(errRes, { status: 409 });
        }

        const result = await db.request().input('supplierId', supplierId).input('categoryId', categoryId).input('comment', comment || null).input('link', link || null)
            .query('INSERT INTO dbo.wholesaler_categories (wholesaler_id, category_id, comment, link) OUTPUT INSERTED.* VALUES (@supplierId, @categoryId, @comment, @link)');

        const response: AssignmentSuccessResponse<WholesalerCategory> = {
            success: true, message: `Category "${category_name}" assigned to supplier "${supplier_name}".`,
            data: {
                assignment: result.recordset[0] as WholesalerCategory,
                meta: { assigned_at: new Date().toISOString(), parent_name: supplier_name, child_name: category_name }
            },
            meta: { timestamp: new Date().toISOString() }
        };
        log.info(`[${operationId}] FN_SUCCESS: Assignment created.`, { supplierId, categoryId });
        return json(response, { status: 201 });

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during assignment.`, { error: err });
        // Only THROW for unexpected server errors.
        throw error(status, message);
    }
};

/**
 * DELETE /api/supplier-categories
 * @description Removes a category assignment.
 */
export const DELETE: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] DELETE /supplier-categories: FN_START`);

    try {
        const body = (await request.json()) as RemoveAssignmentRequest<Wholesaler, ProductCategory>;
        const { parentId: supplierId, childId: categoryId, cascade = false } = body;
        log.info(`[${operationId}] Parsed request body`, { supplierId, categoryId, cascade });

        if (!supplierId || !categoryId) {
            const errRes: ApiErrorResponse = { success: false, message: 'supplierId (parentId) and categoryId (childId) are required.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
            return json(errRes, { status: 400 });
        }

        const transaction = db.transaction();
        await transaction.begin();
        log.info(`[${operationId}] Transaction started.`);

        try {
            const dependencyCount = await checkCategoryDependencies(supplierId, categoryId, transaction);

            if (dependencyCount > 0 && !cascade) {
                await transaction.rollback();
                const conflictResponse: DeleteConflictResponse<{ offering_count: number }> = {
                    success: false, message: `Cannot remove assignment: ${dependencyCount} dependent offerings exist.`,
                    status_code: 409, error_code: 'DEPENDENCY_CONFLICT',
                    dependencies: { offering_count: dependencyCount },
                    cascade_available: true, meta: { timestamp: new Date().toISOString() }
                };
                log.warn(`[${operationId}] FN_FAILURE: Removal blocked by dependencies. Transaction rolled back.`, { dependencyCount });
                return json(conflictResponse, { status: 409 });
            }

            if (cascade && dependencyCount > 0) {
                log.info(`[${operationId}] Performing cascade delete of ${dependencyCount} offerings.`);
                await transaction.request().input('supplierId', supplierId).input('categoryId', categoryId).query('DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id IN (SELECT offering_id FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @supplierId AND category_id = @categoryId)');
                await transaction.request().input('supplierId', supplierId).input('categoryId', categoryId).query('DELETE FROM dbo.wholesaler_offering_links WHERE offering_id IN (SELECT offering_id FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @supplierId AND category_id = @categoryId)');
                await transaction.request().input('supplierId', supplierId).input('categoryId', categoryId).query('DELETE FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @supplierId AND category_id = @categoryId');
            }

            const namesResult = await transaction.request().input('supplierId', supplierId).input('categoryId', categoryId).query(`SELECT (SELECT name FROM dbo.wholesalers WHERE wholesaler_id = @supplierId) as supplier_name, (SELECT name FROM dbo.product_categories WHERE category_id = @categoryId) as category_name;`);
            const { supplier_name, category_name } = namesResult.recordset[0] ?? {};

            const deleteResult = await transaction.request().input('supplierId', supplierId).input('categoryId', categoryId).query('DELETE FROM dbo.wholesaler_categories WHERE wholesaler_id = @supplierId AND category_id = @categoryId');
            await transaction.commit();
            log.info(`[${operationId}] Transaction committed.`);

            if (deleteResult.rowsAffected[0] === 0) {
                const errRes: ApiErrorResponse = { success: false, message: 'Assignment not found to delete.', status_code: 404, error_code: 'NOT_FOUND', meta: { timestamp: new Date().toISOString() } };
                log.warn(`[${operationId}] FN_FAILURE: Assignment not found during delete.`, { supplierId, categoryId });
                return json(errRes, { status: 404 });
            }

            const response: DeleteSuccessResponse<{ supplier_id: number; category_id: number; supplier_name: string; category_name: string }> = {
                success: true, message: `Category assignment removed successfully.`,
                data: {
                    deleted_resource: { supplier_id: supplierId, category_id: categoryId, supplier_name: String(supplier_name), category_name: String(category_name) },
                    cascade_performed: cascade,
                    dependencies_cleared: dependencyCount
                },
                meta: { timestamp: new Date().toISOString() }
            };
            log.info(`[${operationId}] FN_SUCCESS: Assignment removed.`, { responseData: response.data });
            return json(response);
        } catch (err) {
            log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
            await transaction.rollback();
            throw err; // Re-throw to be caught by the outer catch block
        }
    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during removal.`, { error: err });
        throw error(status, message);
    }
};