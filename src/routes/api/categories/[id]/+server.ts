// File: src/routes/api/categories/[id]/+server.ts

/**
 * @file Individual Category API Endpoints - MASTER DATA
 * @description Provides type-safe CRUD operations for a single product_categories master data record.
 * This follows the established patterns from the suppliers API, including dependency
 * checking for safe deletion.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/backendQueries/db';
import { log } from '$lib/utils/logger';
import { validateProductCategory } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { checkProductCategoryMasterDependencies } from '$lib/dataModel/dependencyChecks';
import type { ProductCategory } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
} from '$lib/api/api.types';
import type { 
    DeleteCategoryConflictResponse,
    DeleteCategorySuccessResponse
} from '$lib/api/app/appSpecificTypes';


/**
 * GET /api/categories/[id]
 * @description Retrieves a single category master data record.
 */
export const GET: RequestHandler = async ({ params }) => {
    log.infoHeader("GET /api/categories/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] GET /categories/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        throw error(400, 'Invalid category ID.');
    }

    try {
        const result = await db.request().input('id', id)
            .query('SELECT * FROM dbo.product_categories WHERE category_id = @id');

        if (result.recordset.length === 0) {
            throw error(404, `Category with ID ${id} not found.`);
        }

        const category = result.recordset[0] as ProductCategory;
        const response: ApiSuccessResponse<{ category: ProductCategory }> = {
            success: true,
            message: 'Category retrieved successfully.',
            data: { category },
            meta: { timestamp: new Date().toISOString() }
        };
        return json(response);

    } catch (err: unknown) {
        if ((err as { status: number })?.status !== 404) {
            const { status, message } = mssqlErrorMapper.mapToHttpError(err);
            log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during GET.`, { error: err });
            throw error(status, message);
        }
        throw err; // Re-throw the 404 error
    }
};

/**
 * PUT /api/categories/[id]
 * @description Updates an existing category master data record.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
    log.infoHeader("PUT /api/categories/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] PUT /categories/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = { success: false, message: 'Invalid category ID.', status_code: 400, meta: { timestamp: new Date().toISOString() } };
            return json(errRes, { status: 400 });
        }

        const requestData = await request.json();
        const validation = validateProductCategory({ ...requestData, category_id: id }, { mode: 'update' });

        if (!validation.isValid) {
            const errRes: ApiErrorResponse = { success: false, message: 'Validation failed.', status_code: 400, errors: validation.errors, meta: { timestamp: new Date().toISOString() } };
            return json(errRes, { status: 400 });
        }

        const { name, description } = validation.sanitized as Partial<ProductCategory>;
        const result = await db.request().input('id', id).input('name', name).input('description', description)
            .query('UPDATE dbo.product_categories SET name=@name, description=@description OUTPUT INSERTED.* WHERE category_id = @id');

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = { success: false, message: `Category with ID ${id} not found.`, status_code: 404, meta: { timestamp: new Date().toISOString() } };
            return json(errRes, { status: 404 });
        }
        
        const response: ApiSuccessResponse<{ category: ProductCategory }> = {
            success: true, message: 'Category updated successfully.',
            data: { category: result.recordset[0] as ProductCategory },
            meta: { timestamp: new Date().toISOString() }
        };
        return json(response);
    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during PUT.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/categories/[id]
 * @description Deletes a category master data record with careful dependency checking.
 */
export const DELETE: RequestHandler = async ({ params, url }): Promise<Response> => {
    log.infoHeader("DELETE /api/categories/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] DELETE /categories/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        const errRes: ApiErrorResponse = { success: false, message: 'Invalid category ID.', status_code: 400, meta: { timestamp: new Date().toISOString() } };
        return json(errRes, { status: 400 });
    }

    try {
        const cascade = url.searchParams.get('cascade') === 'true';
        const { hard, soft } = await checkProductCategoryMasterDependencies(id);
        log.info(`Product categrory has dependent objects:`, { hard, soft });

        // Rule 1: Hard dependencies (e.g., offerings) always block deletion.
        if (hard.length > 0) {
            const conflictResponse: DeleteCategoryConflictResponse = {
                success: false, message: 'Cannot delete category: It is still in use by other entities (e.g., offerings).',
                status_code: 409, error_code: 'DEPENDENCY_CONFLICT',
                dependencies: hard, 
                cascade_available: false,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by hard dependencies.`, { dependencies: hard });
            return json(conflictResponse, { status: 409 });
        }

        // Rule 2: Soft dependencies (e.g., assignments) block deletion unless cascade is requested.
        if (soft.length > 0 && !cascade) {
            const conflictResponse: DeleteCategoryConflictResponse = {
                success: false, message: 'Category has active supplier assignments. Use cascade to remove them.',
                status_code: 409, error_code: 'DEPENDENCY_CONFLICT',
                dependencies: soft, 
                cascade_available: true,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by soft dependencies, cascade not requested.`, { dependencies: soft });
            return json(conflictResponse, { status: 409 });
        }

        // Proceed with deletion.
        const transaction = db.transaction();
        await transaction.begin();
        log.info(`[${operationId}] Transaction started for category deletion.`);

        try {
            // Step 1: If cascading, remove soft dependencies (assignments).
            if (cascade && soft.length > 0) {
                await transaction.request().input('categoryId', id)
                    .query('DELETE FROM dbo.wholesaler_categories WHERE category_id = @categoryId');
                log.info(`[${operationId}] Cascaded deletion of ${soft.length} assignments.`);
            }

            // Step 2: Get category details before deleting for the response payload.
            const categoryDetailsResult = await transaction.request().input('id', id)
                .query('SELECT category_id, name FROM dbo.product_categories WHERE category_id = @id');

            if (categoryDetailsResult.recordset.length === 0) {
                await transaction.rollback();
                const errRes: ApiErrorResponse = { success: false, message: `Category with ID ${id} not found to delete.`, status_code: 404, meta: { timestamp: new Date().toISOString() } };
                return json(errRes, { status: 404 });
            }
            const categoryDetails = categoryDetailsResult.recordset[0];

            // Step 3: Delete the master data record itself.
            await transaction.request().input('id', id)
                .query('DELETE FROM dbo.product_categories WHERE category_id = @id');
            
            await transaction.commit();
            log.info(`[${operationId}] Transaction committed.`);

            const response: DeleteCategorySuccessResponse = {
                success: true, message: `Category "${categoryDetails.name}" deleted successfully.`,
                data: {
                    deleted_resource: { category_id: categoryDetails.category_id, name: categoryDetails.name },
                    cascade_performed: cascade,
                    dependencies_cleared: soft.length
                },
                meta: { timestamp: new Date().toISOString() }
            };
            log.info(`[${operationId}] FN_SUCCESS: Category deleted.`, { responseData: response.data });
            return json(response);

        } catch (err) {
            await transaction.rollback();
            log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
            throw err; // Re-throw to be caught by the outer catch block
        }
    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during DELETE.`, { error: err });
        throw error(status, message);
    }
};