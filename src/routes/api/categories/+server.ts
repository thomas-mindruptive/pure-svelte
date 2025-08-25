// src/routes/api/categories/+server.ts

/**
 * Categories API Endpoint
 * 
 * @description POST /api/categories - List all available product categories
 * 
 * @features  
 * - Flexible category queries via QueryBuilder pattern
 * - Client sends QueryPayload (WITHOUT 'from' - server sets table)
 * - Full integration with supplierQueryConfig security
 * - Consistent with suppliers pattern
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { ProductCategory } from '$lib/domain/types';
import type { QuerySuccessResponse } from '$lib/api/types';

/**
 * POST /api/categories
 * 
 * @description Flexible category list query via QueryBuilder
 * Client sends QueryPayload (WITHOUT 'from' - server sets table to dbo.product_categories)
 */
export const POST: RequestHandler = async (event) => {
    try {
        // Client defines what they want (columns, sorting, filters) - but NOT the table
        const clientPayload = await event.request.json() as QueryPayload;

        // Validate required fields from client
        if (!clientPayload.select || clientPayload.select.length === 0) {
            throw error(400, 'select field is required and cannot be empty');
        }

        log.info("API: Categories query via QueryBuilder", {
            clientColumns: clientPayload.select?.length || 0,
            hasWhere: !!(clientPayload.where?.conditions?.length),
            hasOrderBy: !!(clientPayload.orderBy?.length),
            limit: clientPayload.limit
        });

        // SECURITY: Force table to dbo.product_categories (no user input for table name)
        const securePayload: QueryPayload = {
            ...clientPayload,
            from: 'dbo.product_categories', // FIXED: Route determines table
            // Security: Cap limit, set reasonable default
            limit: Math.min(clientPayload.limit || 100, 1000),
            offset: Math.max(clientPayload.offset || 0, 0)
        };

        // Use QueryBuilder with supplierQueryConfig for security
        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
        const results = await executeQuery(sql, parameters);

        log.info("API: Categories query executed successfully", {
            resultCount: results.length,
            columnsSelected: metadata.selectColumns.length,
            hasWhere: metadata.hasWhere
        });

        const response: QuerySuccessResponse<ProductCategory> = {
            success: true,
            message: 'Categories retrieved successfully',
            data: { // Die 'data'-Eigenschaft ist jetzt obligatorisch
                results: results as ProductCategory[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    // ... andere Metadaten der Query
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.product_categories',
                    sql_generated: sql
                }
            },
            meta: { // Die äußere Meta-Eigenschaft für die API-Antwort
                timestamp: new Date().toISOString()
            }
        };

        return json(response);

    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'status' in err) {
            throw err;
        }

        const { status, message } = mssqlErrorMapper.mapToHttpError(err);

        log.error("API: Categories query failed", {
            error: err instanceof Error ? err.message : String(err),
            mappedStatus: status
        });

        throw error(status, message);
    }
};