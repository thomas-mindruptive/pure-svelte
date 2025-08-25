// src/routes/api/suppliers/+server.ts

/**
 * Suppliers List API Endpoint
 * 
 * @description GET /api/suppliers - Flexible supplier list queries via QueryBuilder
 * 
 * @features
 * - Client defines SELECT, WHERE, ORDER BY via QueryPayload (NO 'from' for security)
 * - Server fixes table to 'dbo.wholesalers'
 * - Supports filtering, sorting, pagination
 * - Full integration with supplierQueryConfig for security
 * - POST request to allow complex query payloads in body
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { Wholesaler } from '$lib/domain/types';

/**
 * POST /api/suppliers
 * 
 * @description Flexible supplier list query via QueryBuilder
 * Client sends QueryPayload (WITHOUT 'from' - server sets table to dbo.wholesalers)
 * Supports complex filtering, sorting, pagination
 */
export const POST: RequestHandler = async (event) => {
    try {
        // Client defines what they want (columns, sorting, filters) - but NOT the table
        const clientPayload = await event.request.json() as QueryPayload;

        // Validate required fields from client
        if (!clientPayload.select || clientPayload.select.length === 0) {
            throw error(400, 'select field is required and cannot be empty');
        }

        log.info("API: Suppliers list query via QueryBuilder", {
            clientColumns: clientPayload.select?.length || 0,
            hasWhere: !!(clientPayload.where?.conditions?.length),
            hasOrderBy: !!(clientPayload.orderBy?.length),
            limit: clientPayload.limit
        });

        // SECURITY: Force table to dbo.wholesalers (no user input for table name)
        const securePayload: QueryPayload = {
            ...clientPayload,
            from: 'dbo.wholesalers', // FIXED: Route determines table
            // Keep client's WHERE conditions as-is (no additional filtering for list view)
            where: clientPayload.where || {
                op: LogicalOperator.AND,
                conditions: [] // Empty = no filtering
            },
            // Security: Cap limit to prevent abuse, set reasonable default
            limit: Math.min(clientPayload.limit || 50, 1000),
            offset: Math.max(clientPayload.offset || 0, 0)
        };

        // Use QueryBuilder with supplierQueryConfig for security
        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        log.info("API: Suppliers list query executed successfully", {
            resultCount: results.length,
            columnsSelected: metadata.selectColumns.length,
            hasJoins: metadata.hasJoins,
            hasWhere: metadata.hasWhere
        });

        return json({
            suppliers: results as Partial<Wholesaler>[],
            meta: {
                retrieved_at: new Date().toISOString(),
                result_count: results.length,
                columns_selected: metadata.selectColumns,
                has_joins: metadata.hasJoins,
                has_where: metadata.hasWhere,
                parameter_count: metadata.parameterCount,
                table_fixed: 'dbo.wholesalers',
                limit: securePayload.limit,
                offset: securePayload.offset,
                sql_generated: sql.replace(/\s+/g, ' ').trim()
            }
        });

    } catch (err: unknown) {
        // Handle SvelteKit errors (400, etc.)
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Suppliers list query failed", {
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};

// Only POST endpoint - consistent with suppliers/[id] pattern
// Client defines QueryPayload, server sets table for security