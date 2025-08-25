// src/routes/api/suppliers/[id]/+server.ts

/**
 * Individual Supplier API Endpoints - FIXED with Type Enforcement
 * 
 * @description Type-safe individual supplier operations with comprehensive validation
 * Uses QueryBuilder pattern with FIXED table security and proper response typing.
 * 
 * @endpoints
 * - POST /api/suppliers/[id] - Flexible supplier query (QueryBuilder)
 * - PUT /api/suppliers/[id] - Update existing supplier  
 * - DELETE /api/suppliers/[id] - Delete supplier with dependency handling
 * 
 * ✅ FIXED: All endpoints now use proper type enforcement from api/types
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { validateWholesaler } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { checkWholesalerDependencies } from '$lib/dataModel/dependencyChecks';
import { LogicalOperator, ComparisonOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { Wholesaler } from '$lib/domain/types';
import type { ApiErrorResponse, ApiSuccessResponse, DeleteConflictResponse, DeleteSuccessResponse, QuerySuccessResponse } from '$lib/api/types';

/**
 * POST /api/suppliers/[id]
 * 
 * @description Flexible supplier query via QueryBuilder with security
 * Client sends QueryPayload (WITHOUT 'from' - server fixes table to dbo.wholesalers)
 * Server adds supplier ID filter automatically for security
 * ✅ FIXED: Now uses SupplierQueryResponse type enforcement
 */
