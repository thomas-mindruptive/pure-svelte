// src/routes/api/offering-images/[id]/+server.ts

/**
 * @file Individual Offering Image API Endpoints (Junction Table Pattern)
 * @description CRUD operations for OfferingImage using junction table.
 * Uses offering_image_id (junction ID) as the PK.
 * DELETE removes only the junction entry, not the image itself.
 */

import { db } from "$lib/backendQueries/db";
import {
  deleteOfferingImage,
  loadOfferingImageById,
  updateOfferingImage,
  type OfferingImageWithJunction,
} from "$lib/backendQueries/entityOperations/offeringImage";
import { buildUnexpectedError, validateIdUrlParam } from "$lib/backendQueries/genericEntityOperations";
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";
import type { OfferingImageView } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiSuccessResponse,
  DeleteRequest
} from "$lib/api/api.types";
import { buildDeleteConflictResponseFromError, buildDeleteSuccessResponseFromDeleteResult } from "$lib/api/backend/responseUtils";
import { DeleteCascadeBlockedError } from "$lib/backendQueries/entityOperations/entityErrors";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";

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
 * Delete OfferingImage junction entry with dependency checking and optional cascade delete.
 * Follows the established pattern for master data deletion with cascade/forceCascade support.
 * Uses offering_image_id (junction ID) as PK.
 */
export const DELETE: RequestHandler = async ({ params, request }): Promise<Response> => {
  const operationId = uuidv4();
  const info = `DELETE /api/offering-images/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /offering-images/${params.id}: FN_START`);


  const { id, errorResponse } = validateIdUrlParam(params.id);
  if (errorResponse) {
    return errorResponse;
  }

  const body: DeleteRequest<OfferingImageView> = await request.json();
  const cascade = body.cascade || false;
  const forceCascade = body.forceCascade || false;
  log.debug(`[${operationId}] Parsed request body`, { id, cascade, forceCascade });

  const transaction = db.transaction();
  await transaction.begin();
  log.info(`[${operationId}] Transaction started for offering image junction deletion.`);

  let deleteResult;
  try {
    deleteResult = await deleteOfferingImage(transaction, id, cascade, forceCascade);
    await transaction.commit();  

    const successResponse = buildDeleteSuccessResponseFromDeleteResult(
      `Offering image junction (ID: ${id}) deleted successfully.`,
      deleteResult,
      cascade || forceCascade
    )
    return successResponse;

  } catch (err) {
    if (err instanceof DeleteCascadeBlockedError) {
      await rollbackTransaction(transaction); 
      const conflictResponse = buildDeleteConflictResponseFromError(`Cannot delete offering image: It has dependencies that prevent deletion.`, err);
      return conflictResponse;
    }
    else {
      await rollbackTransaction(transaction);
      return buildUnexpectedError(err);
    }
  }
}

// OLD -----------------------------------------------------------------------------------------------------------------------

//     try {
//       // === CHECK DEPENDENCIES =====================================================================

//       const { hard, soft } = await checkOfferingImageDependencies(id, transaction);
//       log.info(`[${operationId}] Offering image has dependent objects:`, { hard, soft });

//       let cascade_available = true;
//       if (hard.length > 0) {
//         cascade_available = false;
//       }

//       // If we have soft dependencies without cascade
//       // or we have hard dependencies without forceCascade => Return error code.
//       if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
//         await rollbackTransaction(transaction);
//         const conflictResponse: DeleteConflictResponse<string[]> = {
//           success: false,
//           message: "Cannot delete offering image: It has dependencies that prevent deletion.",
//           status_code: 409,
//           error_code: "DEPENDENCY_CONFLICT",
//           dependencies: { hard, soft },
//           cascade_available,
//           meta: { timestamp: new Date().toISOString() },
//         };
//         log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies: { hard, soft } });
//         return json(conflictResponse, { status: 409 });
//       }

//       // === DELETE =================================================================================

//       const deletedJunction = await deleteOfferingImage(transaction, id, cascade || forceCascade, forceCascade);
//       await transaction.commit();
//       log.info(`[${operationId}] Transaction committed.`);

//       // === RETURN RESPONSE ========================================================================

//       const response: DeleteSuccessResponse<OfferingImageJunction> = {
//         success: true,
//         message: `Offering image junction (ID: ${id}) deleted successfully.`,
//         data: {
//           deleted_resource: deletedJunction,
//           cascade_performed: cascade || forceCascade,
//           dependencies_cleared: hard.length + soft.length,
//         },
//         meta: { timestamp: new Date().toISOString() },
//       };
//       log.info(`[${operationId}] FN_SUCCESS: Offering image junction deleted.`, { responseData: response.data });
//       return json(response);
//     } catch (err) {
//       await rollbackTransaction(transaction);
//       log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
//       throw err; // Re-throw to be caught by the outer catch block
//     }
//   } catch (err: unknown) {
//     if ((err as { status?: number })?.status === 404) {
//       throw err;
//     }
//     return buildUnexpectedError(err, info);
//   }
// };
