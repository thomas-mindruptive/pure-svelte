// src/routes/api/offering-links/+server.ts

/**
 * @file Offering-Links Relationship API - FINAL ARCHITECTURE (FIXED)
 * @description Handles the 1:n composition relationship between offerings and links.
 * This endpoint provides complete CREATE/UPDATE/DELETE operations using consistent
 * relationship patterns. Individual endpoint handles only GET for forms.
 * Level 5 Composition endpoints (link_id primary key, offering_id foreign key).
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/backendQueries/db';
import { log } from '$lib/utils/logger';
import { mssqlErrorMapper } from '$lib/backendQueries/mssqlErrorMapper';
import { WholesalerOfferingLinkForCreateSchema, type WholesalerItemOffering, type WholesalerOfferingLink } from '$lib/domain/domainTypes';
import { validateEntity } from "$lib/domain/domainTypes.utils";
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    CreateChildRequest,
    DeleteRequest,
    DeleteSuccessResponse
} from '$lib/api/api.types';

/**
 * POST /api/offering-links
 * @description Creates a new offering link (replaces /api/offering-links/new).
 */
export const POST: RequestHandler = async ({ request }) => {
    log.infoHeader("POST /api/offering-links");
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /offering-links: FN_START`);

    try {
        // 1. Expect the request body to be the new offering link data.
        const childRequestData = (await request.json()) as CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, 'link_id'>>;
        const offeringId = childRequestData.parentId;
        const linkData = childRequestData.data;
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(childRequestData) });

        // The parent must be defined
        if (!offeringId) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Parent ID (==Offering ID) is required.',
                status_code: 400,
                error_code: 'OFFERING_ID_REQUIRED',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Offering ID is required.`, { offeringId });
            return json(errRes, { status: 400 });
        }
        // Check for offering_id ID mismatch
        if (linkData.offering_id) {
            if (linkData.offering_id !== offeringId) {
                const errRes: ApiErrorResponse = {
                    success: false,
                    message: `Offering ID mismatch. Expected ${offeringId}, got ${linkData.offering_id}.`,
                    status_code: 400,
                    error_code: 'OFFERING_ID_MISMATCH',
                    meta: { timestamp: new Date().toISOString() }
                };
                log.warn(`[${operationId}] FN_FAILURE: Offering ID mismatch.`, { offeringId, linkData });
                return json(errRes, { status: 400 });
            }
        } else {
            linkData.offering_id = offeringId;
        }


        // 2. Validate the incoming data in 'create' mode.
        const validation = validateEntity(WholesalerOfferingLinkForCreateSchema, linkData);
        if (!validation.isValid) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Server validation failed. Please check the provided data: ${JSON.stringify(validation.errors)}`,
                status_code: 400,
                error_code: 'VALIDATION_ERROR',
                errors: validation.errors,
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
            return json(errRes, { status: 400 });
        }

        // 3. Use the sanitized data from the validator for the database operation.
        const { offering_id, url, notes } = validation.sanitized as Partial<WholesalerOfferingLink>;

        // 4. Verify that the offering exists
        const offeringCheck = await db.request()
            .input('offeringId', offering_id)
            .query(`
                SELECT 
                    wio.offering_id,
                    pd.title as offering_title,
                    w.name as supplier_name,
                    pc.name as category_name
                FROM dbo.wholesaler_item_offerings wio
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                LEFT JOIN dbo.wholesalers w ON wio.wholesaler_id = w.wholesaler_id
                LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                WHERE wio.offering_id = @offeringId
            `);

        if (offeringCheck.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering with ID ${offering_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Offering not found.`, { offering_id });
            return json(errRes, { status: 404 });
        }

        const offeringDetails = offeringCheck.recordset[0];

        // 5. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
        const result = await db
            .request()
            .input('offering_id', offering_id)
            .input('url', url)
            .input('notes', notes)
            .query(`
                INSERT INTO dbo.wholesaler_offering_links (offering_id, url, notes) 
                OUTPUT INSERTED.* 
                VALUES (@offering_id, @url, @notes)
            `);

        if (result.recordset.length === 0) {
            log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
            throw error(500, 'Failed to create offering link after database operation.');
        }

        const newLink = result.recordset[0] as WholesalerOfferingLink;

        // 6. Format the successful response with a 201 Created status.
        const response: ApiSuccessResponse<{ link: WholesalerOfferingLink }> = {
            success: true,
            message: `Link created successfully for offering "${offeringDetails.offering_title}".`,
            data: { link: newLink },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Offering link created with ID ${newLink.link_id}.`);
        return json(response, { status: 201 });

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during offering link creation.`, { error: err });
        throw error(status, message);
    }
};

