// src/routes/api/offering-attributes/+server.ts

/**
 * @file Offering-Attribute Assignment API - FINAL ARCHITECTURE (FIXED)
 * @description Handles the n:m attributed relationship between offerings and attributes.
 * This endpoint provides complete CREATE/UPDATE/DELETE operations using consistent
 * relationship patterns. Individual endpoint handles only GET for forms.
 * Level 4 Assignment endpoints (offering_id + attribute_id composite key).
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { Attribute, WholesalerItemOffering, WholesalerOfferingAttribute } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    AssignmentRequest,
    AssignmentSuccessResponse,
    AssignmentUpdateRequest,
    DeleteSuccessResponse,
    RemoveAssignmentRequest
} from '$lib/api/api.types';

/**
 * POST /api/offering-attributes
 * @description Creates a new offering-attribute assignment with optional value.
 */
export const POST: RequestHandler = async ({ request }) => {
    log.infoHeader("POST /api/offering-attributes");
    const operationId = uuidv4();
    log.info(`[${operationId}] POST /offering-attributes: FN_START`);

    try {
        const body = (await request.json()) as AssignmentRequest<WholesalerItemOffering, Omit<WholesalerOfferingAttribute, "id">>;
        const { parentId: offeringId, childId: attributeId, data: wholesalerOfferingAttribute } = body;
        log.info(`[${operationId}] Parsed request body`, { offeringId, attributeId, wholesalerOfferingAttribute });

        // This is an assignment: Both, offeringId (parentId) and attributeId (childId) are required.
        if (!offeringId || !attributeId) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'offeringId (parentId) and attributeId (childId) are required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
            return json(errRes, { status: 400 });
        }

        // The value comes in the wholesalerOfferingAttribute object
        if (!wholesalerOfferingAttribute || !wholesalerOfferingAttribute.value) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'data (WholesalerOfferingAttribute) and data.value are required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
            return json(errRes, { status: 400 });
        }

        // Check if offering and attribute exist, and if assignment already exists
        const checkResult = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .query(`
                SELECT 
                    (SELECT COUNT(*) FROM dbo.wholesaler_item_offerings WHERE offering_id = @offeringId) as offering_exists,
                    (SELECT COUNT(*) FROM dbo.attributes WHERE attribute_id = @attributeId) as attribute_exists,
                    (SELECT COUNT(*) FROM dbo.wholesaler_offering_attributes WHERE offering_id = @offeringId AND attribute_id = @attributeId) as assignment_count,
                    (SELECT a.name FROM dbo.attributes a WHERE a.attribute_id = @attributeId) as attribute_name,
                    (SELECT pd.title FROM dbo.wholesaler_item_offerings wio 
                     LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id 
                     WHERE wio.offering_id = @offeringId) as offering_title
            `);

        const { offering_exists, attribute_exists, assignment_count, attribute_name, offering_title } = checkResult.recordset[0];

        if (!offering_exists) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering with ID ${offeringId} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Offering not found.`, { offeringId });
            return json(errRes, { status: 404 });
        }

        if (!attribute_exists) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Attribute with ID ${attributeId} not found.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Attribute not found.`, { attributeId });
            return json(errRes, { status: 404 });
        }

        if (assignment_count > 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Attribute "${attribute_name}" is already assigned to this offering.`,
                status_code: 409,
                error_code: 'ASSIGNMENT_CONFLICT',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment already exists.`, { offeringId, attributeId });
            return json(errRes, { status: 409 });
        }

        // Create the assignment
        const result = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .input('value', wholesalerOfferingAttribute.value || null)
            .query(`
                INSERT INTO dbo.wholesaler_offering_attributes (offering_id, attribute_id, value) 
                OUTPUT INSERTED.* 
                VALUES (@offeringId, @attributeId, @value)
            `);

        const response: AssignmentSuccessResponse<WholesalerOfferingAttribute> = {
            success: true,
            message: `Attribute "${attribute_name}" assigned to offering successfully.`,
            data: {
                assignment: result.recordset[0] as WholesalerOfferingAttribute,
                meta: {
                    assigned_at: new Date().toISOString(),
                    parent_name: offering_title || `Offering #${offeringId}`,
                    child_name: attribute_name || `Attribute #${attributeId}`
                }
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Assignment created.`, { offeringId, attributeId });
        return json(response, { status: 201 });

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during assignment.`, { error: err });
        throw error(status, message);
    }
};

/**
 * PUT /api/offering-attributes
 * @description Updates an existing offering-attribute assignment.
 */
