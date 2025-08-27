// src/routes/api/offering-attributes/[offeringId]/[attributeId]/+server.ts

/**
 * @file Individual Offering-Attribute Assignment API Endpoints - FINAL ARCHITECTURE
 * @description Provides type-safe CRUD operations for a single offering-attribute assignment
 * using composite key (offeringId + attributeId). Handles Level 4 Assignment operations
 * following established patterns with direct SQL and proper validation.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { validateOfferingAttribute } from '$lib/server/validation/domainValidator';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { WholesalerOfferingAttribute } from '$lib/domain/types';
import { v4 as uuidv4 } from 'uuid';

import type {
    ApiErrorResponse,
    ApiSuccessResponse,
    DeleteSuccessResponse
} from '$lib/api/types/common';

/**
 * Parse and validate composite key parameters
 */
function parseCompositeKey(params: { offeringId?: string; attributeId?: string }) {
    const offeringId = parseInt(params.offeringId ?? '', 10);
    const attributeId = parseInt(params.attributeId ?? '', 10);
    
    if (isNaN(offeringId) || offeringId <= 0) {
        throw new Error('Invalid offering ID. It must be a positive number.');
    }
    
    if (isNaN(attributeId) || attributeId <= 0) {
        throw new Error('Invalid attribute ID. It must be a positive number.');
    }
    
    return { offeringId, attributeId };
}

/**
 * GET /api/offering-attributes/[offeringId]/[attributeId] - Get a single offering-attribute assignment
 */
export const GET: RequestHandler = async ({ params }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] GET /offering-attributes/[offeringId]/[attributeId]: FN_START`);

    try {
        const { offeringId, attributeId } = parseCompositeKey(params as { offeringId?: string; attributeId?: string });

        // Get assignment with enriched data
        const result = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .query(`
                SELECT 
                    woa.offering_id,
                    woa.attribute_id,
                    woa.value,
                    a.name as attribute_name,
                    a.description as attribute_description,
                    pd.title as offering_title
                FROM dbo.wholesaler_offering_attributes woa
                LEFT JOIN dbo.attributes a ON woa.attribute_id = a.attribute_id
                LEFT JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                WHERE woa.offering_id = @offeringId AND woa.attribute_id = @attributeId
            `);

        if (result.recordset.length === 0) {
            throw error(404, `Offering-attribute assignment not found for offering ${offeringId} and attribute ${attributeId}.`);
        }

        const assignment = result.recordset[0];

        const response: ApiSuccessResponse<{ assignment: typeof assignment }> = {
            success: true,
            message: 'Offering-attribute assignment retrieved successfully.',
            data: { assignment },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning assignment data.`);
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
 * PUT /api/offering-attributes/[offeringId]/[attributeId] - Update offering-attribute assignment
 */
export const PUT: RequestHandler = async ({ params, request }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] PUT /offering-attributes/[offeringId]/[attributeId]: FN_START`);

    try {
        const { offeringId, attributeId } = parseCompositeKey(params as { offeringId?: string; attributeId?: string });

        const requestData = await request.json();
        log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

        // Validate with composite key included for validation context
        const validation = validateOfferingAttribute({
            ...requestData,
            offering_id: offeringId,
            attribute_id: attributeId
        }, { mode: 'update' });

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

        // Extract only the value field (offering_id and attribute_id are immutable in assignments)
        const { value } = validation.sanitized as Partial<WholesalerOfferingAttribute>;

        const result = await db.request()
            .input('offeringId', offeringId)
            .input('attributeId', attributeId)
            .input('value', value)
            .query(`
                UPDATE dbo.wholesaler_offering_attributes 
                SET value = @value
                OUTPUT INSERTED.*
                WHERE offering_id = @offeringId AND attribute_id = @attributeId
            `);

        if (result.recordset.length === 0) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: `Offering-attribute assignment not found for offering ${offeringId} and attribute ${attributeId}.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found for update.`);
            return json(errRes, { status: 404 });
        }

        const response: ApiSuccessResponse<{ assignment: WholesalerOfferingAttribute }> = {
            success: true,
            message: 'Offering-attribute assignment updated successfully.',
            data: { assignment: result.recordset[0] as WholesalerOfferingAttribute },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Assignment updated.`);
        return json(response);

    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Invalid')) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: err.message,
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: ${err.message}`);
            return json(errRes, { status: 400 });
        }

        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};

/**
 * DELETE /api/offering-attributes/[offeringId]/[attributeId] - Delete offering-attribute assignment
 */
export const DELETE: RequestHandler = async ({ params }) => {
    const operationId = uuidv4();
    log.info(`[${operationId}] DELETE /offering-attributes/[offeringId]/[attributeId]: FN_START`);

    try {
        const { offeringId, attributeId } = parseCompositeKey(params as { offeringId?: string; attributeId?: string });

        // Get assignment details before deletion for response
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
                message: `Offering-attribute assignment not found for offering ${offeringId} and attribute ${attributeId}.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found during delete.`);
            return json(errRes, { status: 404 });
        }

        const assignmentDetails = assignmentResult.recordset[0];

        // Delete the assignment (leaf node, no dependencies to check)
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
                message: `Assignment not found to delete.`,
                status_code: 404,
                error_code: 'NOT_FOUND',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: Assignment not found during delete execution.`);
            return json(errRes, { status: 404 });
        }

        const response: DeleteSuccessResponse<{ 
            offering_id: number; 
            attribute_id: number; 
            offering_title: string; 
            attribute_name: string 
        }> = {
            success: true,
            message: `Offering-attribute assignment deleted successfully.`,
            data: {
                deleted_resource: {
                    offering_id: assignmentDetails.offering_id,
                    attribute_id: assignmentDetails.attribute_id,
                    offering_title: assignmentDetails.offering_title || `Offering #${offeringId}`,
                    attribute_name: assignmentDetails.attribute_name || `Attribute #${attributeId}`
                },
                cascade_performed: false,
                dependencies_cleared: 0 // Assignment is leaf node
            },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Assignment deleted.`, {
            offeringId,
            attributeId
        });
        return json(response);

    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Invalid')) {
            const errRes: ApiErrorResponse = {
                success: false,
                message: err.message,
                status_code: 400,
                error_code: 'BAD_REQUEST',
                meta: { timestamp: new Date().toISOString() }
            };
            log.warn(`[${operationId}] FN_FAILURE: ${err.message}`);
            return json(errRes, { status: 400 });
        }

        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error.`, { error: err });
        throw error(status, message);
    }
};