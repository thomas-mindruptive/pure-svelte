// src/routes/api/suppliers/[id]/+server.ts

/**
 * @file Individual Supplier API Endpoints - FINAL ARCHITECTURE
 * @description Provides type-safe CRUD operations for a single supplier, fully aligned
 * with the final generic type system and comprehensive logging standards.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/backendQueries/queryConfig';
import { validateWholesaler } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { checkWholesalerDependencies } from '$lib/dataModel/dependencyChecks';
import { LogicalOperator, ComparisonOperator, type QueryPayload, type WhereCondition } from '$lib/backendQueries/queryGrammar';
import type { Wholesaler } from '$lib/domain/domainTypes';
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
 * GET /api/suppliers/[id] - Get a single, complete supplier record.
 */
export const GET: RequestHandler = async ({ params }) => {
    log.infoHeader("GET /api/suppliers/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] GET /suppliers/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        // Hier können wir error() werfen, da es keine komplexe Client-Logik erfordert
        throw error(400, 'Invalid supplier ID. It must be a positive number.');
    }

    try {
        // Direkte Abfrage, da keine komplexe Filterung vom Client kommt
        const result = await db.request().input('id', id)
            .query('SELECT * FROM dbo.wholesalers WHERE wholesaler_id = @id');

        if (result.recordset.length === 0) {
            throw error(404, `Supplier with ID ${id} not found.`);
        }

        const supplier = result.recordset[0] as Wholesaler;

        // Einfache, direkte Erfolgsantwort ohne Query-Metadaten
        const response: ApiSuccessResponse<{ supplier: Wholesaler }> = {
            success: true,
            message: 'Supplier retrieved successfully.',
            data: { supplier },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning supplier data.`);
        return json(response);

    } catch (err: unknown) {
        // Wenn es kein 404-Fehler war, den Mapper nutzen
        if ((err as { status: number })?.status !== 404) {
            const { status, message } = mssqlErrorMapper.mapToHttpError(err);
            log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
            throw error(status, message);
        }
        throw err; // Den 404-Fehler erneut werfen
    }
};

/**
 * POST /api/suppliers/[id] - Get a single supplier with flexible fields.
 * ⚠️ Does NOT create a supplier. => /api/suppliers/new POST
 */
export const POST: RequestHandler = async ({ params, request }) => {
    log.infoHeader("POST /api/suppliers/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] POST /suppliers/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = { success: false, message: 'Invalid supplier ID. It must be a positive number.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestBody = (await request.json()) as QueryRequest<Wholesaler>;
        const clientPayload = requestBody.payload;
        log.info(`[${operationId}] Parsed request body`, { clientPayload });

        const supplierIdCondition: WhereCondition<Wholesaler> = { key: 'wholesaler_id', whereCondOp: ComparisonOperator.EQUALS, val: id };
        const securePayload: QueryPayload<Wholesaler> = {
            ...clientPayload,
            from: { table: 'dbo.wholesalers', alias: 'w' },
            where: clientPayload.where ? {
                whereCondOp: LogicalOperator.AND,
                conditions: [supplierIdCondition, clientPayload.where]
            } : {
                whereCondOp: LogicalOperator.AND, conditions: [supplierIdCondition]

            },
            limit: 1
        };

        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        const response: QuerySuccessResponse<Wholesaler> = {
            success: true, message: 'Supplier retrieved successfully.',
            data: {
                results: results as Partial<Wholesaler>[],
                meta: {
                    retrieved_at: new Date().toISOString(), result_count: results.length,
                    columns_selected: metadata.selectColumns, has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere, parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.wholesalers', sql_generated: sql
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
 * PUT /api/suppliers/[id] - Update an existing supplier.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
    log.infoHeader("PUT /api/suppliers/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] PUT /suppliers/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = { success: false, message: 'Invalid supplier ID.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        const validation = validateWholesaler({ ...requestData, wholesaler_id: id }, { mode: 'update' });
        if (!validation.isValid) {
            const errRes: ApiErrorResponse = { success: false, message: 'Validation failed.', status_code: 400, error_code: 'VALIDATION_ERROR', errors: validation.errors, meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
            return json(errRes, { status: 400 });
        }

        const { name, region, status, dropship, website, b2b_notes } = validation.sanitized as Partial<Wholesaler>;
        const result = await db.request().input('id', id).input('name', name).input('region', region).input('status', status).input('dropship', dropship).input('website', website).input('b2b_notes', b2b_notes)
            .query('UPDATE dbo.wholesalers SET name=@name, region=@region, status=@status, dropship=@dropship, website=@website, b2b_notes=@b2b_notes OUTPUT INSERTED.* WHERE wholesaler_id = @id');

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = { success: false, message: `Supplier with ID ${id} not found.`, status_code: 404, error_code: 'NOT_FOUND', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Supplier not found for update.`);
            return json(errRes, { status: 404 });
        }

        const response: ApiSuccessResponse<{ supplier: Wholesaler }> = {
            success: true, message: 'Supplier updated successfully.',
            data: { supplier: result.recordset[0] as Wholesaler },
            meta: { timestamp: new Date().toISOString() }
        };
        log.info(`[${operationId}] FN_SUCCESS: Supplier updated.`);
        return json(response);
    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/suppliers/[id] - Delete a supplier with dependency checks.
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
    log.infoHeader("DELETE /api/suppliers/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] DELETE /suppliers/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = { success: false, message: 'Invalid supplier ID.', status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() } };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const cascade = url.searchParams.get('cascade') === 'true';
        log.info(`[${operationId}] Parsed parameters`, { id, cascade });

        const dependencies = await checkWholesalerDependencies(id);
        if (dependencies.length > 0 && !cascade) {
            const conflictResponse: DeleteConflictResponse<string[]> = {
                success: false,
                message: 'Cannot delete supplier: dependencies exist.',
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
                await transaction.request().input('supplierId', id).query('DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id IN (SELECT offering_id FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @supplierId)');
                await transaction.request().input('supplierId', id).query('DELETE FROM dbo.wholesaler_offering_links WHERE offering_id IN (SELECT offering_id FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @supplierId)');
                await transaction.request().input('supplierId', id).query('DELETE FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @supplierId');
                await transaction.request().input('supplierId', id).query('DELETE FROM dbo.wholesaler_categories WHERE wholesaler_id = @supplierId');
            }

            const result = await transaction.request().input('id', id).query('DELETE FROM dbo.wholesalers OUTPUT DELETED.wholesaler_id, DELETED.name WHERE wholesaler_id = @id');
            await transaction.commit();
            log.info(`[${operationId}] Transaction committed.`);

            if (result.recordset.length === 0) {
                const errRes: ApiErrorResponse = { success: false, message: `Supplier with ID ${id} not found to delete.`, status_code: 404, error_code: 'NOT_FOUND', meta: { timestamp: new Date().toISOString() } };
                log.warn(`[${operationId}] FN_FAILURE: Supplier not found during delete.`);
                return json(errRes, { status: 404 });
            }

            type DeletedSupplierData = Pick<Wholesaler, 'wholesaler_id' | 'name'>;
            type DeleteSupplierSuccessResponse = DeleteSuccessResponse<DeletedSupplierData>;


            const deleted = result.recordset[0];
            const response: DeleteSupplierSuccessResponse = {
                success: true,
                message: `Supplier "${deleted.name}" deleted successfully.`,
                data: {
                    deleted_resource: { wholesaler_id: deleted.wholesaler_id, name: deleted.name },
                    cascade_performed: cascade, 
                    dependencies_cleared: dependencies.length
                },
                meta: { timestamp: new Date().toISOString() }
            };
            log.info(`[${operationId}] FN_SUCCESS: Supplier deleted.`, { deletedId: deleted.wholesaler_id, cascade });
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