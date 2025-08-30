// src/routes/api/offerings/[id]/+server.ts

/**
 * @file Individual Offering API Endpoints - FINAL ARCHITECTURE
 * @description Provides type-safe CRUD operations for a single offering, following
 * the established patterns from suppliers with offering-specific business logic.
 * Handles Level 3 (Real Object) with composition relationships to attributes and links.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { validateOffering } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { LogicalOperator, ComparisonOperator, type QueryPayload, type Condition } from '$lib/clientAndBack/queryGrammar';
import type { WholesalerItemOffering } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    DeleteConflictResponse,
    DeleteSuccessResponse,
    QueryRequest,
    QuerySuccessResponse
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
 * GET /api/offerings/[id] - Get a single offering with details
 */
export const GET: RequestHandler = async ({ params }) => {
    log.infoHeader("GET /api/offerings/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] GET /offerings/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        throw error(400, 'Invalid offering ID. It must be a positive number.');
    }

    try {
        // Get offering with enriched data using predefined query
        const request: QueryPayload<unknown> = {
            select: [
                'wio.offering_id',
                'wio.wholesaler_id',
                'wio.category_id',
                'wio.product_def_id',
                'wio.price',
                'wio.currency',
                'wio.size',
                'wio.dimensions',
                'wio.comment',
                'wio.created_at',
                'pd.title AS product_def_title',
                'pd.description AS product_def_description',
                'pc.name AS category_name'
            ],
            where: { key: 'wio.offering_id', op: ComparisonOperator.EQUALS, val: id },
            limit: 1
        };

        const { sql, parameters } = buildQuery(request, supplierQueryConfig, 'category_offerings');
        const results = await executeQuery(sql, parameters);

        if (results.length === 0) {
            throw error(404, `Offering with ID ${id} not found.`);
        }

        const offering = results[0];

        const response: ApiSuccessResponse<{ offering: typeof offering }> = {
            success: true,
            message: 'Offering retrieved successfully.',
            data: { offering },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning offering data.`);
        return json(response);

    } catch (err: unknown) {
        if ((err as { status: number })?.status !== 404) {
            const { status, message } = mssqlErrorMapper.mapToHttpError(err);
            log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
            throw error(status, message);
        }
        throw err;
    }
};

/**
 * POST /api/offerings/[id] - Get offering with flexible fields
 */
export const POST: RequestHandler = async ({ params, request }) => {
    log.infoHeader("POST /api/offerings/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] POST /offerings/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid offering ID. It must be a positive number.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestBody = (await request.json()) as QueryRequest<WholesalerItemOffering>;
        const clientPayload = requestBody.payload;
        log.info(`[${operationId}] Parsed request body`, { clientPayload });

        const offeringIdCondition: Condition<WholesalerItemOffering> = {
            key: 'offering_id',
            op: ComparisonOperator.EQUALS,
            val: id
        };

        const securePayload: QueryPayload<WholesalerItemOffering> = {
            ...clientPayload,
            from: 'dbo.wholesaler_item_offerings',
            where: clientPayload.where ? {
                op: LogicalOperator.AND,
                conditions: [offeringIdCondition, clientPayload.where]
            } : {
                op: LogicalOperator.AND,
                conditions: [offeringIdCondition]
            },
            limit: 1
        };

        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        const response: QuerySuccessResponse<WholesalerItemOffering> = {
            success: true,
            message: 'Offering retrieved successfully.',
            data: {
                results: results as Partial<WholesalerItemOffering>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.wholesaler_item_offerings',
                    sql_generated: sql
                }
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} record(s).`);
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * PUT /api/offerings/[id] - Update an existing offering
 */
export const PUT: RequestHandler = async ({ params, request }) => {
    log.infoHeader("PUT /api/offerings/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] PUT /offerings/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid offering ID.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        const validation = validateOffering({ ...requestData, offering_id: id }, { mode: 'update' });
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

        const result = await db.request()
            .input('id', id)
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
                WHERE offering_id = @id
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering with ID ${id} not found.`,
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

        log.info(`[${operationId}] FN_SUCCESS: Offering updated.`);
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/offerings/[id] - Delete offering with dependency checks
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
    log.infoHeader("DELETE /api/offerings/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] DELETE /offerings/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid offering ID.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const cascade = url.searchParams.get('cascade') === 'true';
        log.info(`[${operationId}] Parsed parameters`, { id, cascade });

        const dependencies = await checkOfferingDependencies(id);
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
                    .input('offeringId', id)
                    .query('DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id = @offeringId');

                // Delete offering links
                await transaction.request()
                    .input('offeringId', id)
                    .query('DELETE FROM dbo.wholesaler_offering_links WHERE offering_id = @offeringId');
            }

            // Get offering details before deletion
            const offeringResult = await transaction.request()
                .input('id', id)
                .query(`
                    SELECT wio.offering_id, pd.title as product_def_title
                    FROM dbo.wholesaler_item_offerings wio
                    LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                    WHERE wio.offering_id = @id
                `);

            if (offeringResult.recordset.length === 0) {
                await transaction.rollback();
                const errRes: ApiErrorResponse = {
                    success: false,
                    message: `Offering with ID ${id} not found to delete.`,
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
                .input('id', id)
                .query('DELETE FROM dbo.wholesaler_item_offerings WHERE offering_id = @id');

            await transaction.commit();
            log.info(`[${operationId}] Transaction committed.`);

            const response: DeleteSuccessResponse<{ offering_id: number; product_def_title: string }> = {
                success: true,
                message: `Offering "${offeringDetails.product_def_title}" deleted successfully.`,
                data: {
                    deleted_resource: {
                        offering_id: offeringDetails.offering_id,
                        product_def_title: offeringDetails.product_def_title || 'Unknown Product'
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