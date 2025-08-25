// src/routes/api/suppliers/[id]/+server.ts

/**
 * Individual Supplier API Endpoints
 * 
 * Uses QueryBuilder with FIXED table (dbo.wholesalers) for security.
 * Client defines columns, sorting, filters - Server adds supplier ID filter.
 * 
 * Endpoints:
 * - POST /api/suppliers/[id] - Flexible supplier query (table fixed to dbo.wholesalers)
 * - PUT /api/suppliers/[id] - Update existing supplier  
 * - DELETE /api/suppliers/[id] - Delete supplier (with dependency handling)
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

/**
 * POST /api/suppliers/[id]
 * 
 * Client sends QueryPayload (WITHOUT 'from' - table is fixed to dbo.wholesalers).
 * Client can specify columns, sorting, joins, additional filters.
 * Server adds supplier ID filter for security and executes via QueryBuilder.
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

        log.info("API: Supplier query via QueryPayload", {
            supplierId: id,
            clientColumns: clientPayload.select?.length || 0,
            hasJoins: !!(clientPayload.joins?.length),
            hasOrderBy: !!(clientPayload.orderBy?.length)
        });

        // SECURITY: Force table and supplier ID filter
        const supplierIdCondition = { key: 'wholesaler_id', op: ComparisonOperator.EQUALS, val: id };

        const securePayload: QueryPayload = {
            ...clientPayload,
            from: 'dbo.wholesalers', // FIXED: Route determines table
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
            limit: Math.min(clientPayload.limit || 50, 1000)
        };

        // Use QueryBuilder with supplierQueryConfig for security
        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        log.info("API: Supplier query executed successfully", {
            supplierId: id,
            resultCount: results.length,
            columnsSelected: metadata.selectColumns.length,
            hasJoins: metadata.hasJoins
        });

        return json({
            results,
            meta: {
                retrieved_at: new Date().toISOString(),
                result_count: results.length,
                columns_selected: metadata.selectColumns,
                has_joins: metadata.hasJoins,
                has_where: metadata.hasWhere,
                parameter_count: metadata.parameterCount,
                table_fixed: 'dbo.wholesalers', // Route determines table
                sql_generated: sql.replace(/\s+/g, ' ').trim()
            }
        });

    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Supplier query failed", {
            supplierId: params.id,
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};

/**
 * PUT /api/suppliers/[id] 
 * Updates an existing supplier with comprehensive validation
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

        // Ensure the ID matches the URL parameter
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

            return json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            }, { status: 400 });
        }

        // Check if supplier exists before updating via QueryBuilder
        const existsPayload: QueryPayload = {
            select: ['COUNT(*) as count'],
            from: 'dbo.wholesalers',
            where: {
                op: LogicalOperator.AND,
                conditions: [{ key: 'wholesaler_id', op: ComparisonOperator.EQUALS, val: id }]
            }
        };

        const { sql: existsSql, parameters: existsParams } = buildQuery(existsPayload, supplierQueryConfig);
        const existsResult = await executeQuery(existsSql, existsParams);

        if (existsResult[0].count === 0) {
            throw error(404, `Supplier with ID ${id} not found`);
        }

        // Perform the update with sanitized data
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
          INSERTED.created_at
        WHERE wholesaler_id = @id
      `);

        const updatedSupplier = updateResult.recordset[0] as Wholesaler;

        log.info("API: Supplier updated successfully", {
            supplierId: id,
            name: updatedSupplier.name
        });

        return json({
            success: true,
            message: 'Supplier updated successfully',
            supplier: updatedSupplier,
            meta: {
                updated_at: new Date().toISOString()
            }
        });

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
 * Deletes a supplier with dependency checking and optional cascade delete
 */
export const DELETE: RequestHandler = async (event) => {
    const { params, url } = event;
    const id = parseInt(params.id ?? '', 10);

    try {
        if (isNaN(id) || id <= 0) {
            throw error(400, 'Invalid supplier ID - must be a positive number');
        }

        // Check for cascade delete option
        const cascade = url.searchParams.get('cascade') === 'true';

        log.info("API: Delete supplier requested", {
            supplierId: id,
            cascade
        });

        // Check if supplier exists via QueryBuilder
        const existsPayload: QueryPayload = {
            select: ['wholesaler_id', 'name'],
            from: 'dbo.wholesalers',
            where: {
                op: LogicalOperator.AND,
                conditions: [{ key: 'wholesaler_id', op: ComparisonOperator.EQUALS, val: id }]
            }
        };

        const { sql: existsSql, parameters: existsParams } = buildQuery(existsPayload, supplierQueryConfig);
        const existsResults = await executeQuery(existsSql, existsParams);

        if (existsResults.length === 0) {
            throw error(404, `Supplier with ID ${id} not found`);
        }

        const supplier = existsResults[0];

        // Check for dependencies
        const dependencies = await checkWholesalerDependencies(id);

        if (dependencies.length > 0 && !cascade) {
            log.info("API: Supplier has dependencies, cascade required", {
                supplierId: id,
                dependencies: dependencies
            });

            return json({
                success: false,
                message: `Cannot delete supplier "${supplier.name}": has ${dependencies.join(', ')}`,
                dependencies,
                cascade_available: true
            }, { status: 409 });
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

            return json({
                success: true,
                message: cascade
                    ? `Supplier "${deletedSupplier.name}" and all related data deleted successfully`
                    : `Supplier "${deletedSupplier.name}" deleted successfully`,
                deleted_supplier: deletedSupplier,
                cascade_performed: cascade,
                dependencies_cleared: dependencies.length,
                meta: {
                    deleted_at: new Date().toISOString()
                }
            });

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