/**
 * PUT /api/offering-links
 * @description Updates an existing offering link (moved from individual endpoint).
 */
export const PUT: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] PUT /offering-links: FN_START`);

    try {
        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // Extract link ID from the request data
        const { link_id } = requestData;
        if (!link_id) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'link_id is required for update operations.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Missing link_id.`);
            return json(errRes, { status: 400 });
        }

        const validation = validateEntity(WholesalerOfferingLinkForCreateSchema, { ...requestData, link_id });
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

        const { offering_id, url, notes } = validation.sanitized;

        // Check if link exists and get current context
        const existsCheck = await db.request()
            .input('linkId', link_id)
            .query(`
                SELECT 
                    wol.link_id, 
                    wol.offering_id,
                    pd.title as offering_title
                FROM dbo.wholesaler_offering_links wol
                LEFT JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                WHERE wol.link_id = @linkId
            `);

        if (existsCheck.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering link with ID ${link_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Link not found for update.`, { link_id });
            return json(errRes, { status: 404 });
        }

        const result = await db.request()
            .input('link_id', link_id)
            .input('offering_id', offering_id)
            .input('url', url)
            .input('notes', notes)
            .query(`
                UPDATE dbo.wholesaler_offering_links 
                SET offering_id=@offering_id, url=@url, notes=@notes
                OUTPUT INSERTED.* 
                WHERE link_id = @link_id
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering link with ID ${link_id} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Link not found for update execution.`);
            return json(errRes, { status: 404 });
        }

        const response: ApiSuccessResponse<{ link: WholesalerOfferingLink }> = {
            success: true,
            message: 'Offering link updated successfully.',
            data: { link: result.recordset[0] as WholesalerOfferingLink },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Link updated.`, { link_id });
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/offering-links
 * @description Deletes an offering link (moved from individual endpoint, leaf node - no dependencies).
 */
export const DELETE: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] DELETE /offering-links: FN_START`);

    try {
        const body = await request.json();
        const { id, cascade = false }: DeleteRequest<WholesalerOfferingLink> = body;
        log.info(`[${operationId}] Parsed request body`, { id, cascade });

        if (!id) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'DELETE /api/offering-links: link_id is required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing id.`);
            return json(errRes, { status: 400 });
        }

        // Get link details before deletion
        const linkResult = await db.request()
            .input('linkId', id)
            .query(`
                SELECT 
                    wol.link_id, 
                    wol.url,
                    pd.title as offering_title
                FROM dbo.wholesaler_offering_links wol
                LEFT JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                WHERE wol.link_id = @linkId
            `);

        if (linkResult.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering link with ID ${id} not found to delete.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Link not found during delete.`, { id });
            return json(errRes, { status: 404 });
        }

        const linkDetails = linkResult.recordset[0];

        // Delete the link (links are leaf nodes in the hierarchy, no dependencies to check)
        const deleteResult = await db.request()
            .input('linkId', id)
            .query('DELETE FROM dbo.wholesaler_offering_links WHERE link_id = @linkId');

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

        const response: DeleteSuccessResponse<{
            link_id: number;
            url: string;
            offering_title: string;
        }> = {
            success: true,
            message: `Offering link deleted successfully.`,
            data: {
                deleted_resource: {
                    link_id: linkDetails.link_id,
                    url: linkDetails.url,
                    offering_title: linkDetails.offering_title || 'Unknown Offering'
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