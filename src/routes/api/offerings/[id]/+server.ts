// src/routes/api/offerings/[id]/+server.ts

/**
 * @file Individual Offering API Endpoint (CORRECTED)
 * @description Provides GET operation for a single, detailed offering record.
 * This endpoint was previously incorrect and is now fixed to query the correct tables.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { WholesalerItemOffering_ProductDef_Category_Supplier } from '$lib/domain/domainTypes';
import { v4 as uuidv4 } from 'uuid';
import type { ApiSuccessResponse } from '$lib/api/api.types';

/**
 * GET /api/offerings/[id]
 * @description Retrieves a single, detailed offering record including product and category names.
 */
export const GET: RequestHandler = async ({ params }) => {
    log.infoHeader("GET /api/offerings/[id]");
    const operationId = uuidv4();
    const id = parseInt(params.id ?? '', 10);
    log.info(`[${operationId}] GET /offerings/${id}: FN_START`);

    if (isNaN(id) || id <= 0) {
        throw error(400, 'Invalid offering ID.');
    }

    try {
        // This query now correctly joins all necessary tables to build the
        // WholesalerItemOffering_ProductDef_Category type.
        const result = await db
            .request()
            .input('id', id)
            .query(`
                SELECT 
                    wio.*,
                    pd.title AS product_def_title,
                    pd.description AS product_def_description,
                    pc.name AS category_name
                FROM dbo.wholesaler_item_offerings wio
                LEFT JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
                LEFT JOIN dbo.product_categories pc ON wio.category_id = pc.category_id
                WHERE wio.offering_id = @id
            `);

        if (result.recordset.length === 0) {
            throw error(404, `Offering with ID ${id} not found.`);
        }

        const offering = result.recordset[0] as WholesalerItemOffering_ProductDef_Category_Supplier;

        // The response now correctly wraps the data in an 'offering' property.
        const response: ApiSuccessResponse<{ offering: WholesalerItemOffering_ProductDef_Category_Supplier }> = {
            success: true,
            message: 'Offering retrieved successfully.',
            data: { offering },
            meta: { timestamp: new Date().toISOString() }
        };

        log.info(`[${operationId}] FN_SUCCESS: Returning detailed offering data.`);
        return json(response);

    } catch (err: unknown) {
        if ((err as { status?: number })?.status === 404) {
            throw err; // Re-throw SvelteKit's 404 error
        }
        const { status, message } = mssqlErrorMapper.mapToHttpError(err);
        log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during GET.`, { error: err });
        throw error(status, message);
    }
};

// NOTE: PUT and DELETE operations for offerings are correctly handled in '/api/category-offerings'
// as they are hierarchical operations. This endpoint is for READ-ONLY purposes.