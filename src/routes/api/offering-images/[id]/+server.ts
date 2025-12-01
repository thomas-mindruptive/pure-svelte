// src/routes/api/offering-images/[id]/+server.ts

/**
 * @file Individual Offering Image API Endpoints (Junction Table Pattern)
 * @description CRUD operations for OfferingImage using junction table.
 * Uses offering_image_id (junction ID) as the PK.
 * DELETE removes only the junction entry, not the image itself.
 */

import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateIdUrlParam } from "$lib/backendQueries/genericEntityOperations";
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";
import {
  loadOfferingImageById,
  updateOfferingImage,
  deleteOfferingImage,
  type OfferingImageWithJunction,
} from "$lib/backendQueries/entityOperations/offeringImage";
import type { OfferingImageJunction } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiSuccessResponse,
  DeleteSuccessResponse,
} from "$lib/api/api.types";

/**
 * GET /api/offering-images/[id]
 * Get a single OfferingImage with nested Image data by offering_image_id (junction ID)
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    await tw.begin();
    const offeringImage = await loadOfferingImageById(tw.trans, id);
    await tw.commit();

    if (!offeringImage) {
      throw error(404, `Offering image with ID ${id} not found.`);
    }

    const response: ApiSuccessResponse<{ offeringImage: OfferingImageWithJunction }> = {
      success: true,
      message: "Offering image retrieved successfully.",
      data: { offeringImage },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning offering image data.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    if ((err as { status: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/offering-images/[id]
 * Update OfferingImage junction entry and/or associated Image
 * Uses offering_image_id (junction ID) as PK
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] PUT /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    await tw.begin();
    const updatedRecord = await updateOfferingImage(tw.trans, id, requestData);
    await tw.commit();

    const response: ApiSuccessResponse<{ offeringImage: OfferingImageWithJunction }> = {
      success: true,
      message: "Offering image updated successfully.",
      data: { offeringImage: updatedRecord },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Offering image updated.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/offering-images/[id]
 * Delete OfferingImage junction entry only.
 * The associated image is NOT deleted (it may be used by other offerings).
 * Uses offering_image_id (junction ID) as PK.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `DELETE /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /offering-images/${params.id}: FN_START`);

  const tw = new TransWrapper(null, db);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    await request.json(); // Parse request body (currently unused, but required by API contract)
    log.info(`[${operationId}] Delete request for offering image junction`);

    await tw.begin();
    log.info(`[${operationId}] Transaction started for offering image junction deletion.`);

    // === DELETE JUNCTION ENTRY ==================================================================

    const deletedJunction = await deleteOfferingImage(tw.trans, id);
    await tw.commit();

    const response: DeleteSuccessResponse<OfferingImageJunction> = {
      success: true,
      message: `Offering image junction (ID: ${id}) deleted successfully. Image remains in database.`,
      data: {
        deleted_resource: deletedJunction,
        cascade_performed: false,
        dependencies_cleared: 0,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Offering image junction deleted.`);
    return json(response);
  } catch (err: unknown) {
    await tw.rollback();
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
