// src/routes/api/offering-links/[id]/+server.ts

/**
 * @file Individual Offering Link API Endpoints - FINAL ARCHITECTURE (FIXED)
 * @description Provides ONLY GET operation for forms using link_id.
 * PUT/DELETE operations moved to main relationship endpoint `/api/offering-links`.
 * Level 5 Composition individual endpoint - READ ONLY for forms.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/backendQueries/db';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { queryConfig } from '$lib/backendQueries/queryConfig';
import { buildUnexpectedError, validateIdUrlParam } from '$lib/backendQueries/genericEntityOperations';
import { LogicalOperator, ComparisonOperator, type QueryPayload, type WhereCondition } from '$lib/backendQueries/queryGrammar';
import type { WholesalerOfferingLink } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiSuccessResponse,
    QueryRequest,
    QuerySuccessResponse
} from '$lib/api/api.types';

/**
 * GET /api/offering-links/[id] - Get a single offering link
 * @description READ ONLY endpoint for forms. All modifications use main relationship endpoint.
 */
export const GET: RequestHandler = async ({ params }) => {
    const operationId = uuidv4();
    const info = `GET /api/offering-links/${params.id} - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] GET /offering-links/${params.id}: FN_START`);

    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
        return errorResponse;
    }

    try {
        // Get link with offering details for better form UX
        const result = await db.request()
            .input('id', id)
            .query(`
                SELECT 
                    wol.link_id,
                    wol.offering_id,
                    wol.url,
                    wol.notes,
                    wol.created_at,
                    pd.title as offering_title,
                    pd.description as offering_description,
                    w.name as supplier_name,
                    pc.name as category_name
                FROM dbo.wholesaler_offering_links wol
                LEFT JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                WHERE wol.link_id = @id
            `);

        if (result.recordset.length === 0) {
            throw error(404, `Offering link with ID ${id} not found.`);
        }

        const link = result.recordset[0];

        const response: ApiSuccessResponse<{ link: typeof link }> = {
            success: true,
            message: 'Offering link retrieved successfully.',
            data: { link },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning link data.`);
        return json(response);

    } catch (err: unknown) {
        if ((err as { status: number })?.status !== 404) {
            return buildUnexpectedError(err, info);
        }
        throw err;
    }
};

/**
 * POST /api/offering-links/[id] - Get offering link with flexible fields (QueryPayload)
 * @description Alternative READ ONLY endpoint for flexible form field selection.
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const operationId = uuidv4();
    const info = `POST /api/offering-links/${params.id} - ${operationId}`;
    log.infoHeader(info);
    log.info(`[${operationId}] POST /offering-links/${params.id}: FN_START`);

    try {
        const { id, errorResponse } = validateIdUrlParam(params.id);
        if (errorResponse) {
            return errorResponse;
        }

        const requestBody = (await request.json()) as QueryRequest<WholesalerOfferingLink>;
        const clientPayload = requestBody.payload;
        log.info(`[${operationId}] Parsed request body`, { clientPayload });

        const linkIdCondition: WhereCondition<WholesalerOfferingLink> = {
            key: 'link_id',
            whereCondOp: ComparisonOperator.EQUALS,
            val: id
        };

        const securePayload: QueryPayload<WholesalerOfferingLink> = {
            ...clientPayload,
            from: { table: 'dbo.wholesaler_offering_links', alias: 'wol' },
            where: clientPayload.where ? {
                whereCondOp: LogicalOperator.AND,
                conditions: [linkIdCondition, clientPayload.where]
            } : {
                whereCondOp: LogicalOperator.AND,
                conditions: [linkIdCondition]
            },
            limit: 1
        };

        const { sql, parameters, metadata } = buildQuery(securePayload, queryConfig);
        const results = await executeQuery(sql, parameters);

        const response: QuerySuccessResponse<WholesalerOfferingLink> = {
            success: true,
            message: 'Offering link retrieved successfully.',
            data: {
                results: results as Partial<WholesalerOfferingLink>[],
                meta: {
                    retrieved_at: new Date().toISOString(),
                    result_count: results.length,
                    columns_selected: metadata.selectColumns,
                    has_joins: metadata.hasJoins,
                    has_where: metadata.hasWhere,
                    parameter_count: metadata.parameterCount,
                    table_fixed: 'dbo.wholesaler_offering_links',
                    sql_generated: sql
                }
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning ${results.length} record(s).`);
        return json(response);

    } catch (err: unknown) {
        return buildUnexpectedError(err, info);
    }
};

/**
 * PUT - REMOVED - Use /api/offering-links instead
 * DELETE - REMOVED - Use /api/offering-links instead
 * 
 * All modification operations moved to main relationship endpoint:
 * - POST /api/offering-links (create link)
 * - PUT /api/offering-links (update link)
 * - DELETE /api/offering-links (remove link)
 */