export const PUT: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] PUT /offering-attributes: FN_START`);

    try {
        const body = (await request.json()) as {
            parentId: number; // offeringId
            childId: number;  // attributeId  
            value?: string;
        };
        const { parentId: offeringId, childId: attributeId, data: offeringAttribute }
            = body as AssignmentUpdateRequest<WholesalerItemOffering, WholesalerOfferingAttribute>;
        log.info(`[${operationId}] Parsed request body`, { offeringId, attributeId, offeringAttribute });

        // This is an assignment update: Both, offeringId (parentId) and attributeId (childId) are required.
        if (!offeringId || !attributeId) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'offeringId (parentId) and attributeId (childId) are required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`);
            return json(errRes, { status: 400 });
        }

        if (!offeringAttribute?.value) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'offeringAttribute and offeringAttribute.value are required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`);
            return json(errRes, { status: 400 });
        }

        // Check if assignment exists and get context info
        const existsCheck = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .query(`
                SELECT 
                    woa.offering_id, 
                    woa.attribute_id,
                    woa.value,
                    a.name as attribute_name,
                    pd.title as offering_title
                FROM dbo.wholesaler_offering_attributes woa
                LEFT JOIN dbo.attributes a ON woa.attribute_id = a.attribute_id
                LEFT JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                WHERE woa.offering_id = @offeringId AND woa.attribute_id = @attributeId
            `);

        if (existsCheck.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Assignment not found for offering ${offeringId} and attribute ${attributeId}.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found for update.`, { offeringId, attributeId });
            return json(errRes, { status: 404 });
        }

        const assignmentDetails = existsCheck.recordset[0];

        // Update the assignment value
        const result = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .input('value', offeringAttribute.value)
            .query(`
                UPDATE dbo.wholesaler_offering_attributes 
                SET value = @value
                OUTPUT INSERTED.*
                WHERE offering_id = @offeringId AND attribute_id = @attributeId
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Assignment not found for offering ${offeringId} and attribute ${attributeId}.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found during update execution.`);
            return json(errRes, { status: 404 });
        }

        const response: AssignmentSuccessResponse<WholesalerOfferingAttribute> = {
            success: true,
            message: `Attribute "${assignmentDetails.attribute_name}" assignment updated successfully.`,
            data: {
                assignment: result.recordset[0] as WholesalerOfferingAttribute,
                meta: {
                    assigned_at: new Date().toISOString(),
                    parent_name: assignmentDetails.offering_title || `Offering #${offeringId}`,
                    child_name: assignmentDetails.attribute_name || `Attribute #${attributeId}`
                }
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Assignment updated.`, { offeringId, attributeId });
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during update.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/offering-attributes
 * @description Removes an attribute assignment from an offering.
 */
export const DELETE: RequestHandler = async ({ request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] DELETE /offering-attributes: FN_START`);

    try {
        const body = (await request.json()) as RemoveAssignmentRequest<WholesalerItemOffering, Attribute>;
        const { parentId: offeringId, childId: attributeId, cascade = false } = body;
        log.info(`[${operationId}] Parsed request body`, { offeringId, attributeId, cascade });

        if (!offeringId || !attributeId) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'offeringId (parentId) and attributeId (childId) are required.',
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Validation failed - missing IDs.`, { error: errRes });
            return json(errRes, { status: 400 });
        }

        // Get assignment details before deletion
        const assignmentResult = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .query(`
                SELECT 
                    woa.offering_id, 
                    woa.attribute_id,
                    a.name as attribute_name,
                    pd.title as offering_title
                FROM dbo.wholesaler_offering_attributes woa
                LEFT JOIN dbo.attributes a ON woa.attribute_id = a.attribute_id
                LEFT JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                WHERE woa.offering_id = @offeringId AND woa.attribute_id = @attributeId
            `);

        if (assignmentResult.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Assignment not found to delete.',
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found during delete.`, { offeringId, attributeId });
            return json(errRes, { status: 404 });
        }

        const assignmentDetails = assignmentResult.recordset[0];

        // Since offering-attribute assignments are leaf nodes in the hierarchy,
        // there are typically no dependencies to check. But we keep the cascade pattern for consistency.
        // In future, there could be dependencies like attribute value history, audit logs, etc.

        // Delete the assignment
        const deleteResult = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .query(`
                DELETE FROM dbo.wholesaler_offering_attributes 
                WHERE offering_id = @offeringId AND attribute_id = @attributeId
            `);

        if (deleteResult.rowsAffected[0] === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: 'Assignment not found to delete.',
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found during delete execution.`, { offeringId, attributeId });
            return json(errRes, { status: 404 });
        }

        const response: DeleteSuccessResponse<{
            offering_id: number;
            attribute_id: number;
            offering_title: string;
            attribute_name: string
        }> = {
            success: true,
            message: `Attribute assignment removed successfully.`,
            data: {
                deleted_resource: {
                    offering_id: assignmentDetails.offering_id,
                    attribute_id: assignmentDetails.attribute_id,
                    offering_title: assignmentDetails.offering_title || `Offering #${offeringId}`,
                    attribute_name: assignmentDetails.attribute_name || `Attribute #${attributeId}`
                },
                cascade_performed: cascade,
                dependencies_cleared: 0 // No dependencies for leaf-level assignments
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Assignment removed.`, { responseData: response.data });
        return json(response);

    } catch (err: unknown) {
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during removal.`, { error: err });
        throw error(status, message);
    }
};