export const POST: RequestHandler = async (event) => {
    const { params, request } = event;

    try {
        const id = parseInt(params.id ?? '', 10);

        if (isNaN(id) || id <= 0) {
            throw error(400, 'Invalid supplier ID - must be a positive number');
        }

        // Client defines what they want (columns, sorting, etc.) - but NOT the table
        const clientPayload = await request.json() as QueryPayload;

        // Validate required fields from client
        if (!clientPayload.select || clientPayload.select.length === 0) {
            throw error(400, 'select field is required and cannot be empty');
        }

        log.info("API: Individual supplier query via QueryBuilder", {
            supplierId: id,
            clientColumns: clientPayload.select?.length || 0,
            hasJoins: !!(clientPayload.joins?.length),
            hasWhere: !!(clientPayload.where?.conditions?.length),
            hasOrderBy: !!(clientPayload.orderBy?.length)
        });

        // SECURITY: Force table and add supplier ID filter
        const supplierIdCondition = {
            key: 'wholesaler_id',
            op: ComparisonOperator.EQUALS,
            val: id
        };

        const securePayload: QueryPayload = {
            ...clientPayload,
            from: 'dbo.wholesalers', // FIXED: Route determines table for security
            where: clientPayload.where ? {
                op: LogicalOperator.AND,
                conditions: [
                    supplierIdCondition,
                    clientPayload.where
                ]
            } : {
                op: LogicalOperator.AND,
                conditions: [supplierIdCondition]
            },
            // Security: Cap limit to prevent abuse
            limit: Math.min(clientPayload.limit || 50, 1000),
            offset: Math.max(clientPayload.offset || 0, 0)
        };

        // Execute query via QueryBuilder with security config
        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        log.info("API: Individual supplier query executed successfully", {
            supplierId: id,
            resultCount: results.length,
            columnsSelected: metadata.selectColumns.length,
            hasJoins: metadata.hasJoins,
            hasWhere: metadata.hasWhere
        });


        const response: QuerySuccessResponse<Wholesaler> = {
            success: true,
            message: 'Suppliers retrieved successfully',
            data: {
                results: results as Partial<Wholesaler>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.wholesalers',
                    sql_generated: sql
                }
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };

        return json(response);

    } catch (err: unknown) {
        // Handle SvelteKit errors (400, etc.)
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        // Handle database errors
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Individual supplier query failed", {
            supplierId: params.id,
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};

/**
 * PUT /api/suppliers/[id]
 * 
 * @description Update existing supplier with comprehensive validation
 * Performs partial updates (PATCH-style) with domain validation
 * ✅ FIXED: Now uses UpdateSupplierResponse type enforcement
 */
export const PUT: RequestHandler = async (event) => {
    const { params, request } = event;
    const id = parseInt(params.id ?? '', 10);

    try {
        if (isNaN(id) || id <= 0) {
            throw error(400, 'Invalid supplier ID - must be a positive number');
        }

        const requestData = await request.json();

        log.info("API: Updating supplier", {
            supplierId: id,
            fields: Object.keys(requestData)
        });

        // Ensure ID matches URL parameter for validation
        const supplierData = { ...requestData, wholesaler_id: id };

        // Domain validation for update operation
        const validation = validateWholesaler(supplierData, {
            mode: 'update',
            context: `supplier_${id}`
        });

        if (!validation.isValid) {
            log.warn("API: Supplier validation failed", {
                supplierId: id,
                errors: validation.errors
            });

            const errorResponse: ApiErrorResponse = {
                success: false,
                message: 'Validation failed',
                status_code: 400, // HTTP_STATUS.BAD_REQUEST
                error_code: 'VALIDATION_ERROR',
                errors: validation.errors,
                meta: {
                    timestamp: new Date().toISOString()
                }
            };

            return json(errorResponse, { status: 400 });
        }

        // Check if supplier exists before updating
        const existsResult = await db.request()
            .input('id', id)
            .query('SELECT COUNT(*) as count FROM dbo.wholesalers WHERE wholesaler_id = @id');

        if (existsResult.recordset[0].count === 0) {
            throw error(404, `Supplier with ID ${id} not found`);
        }

        // Perform update with sanitized data
        const sanitizedData = validation.sanitized as Partial<Wholesaler>;

        const updateResult = await db.request()
            .input('id', id)
            .input('name', sanitizedData.name)
            .input('region', sanitizedData.region || null)
            .input('status', sanitizedData.status || null)
            .input('dropship', sanitizedData.dropship)
            .input('website', sanitizedData.website || null)
            .input('b2b_notes', sanitizedData.b2b_notes || null)
            .query(`
                UPDATE dbo.wholesalers 
                SET 
                    name = @name,
                    region = @region,
                    status = @status,
                    dropship = @dropship,
                    website = @website,
                    b2b_notes = @b2b_notes
                OUTPUT 
                    INSERTED.wholesaler_id,
                    INSERTED.name,
                    INSERTED.region,
                    INSERTED.status,
                    INSERTED.dropship,
                    INSERTED.website,
                    INSERTED.b2b_notes,
                    INSERTED.created_at
                WHERE wholesaler_id = @id
            `);

        const updatedSupplier = updateResult.recordset[0] as Wholesaler;

        log.info("API: Supplier updated successfully", {
            supplierId: id,
            name: updatedSupplier.name
        });

        const response: ApiSuccessResponse<{ supplier: Wholesaler }> = {
            success: true,
            message: 'Supplier updated successfully',
            data: {
                supplier: updatedSupplier
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };

        return json(response);

    } catch (err: unknown) {
        // Handle SvelteKit errors (400, 404, etc.)
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        // Handle database constraint errors
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Failed to update supplier", {
            supplierId: id,
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};

/**
 * DELETE /api/suppliers/[id]
 * 
 * @description Delete supplier with dependency checking and cascade support
 * Two-phase workflow: normal delete -> dependency check -> cascade delete if confirmed
 * ✅ FIXED: Now uses DeleteSupplierResponse type enforcement
 */
export const DELETE: RequestHandler = async (event) => {
    const { params, url } = event;
    const id = parseInt(params.id ?? '', 10);

    try {
        if (isNaN(id) || id <= 0) {
            throw error(400, 'Invalid supplier ID - must be a positive number');
        }

        // Check for cascade delete option from query parameters
        const cascade = url.searchParams.get('cascade') === 'true';

        log.info("API: Supplier deletion requested", {
            supplierId: id,
            cascade
        });

        // Check if supplier exists
        const supplierResult = await db.request()
            .input('id', id)
            .query('SELECT wholesaler_id, name FROM dbo.wholesalers WHERE wholesaler_id = @id');

        if (supplierResult.recordset.length === 0) {
            throw error(404, `Supplier with ID ${id} not found`);
        }

        // Check for dependencies
        const dependencies = await checkWholesalerDependencies(id);

        if (dependencies.length > 0 && !cascade) {
            log.info("API: Supplier has dependencies, cascade delete required", {
                supplierId: id,
                dependencies: dependencies
            });

            const conflictResponse: DeleteConflictResponse<string[]> = {
                success: false,
                message: `Cannot delete supplier: has dependencies.`,
                status_code: 409, // HTTP_STATUS.CONFLICT
                error_code: 'DEPENDENCY_CONFLICT',
                dependencies: dependencies, // Hier kommt das string[] rein
                cascade_available: true,
                meta: {
                    timestamp: new Date().toISOString()
                }
            };

            return json(conflictResponse, { status: 409 });
        }

        // Begin transaction for safe deletion
        const transaction = db.transaction();

        try {
            await transaction.begin();

            if (cascade && dependencies.length > 0) {
                log.info("API: Performing cascade delete", {
                    supplierId: id,
                    dependencies
                });

                // Delete in proper order to respect foreign key constraints

                // 1. Delete offering attributes (deepest level)
                await transaction.request()
                    .input('supplierId', id)
                    .query(`
                        DELETE woa 
                        FROM dbo.wholesaler_offering_attributes woa
                        INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
                        WHERE wio.wholesaler_id = @supplierId
                    `);

                // 2. Delete offering links
                await transaction.request()
                    .input('supplierId', id)
                    .query(`
                        DELETE wol 
                        FROM dbo.wholesaler_offering_links wol
                        INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
                        WHERE wio.wholesaler_id = @supplierId
                    `);

                // 3. Delete offerings
                await transaction.request()
                    .input('supplierId', id)
                    .query(`
                        DELETE FROM dbo.wholesaler_item_offerings 
                        WHERE wholesaler_id = @supplierId
                    `);

                // 4. Delete category assignments
                await transaction.request()
                    .input('supplierId', id)
                    .query(`
                        DELETE FROM dbo.wholesaler_categories 
                        WHERE wholesaler_id = @supplierId
                    `);
            }

            // Finally, delete the supplier itself
            const deleteResult = await transaction.request()
                .input('supplierId', id)
                .query(`
                    DELETE FROM dbo.wholesalers 
                    OUTPUT DELETED.wholesaler_id, DELETED.name
                    WHERE wholesaler_id = @supplierId
                `);

            await transaction.commit();

            const deletedSupplier = deleteResult.recordset[0];

            log.info("API: Supplier deleted successfully", {
                supplierId: id,
                name: deletedSupplier.name,
                cascade,
                dependenciesCleared: dependencies.length
            });

            const response: DeleteSuccessResponse<{ wholesaler_id: number; name: string; }> = {
                success: true,
                message: `Supplier "${deletedSupplier.name}" deleted successfully`,
                data: {
                    deleted_resource: {
                        wholesaler_id: deletedSupplier.wholesaler_id,
                        name: deletedSupplier.name
                    },
                    cascade_performed: cascade,
                    dependencies_cleared: dependencies.length
                },
                meta: {
                    timestamp: new Date().toISOString()
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

        log.error("API: Failed to delete supplier", {
            supplierId: id,
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};