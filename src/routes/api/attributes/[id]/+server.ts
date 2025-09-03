// src/routes/api/attributes/[id]/+server.ts

/**
 * @file Individual Attribute API Endpoints - FINAL ARCHITECTURE
 * @description Provides type-safe CRUD operations for a single attribute master data record.
 * Handles Level 4 Master-Data following established patterns with dependency checking.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { validateAttribute } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { LogicalOperator, ComparisonOperator, type QueryPayload, type WhereCondition } from '$lib/clientAndBack/queryGrammar';
import type { Attribute } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    DeleteConflictResponse,
    DeleteSuccessResponse,
    QueryRequest,
    QuerySuccessResponse
} from '$lib/api/api.types';

/**
 * Check attribute dependencies (offering-attribute assignments)
 */
async function checkAttributeDependencies(attributeId: number): Promise<string[]> {
    const dependencies: string[] = [];

    // Check offering attribute assignments
    const assignmentsCheck = await db.request()
        .input('attributeId', attributeId)
        .query(`
            SELECT COUNT(*) as count 
            FROM dbo.wholesaler_offering_attributes 
            WHERE attribute_id = @attributeId
        `);

    if (assignmentsCheck.recordset[0].count > 0) {
        dependencies.push(`${assignmentsCheck.recordset[0].count} offering attribute assignments`);
    }

    return dependencies;
}

/**
 * GET /api/attributes/[id] - Get a single attribute record
 */
export const GET: RequestHandler = async ({ params }) => {
    log.infoHeader("GET /api/attributes/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] GET /attributes/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        throw error(400, 'Invalid attribute ID. It must be a positive number.');
    }

    try {
        const result = await db.request().input('id', id)
            .query('SELECT * FROM dbo.attributes WHERE attribute_id = @id');

        if (result.recordset.length === 0) {
            throw error(404, `Attribute with ID ${id} not found.`);
        }

        const attribute = result.recordset[0] as Attribute;

        const response: ApiSuccessResponse<{ attribute: Attribute }> = {
            success: true,
            message: 'Attribute retrieved successfully.',
            data: { attribute },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning attribute data.`);
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
 * POST /api/attributes/[id] - Get attribute with flexible fields
 */
export const POST: RequestHandler = async ({ params, request }) => {
    log.infoHeader("POST /api/attributes/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] POST /attributes/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid attribute ID. It must be a positive number.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestBody = (await request.json()) as QueryRequest<Attribute>;
        const clientPayload = requestBody.payload;
        log.info(`[${operationId}] Parsed request body`, { clientPayload });

        const attributeIdCondition: WhereCondition<Attribute> = {
            key: 'attribute_id',
            whereCondOp: ComparisonOperator.EQUALS,
            val: id
        };

        const securePayload: QueryPayload<Attribute> = {
            ...clientPayload,
            from: { table: 'dbo.attributes', alias: 'a' },
            where: clientPayload.where ? {
                whereCondOp: LogicalOperator.AND,
                conditions: [attributeIdCondition, clientPayload.where]
            } : {
                whereCondOp: LogicalOperator.AND,
                conditions: [attributeIdCondition]
            },
            limit: 1
        };

        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        const response: QuerySuccessResponse<Attribute> = {
            success: true,
            message: 'Attribute retrieved successfully.',
            data: {
                results: results as Partial<Attribute>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.attributes',
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
 * PUT /api/attributes/[id] - Update an existing attribute
 */
export const PUT: RequestHandler = async ({ params, request }) => {
    log.infoHeader("PUT /api/attributes/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] PUT /attributes/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid attribute ID.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        const validation = validateAttribute({ ...requestData, attribute_id: id }, { mode: 'update' });
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

        const { name, description } = validation.sanitized as Partial<Attribute>;

        const result = await db.request()
            .input('id', id)
            .input('name', name)
            .input('description', description)
            .query(`
                UPDATE dbo.attributes 
                SET name=@name, description=@description
                OUTPUT INSERTED.* 
                WHERE attribute_id = @id
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Attribute with ID ${id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Attribute not found for update.`);
            return json(errRes, { status: 404 });
        }

        const response: ApiSuccessResponse<{ attribute: Attribute }> = {
            success: true,
            message: 'Attribute updated successfully.',
            data: { attribute: result.recordset[0] as Attribute },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Attribute updated.`);
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/attributes/[id] - Delete attribute with dependency checks
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
    log.infoHeader("DELETE /api/attributes/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] DELETE /attributes/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid attribute ID.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const cascade = url.searchParams.get('cascade') === 'true';
        log.info(`[${operationId}] Parsed parameters`, { id, cascade });

        const dependencies = await checkAttributeDependencies(id);
        if (dependencies.length > 0 && !cascade) {
            const conflictResponse: DeleteConflictResponse<string[]> = {
                success: false,
                message: 'Cannot delete attribute: dependencies exist.',
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
                
                // Delete offering-attribute assignments
                await transaction.request()
                    .input('attributeId', id)
                    .query('DELETE FROM dbo.wholesaler_offering_attributes WHERE attribute_id = @attributeId');
            }

            // Get attribute details before deletion
            const attributeResult = await transaction.request()
                .input('id', id)
                .query('SELECT attribute_id, name FROM dbo.attributes WHERE attribute_id = @id');

            if (attributeResult.recordset.length === 0) {
                await transaction.rollback();
                const errRes: ApiErrorResponse = {
                    success: false,
                    message: `Attribute with ID ${id} not found to delete.`,
                    status_code: 404,
                    error_code: 'NOT_FOUND',
                    meta: { timestamp: new Date().toISOString() }
                };
                log.warn(`[${operationId}] FN_FAILURE: Attribute not found during delete.`);
                return json(errRes, { status: 404 });
            }

            const attributeDetails = attributeResult.recordset[0];

            // Delete the attribute
            await transaction.request()
                .input('id', id)
                .query('DELETE FROM dbo.attributes WHERE attribute_id = @id');

            await transaction.commit();
            log.info(`[${operationId}] Transaction committed.`);

            const response: DeleteSuccessResponse<{ attribute_id: number; name: string }> = {
                success: true,
                message: `Attribute "${attributeDetails.name}" deleted successfully.`,
                data: {
                    deleted_resource: {
                        attribute_id: attributeDetails.attribute_id,
                        name: attributeDetails.name
                    },
                    cascade_performed: cascade,
                    dependencies_cleared: dependencies.length
                },
                meta: { timestamp: new Date().toISOString() }
            };

            log.info(`[${operationId}] FN_SUCCESS: Attribute deleted.`, {
                deletedId: attributeDetails.attribute_id,
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