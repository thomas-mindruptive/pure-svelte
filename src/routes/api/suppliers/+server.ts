// src/routes/api/suppliers/+server.ts

/**
 * Suppliers List API Endpoint - FIXED with proper Type Enforcement
 * 
 * @description POST /api/suppliers - Type-safe supplier list queries via QueryBuilder
 * ✅ FIXED: Now properly uses SupplierQueryResponse type from api/types
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { Wholesaler } from '$lib/domain/types';

// ✅ CRITICAL: Import the actual response type
import type { SupplierQueryResponse } from '$lib/api/types/supplier';

/**
 * POST /api/suppliers
 * ✅ FIXED: Now uses proper SupplierQueryResponse type
 */
export const POST: RequestHandler = async (event) => {
    try {
        const clientPayload = await event.request.json() as QueryPayload;

        if (!clientPayload.select || clientPayload.select.length === 0) {
            throw error(400, 'select field is required and cannot be empty');
        }

        log.info("API: Suppliers list query via QueryBuilder", {
            clientColumns: clientPayload.select?.length || 0,
            hasWhere: !!(clientPayload.where?.conditions?.length),
            hasOrderBy: !!(clientPayload.orderBy?.length),
            limit: clientPayload.limit
        });

        const securePayload: QueryPayload = {
            ...clientPayload,
            from: 'dbo.wholesalers',
            where: clientPayload.where || {
                op: LogicalOperator.AND,
                conditions: []
            },
            limit: Math.min(clientPayload.limit || 50, 1000),
            offset: Math.max(clientPayload.offset || 0, 0)
        };

        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        log.info("API: Suppliers list query executed successfully", {
            resultCount: results.length,
            columnsSelected: metadata.selectColumns.length,
            hasJoins: metadata.hasJoins,
            hasWhere: metadata.hasWhere
        });

        // ✅ FIXED: Use the actual SupplierQueryResponse type
        const response: SupplierQueryResponse = {
            results: results as Partial<Wholesaler>[],  // ✅ 'results' field required by type
            meta: {
                retrieved_at: new Date().toISOString(),
                result_count: results.length,
                columns_selected: metadata.selectColumns,
                has_joins: metadata.hasJoins,
                has_where: metadata.hasWhere,
                parameter_count: metadata.parameterCount,
                table_fixed: 'dbo.wholesalers',
                sql_generated: sql.replace(/\s+/g, ' ').trim()
            }
        };

        // ✅ TypeScript now ENFORCES the correct structure
        return json(response);

    } catch (err: unknown) {
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