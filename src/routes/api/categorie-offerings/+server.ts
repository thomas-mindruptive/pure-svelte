// src/routes/api/category-offerings/+server.ts

/**
 * @file Category-Offerings Relationship API
 * @description Handles the 1:n hierarchical relationship between categories and offerings.
 * This replaces the individual `/api/offerings/*` endpoints with proper relationship pattern.
 * Level 3 (Hierarchical Real Objects) - Offerings exist only in [supplier + category] context.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateOffering } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { WholesalerItemOffering } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    CreateRequest,
    DeleteConflictResponse,
    DeleteSuccessResponse,
    RemoveAssignmentRequest
} from '$lib/api/types/common';

/**
 * Check offering dependencies (attributes and links)
 */
async function checkOfferingDependencies(offeringId: number): Promise<string[]> {
    const dependencies: string[] = [];

    // Check offering attributes
    const attributesCheck = await db.request()
        .input('offeringId', offeringId)
        .query(`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_offering_attributes 
            WHERE offering_id = @offeringId
        `);

    if (attributesCheck.recordset[0].count > 0) {
        dependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    // Check offering links
    const linksCheck = await db.request()
        .input('offeringId', offeringId)
        .query(`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_offering_links 
            WHERE offering_id = @offeringId
        `);

    if (linksCheck.recordset[0].count > 0) {
        dependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    return dependencies;
}

/**
 * POST /api/category-offerings
 * @description Creates a new offering within a category context (replaces /api/offerings/new).
 */
export const POST: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /category-offerings: FN_START`);

    try {
        // 1. Expect the request body to be the new offering data.
        const requestData = (await request.json()) as CreateRequest<Partial<WholesalerItemOffering>>;
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // 2. Validate the incoming data in 'create' mode.
        const validation = validateOffering(requestData, { mode: 'create' });
        if (!validation.isValid) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Validation failed. Please check the provided data.',
                status_code: 400,
                error_code: 'VALIDATION_ERROR',
                errors: validation.errors,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
            return json(errRes, { status: 400 });
        }

        // 3. Use the sanitized data from the validator for the database operation.
        const { 
            wholesaler_id, 
            category_id, 
            product_def_id, 
            size, 
            dimensions, 
            price, 
            currency, 
            comment 
        } = validation.sanitized as Partial<WholesalerItemOffering>;

        // 4. Verify that supplier and category exist and are related
        const relationCheck = await db.request()
            .input('wholesalerId', wholesaler_id)
            .input('categoryId', category_id)
            .query(`
                SELECT 
                    (SELECT name FROM dbo.wholesalers WHERE wholesaler_id = @wholesalerId) as supplier_name,
                    (SELECT name FROM dbo.product_categories WHERE category_id = @categoryId) as category_name,
                    (SELECT COUNT(*) FROM dbo.wholesaler_categories 
                     WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId) as assignment_exists
            `);

        const { supplier_name, category_name, assignment_exists } = relationCheck.recordset[0];

        if (!supplier_name) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Supplier with ID ${wholesaler_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Supplier not found.`, { wholesaler_id });
            return json(errRes, { status: 404 });
        }

        if (!category_name) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Category with ID ${category_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Category not found.`, { category_id });
            return json(errRes, { status: 404 });
        }

        if (!assignment_exists) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Category "${category_name}" is not assigned to supplier "${supplier_name}". Please assign the category first.`,
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Category not assigned to supplier.`, { 
                wholesaler_id, 
                category_id 
            });
            return json(errRes, { status: 400 });
        }

        // 5. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
        const result = await db
            .request()
            .input('wholesaler_id', wholesaler_id)
            .input('category_id', category_id)
            .input('product_def_id', product_def_id)
            .input('size', size)
            .input('dimensions', dimensions)
            .input('price', price)
            .input('currency', currency)
            .input('comment', comment)
            .query(`
                INSERT INTO dbo.wholesaler_item_offerings (
                    wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment
                ) 
                OUTPUT INSERTED.* 
                VALUES (
                    @wholesaler_id, @category_id, @product_def_id, @size, @dimensions, @price, @currency, @comment
                )
            `);

        if (result.recordset.length === 0) {
            log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
            throw error(500, 'Failed to create offering after database operation.');
        }

        const newOffering = result.recordset[0] as WholesalerItemOffering;

        // 6. Format the successful response with a 201 Created status.
        const response: ApiSuccessResponse<{ offering: WholesalerItemOffering }> = {
            success: true,
            message: `Offering created successfully in category "${category_name}" for supplier "${supplier_name}".`,
            data: { offering: newOffering },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering created with ID ${newOffering.offering_id}.`);
        return json(response, { status: 201 });

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during offering creation.`, { error: err });
        throw error(status, message);
    }
};

/**
 * PUT /api/category-offerings
 * @description Updates an existing offering within category context.
 */
export const PUT: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] PUT /category-offerings: FN_START`);

    try {
        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // Extract offering ID from the request data
        const { offering_id } = requestData;
        if (!offering_id) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'offering_id is required for update operations.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Missing offering_id.`);
            return json(errRes, { status: 400 });
        }

        const validation = validateOffering(requestData, { mode: 'update' });
        if (!validation.isValid) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Validation failed.',
                status_code: 400,
                error_code: 'VALIDATION_ERROR',
                errors: validation.errors,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
            return json(errRes, { status: 400 });
        }

        const { wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment } = 
            validation.sanitized as Partial<WholesalerItemOffering>;

        // Verify the offering exists and get current context
        const existsCheck = await db.request()
            .input('offeringId', offering_id)
            .query(`
                SELECT wio.offering_id, wio.wholesaler_id, wio.category_id,
                       w.name as supplier_name, pc.name as category_name
                FROM dbo.wholesaler_item_offerings wio
                LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                WHERE wio.offering_id = @offeringId
            `);

        if (existsCheck.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering with ID ${offering_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Offering not found for update.`, { offering_id });
            return json(errRes, { status: 404 });
        }

        const result = await db.request()
            .input('offering_id', offering_id)
            .input('wholesaler_id', wholesaler_id)
            .input('category_id', category_id)
            .input('product_def_id', product_def_id)
            .input('size', size)
            .input('dimensions', dimensions)
            .input('price', price)
            .input('currency', currency)
            .input('comment', comment)
            .query(`
                UPDATE dbo.wholesaler_item_offerings 
                SET wholesaler_id=@wholesaler_id, category_id=@category_id, product_def_id=@product_def_id,
                    size=@size, dimensions=@dimensions, price=@price, currency=@currency, comment=@comment
                OUTPUT INSERTED.* 
                WHERE offering_id = @offering_id
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering with ID ${offering_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Offering not found for update.`);
            return json(errRes, { status: 404 });
        }

        const response: ApiSuccessResponse<{ offering: WholesalerItemOffering }> = {
            success: true,
            message: 'Offering updated successfully.',
            data: { offering: result.recordset[0] as WholesalerItemOffering },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering updated.`, { offering_id });
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/category-offerings
 * @description Deletes an offering from a category context with dependency checks.
 */
export const DELETE: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] DELETE /category-offerings: FN_START`);

    try {
        const body = (await request.json()) as RemoveAssignmentRequest<number, number> & { offering_id: number };
        const { offering_id, cascade = false } = body;
        log.info(`[${operationId}] Parsed request body`, { offering_id, cascade });

        if (!offering_id) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'offering_id is required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing offering_id.`);
            return json(errRes, { status: 400 });
        }

        const dependencies = await checkOfferingDependencies(offering_id);
        if (dependencies.length > 0 && !cascade) {
            const conflictResponse: DeleteConflictResponse<string[]> = {
                success: false,
                message: 'Cannot delete offering: dependencies exist.',
                status_code: 409,
                error_code: 'DEPENDENCY_CONFLICT',
                dependencies: dependencies,
                cascade_available: true,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies });
            return json(conflictResponse, { status: 409 });
        }

        const transaction = db.transaction();
        await transaction.begin();
        log.info(`[${operationId}] Transaction started.`);

        try {
            if (cascade && dependencies.length > 0) {
                log.info(`[${operationId}] Performing cascade delete.`);
                
                // Delete offering attributes
                await transaction.request()
                    .input('offeringId', offering_id)
                    .query('DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id = @offeringId');
                
                // Delete offering links
                await transaction.request()
                    .input('offeringId', offering_id)
                    .query('DELETE FROM dbo.wholesaler_offering_links WHERE offering_id = @offeringId');
            }

            // Get offering details before deletion
            const offeringResult = await transaction.request()
                .input('offering_id', offering_id)
                .query(`
                    SELECT wio.offering_id, pd.title as product_def_title,
                           w.name as supplier_name, pc.name as category_name
                    FROM dbo.wholesaler_item_offerings wio
                    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                    LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                    LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                    WHERE wio.offering_id = @offering_id
                `);

            if (offeringResult.recordset.length === 0) {
                await transaction.rollback();
                const errRes: ApiErrorResponse = {
                    success: false,
                    message: `Offering with ID ${offering_id} not found to delete.`,
                    status_code: 404,
                    error_code: 'NOT_FOUND',
                    meta: { timestamp: new Date().toISOString() }
                };
                log.warn(`[${operationId}] FN_FAILURE: Offering not found during delete.`);
                return json(errRes, { status: 404 });
            }

            const offeringDetails = offeringResult.recordset[0];

            // Delete the offering
            await transaction.request()
                .input('offering_id', offering_id)
                .query('DELETE FROM dbo.wholesaler_item_offerings WHERE offering_id = @offering_id');

            await transaction.commit();
            log.info(`[${operationId}] Transaction committed.`);

            const response: DeleteSuccessResponse<{ 
                offering_id: number; 
                product_def_title: string;
                supplier_name: string;
                category_name: string;
            }> = {
                success: true,
                message: `Offering "${offeringDetails.product_def_title}" deleted successfully from category "${offeringDetails.category_name}".`,
                data: {
                    deleted_resource: {
                        offering_id: offeringDetails.offering_id,
                        product_def_title: offeringDetails.product_def_title || 'Unknown Product',
                        supplier_name: offeringDetails.supplier_name || 'Unknown Supplier',
                        category_name: offeringDetails.category_name || 'Unknown Category'
                    },
                    cascade_performed: cascade,
                    dependencies_cleared: dependencies.length
                },
                meta: { timestamp: new Date().toISOString() }
            };

            log.info(`[${operationId}] FN_SUCCESS: Offering deleted.`, {
                deletedId: offeringDetails.offering_id,
                cascade
            });
            return json(response);

        } catch (err) {
            await transaction.rollback();
            log.error(`[${operationId}] FN_EXCEPTION: Transaction failed and was rolled back.`, { error: err });
            throw err;
        }

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};