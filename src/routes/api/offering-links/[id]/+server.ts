// src/routes/api/offering-links/[id]/+server.ts

/**
 * @file Individual Offering Link API Endpoints - FINAL ARCHITECTURE
 * @description Provides type-safe CRUD operations for a single offering link, following
 * the established patterns from suppliers and offerings. Handles Level 5 (Real Object)
 * as composition of offerings with proper validation and dependency management.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/server/queryBuilder';
import { supplierQueryConfig } from '$lib/clientAndBack/queryConfig';
import { validateOfferingLink } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import { LogicalOperator, ComparisonOperator, type QueryPayload, type Condition } from '$lib/clientAndBack/queryGrammar';
import type { WholesalerOfferingLink } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    DeleteSuccessResponse,
    QueryRequest,
    QuerySuccessResponse
} from '$lib/api/types/common';

/**
 * GET /api/offering-links/[id] - Get a single offering link
 */
export const GET: RequestHandler = async ({ params }) => {
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] GET /offering-links/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        throw error(400, 'Invalid link ID. It must be a positive number.');
    }

    try {
        // Get link with offering details for better UX
        const result = await db.request()
            .input('id', id)
            .query(`
                SELECT 
                    wol.link_id,
                    wol.offering_id,
                    wol.url,
                    wol.notes,
                    wol.created_at,
                    pd.title as offering_title
                FROM dbo.wholesaler_offering_links wol
                LEFT JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
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
            const { status, message } = mssqlErrorMapper.mapToHttpError(err);
            log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
            throw error(status, message);
        }
        throw err;
    }
};

/**
 * POST /api/offering-links/[id] - Get offering link with flexible fields
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] POST /offering-links/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid link ID. It must be a positive number.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestBody = (await request.json()) as QueryRequest<WholesalerOfferingLink>;
        const clientPayload = requestBody.payload;
        log.info(`[${operationId}] Parsed request body`, { clientPayload });

        const linkIdCondition: Condition<WholesalerOfferingLink> = {
            key: 'link_id',
            op: ComparisonOperator.EQUALS,
            val: id
        };

        const securePayload: QueryPayload<WholesalerOfferingLink> = {
            ...clientPayload,
            from: 'dbo.wholesaler_offering_links',
            where: clientPayload.where ? {
                op: LogicalOperator.AND,
                conditions: [linkIdCondition, clientPayload.where]
            } : {
                op: LogicalOperator.AND,
                conditions: [linkIdCondition]
            },
            limit: 1
        };

        const { sql, parameters, metadata } = buildQuery(securePayload, supplierQueryConfig);
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
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * PUT /api/offering-links/[id] - Update an existing offering link
 */
export const PUT: RequestHandler = async ({ params, request }) => {
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] PUT /offering-links/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid link ID.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        const validation = validateOfferingLink({ ...requestData, link_id: id }, { mode: 'update' });
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

        const { offering_id, url, notes } = validation.sanitized as Partial<WholesalerOfferingLink>;

        const result = await db.request()
            .input('id', id)
            .input('offering_id', offering_id)
            .input('url', url)
            .input('notes', notes)
            .query(`
                UPDATE dbo.wholesaler_offering_links 
                SET offering_id=@offering_id, url=@url, notes=@notes
                OUTPUT INSERTED.* 
                WHERE link_id = @id
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering link with ID ${id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Link not found for update.`);
            return json(errRes, { status: 404 });
        }

        const response: ApiSuccessResponse<{ link: WholesalerOfferingLink }> = {
            success: true,
            message: 'Offering link updated successfully.',
            data: { link: result.recordset[0] as WholesalerOfferingLink },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Link updated.`);
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/offering-links/[id] - Delete offering link (leaf node, no dependencies)
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] DELETE /offering-links/${id}: FN_START`);

    try {
        if (isNaN(id) || id <= 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Invalid link ID.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Invalid ID provided.`, { id: params.id });
            return json(errRes, { status: 400 });
        }

        const cascade = url.searchParams.get('cascade') === 'true';
        log.info(`[${operationId}] Parsed parameters`, { id, cascade });

        // Get link details before deletion
        const linkResult = await db.request()
            .input('id', id)
            .query(`
                SELECT wol.link_id, wol.url
                FROM dbo.wholesaler_offering_links wol
                WHERE wol.link_id = @id
            `);

        if (linkResult.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering link with ID ${id} not found to delete.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Link not found during delete.`);
            return json(errRes, { status: 404 });
        }

        const linkDetails = linkResult.recordset[0];

        // Delete the link (links are leaf nodes in the hierarchy, no dependencies to check)
        const deleteResult = await db.request()
            .input('id', id)
            .query('DELETE FROM dbo.wholesaler_offering_links WHERE link_id = @id');

        if (deleteResult.rowsAffected[0] === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Link not found to delete.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Link not found during delete execution.`);
            return json(errRes, { status: 404 });
        }

        const response: DeleteSuccessResponse<{ link_id: number; url: string }> = {
            success: true,
            message: `Offering link deleted successfully.`,
            data: {
                deleted_resource: {
                    link_id: linkDetails.link_id,
                    url: linkDetails.url
                },
                cascade_performed: cascade,
                dependencies_cleared: 0 // Links are leaf nodes with no dependencies
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Link deleted.`, {
            deletedId: linkDetails.link_id,
            cascade
        });
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};