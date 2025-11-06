// src/routes/api/offerings/[id]/+server.ts

/**
 * @file Individual Offering API Endpoint
 * @description Provides GET operation for a single, detailed offering record.
 */

import type { ApiSuccessResponse, DeleteConflictResponse, DeleteRequest } from "$lib/api/api.types";
import { db } from "$lib/backendQueries/db";
import { buildUnexpectedError, validateAndUpdateEntity, validateIdUrlParam } from "$lib/backendQueries/genericEntityOperations";
import {
  Wio_Schema,
  type WholesalerItemOffering,
  type Wio_PDef_Cat_Supp_Nested_WithLinks
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";

// Type alias for offering with links
import type { DeleteOfferingSuccessResponse } from "$lib/api/app/appSpecificTypes";
import { deleteOffering } from "$lib/backendQueries/cascadingDeleteOperations";
import { checkOfferingDependencies } from "$lib/backendQueries/dependencyChecks";
import { loadNestedOfferingWithJoinsAndLinksForId } from "$lib/backendQueries/entityOperations/offering";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import { validateOfferingConstraints } from "$lib/backendQueries/validations/valOffering";

/**
 * GET /api/offerings/[id]
 * @description Retrieves a single, detailed offering record including product and category names.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/offerings/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] GET /offerings/${params.id}: FN_START`);

  const transaction = db.transaction();

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    // Start transaction
    await transaction.begin();
    log.info(`[${operationId}] Transaction started for offering retrieval.`);

    try {
      const offeringsArray = await loadNestedOfferingWithJoinsAndLinksForId(transaction, id);

      if (!offeringsArray || offeringsArray.length === 0) {
        await rollbackTransaction(transaction);
        throw error(404, `Offering with ID ${id} not found.`);
      }

      const nestedOfferingWithLinks = offeringsArray[0];
      const offering = nestedOfferingWithLinks;

      // // TODO: all GET <path>/id endpoints should validate retrieved record.
      // const validation = validateEntityBySchema(Wio_PDef_Cat_Supp_Nested_WithLinks_Schema, nestedOfferingWithLinks);
      // const debugError = false; // ONLY FOR DEBUG!
      // if (!validation.isValid || debugError) {
      //   await rollbackTransaction(transaction);
      //   const errRes: ApiErrorResponse = {
      //     success: false,
      //     message: "Data validation failed for retrieved offering record.",
      //     status_code: 500,
      //     error_code: "INTERNAL_SERVER_ERROR",
      //     errors: validation.errors,
      //     meta: { timestamp: new Date().toISOString() },
      //   };
      //   log.error(`[${operationId}] FN_FAILURE: Database record validation failed.`, { errors: validation.errors });
      //   return json(errRes, { status: 500 });
      // }

      // const offering = validation.sanitized as Wio_PDef_Cat_Supp_Nested_WithLinks;

      // Commit transaction
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed successfully.`);

      // The response now correctly wraps the data in an 'offering' property.
      const response: ApiSuccessResponse<{ offering: Wio_PDef_Cat_Supp_Nested_WithLinks }> = {
        success: true,
        message: "Offering retrieved successfully.",
        data: { offering },
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: Returning detailed offering data with links and shop_offering.`);
      return json(response);
    } catch (err) {
      await rollbackTransaction(transaction);
      log.error(`[${operationId}] Transaction failed, rolling back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err; // Re-throw SvelteKit's 404 error
    }
    return buildUnexpectedError(err, info);
  }
};

/**
 * PUT /api/offerings/[id]
 * @description Dynamically updates an existing offering based on provided fields.
 *
 * Business rule validation:
 * - Offerings cannot override material/form/surface/construction fields
 *   if they are already set in the parent Product Definition
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `PUT /api/offerings/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] PUT /offerings/${params.id}: FN_START`);

  try {
    const { id: offering_id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    return validateAndUpdateEntity(
      Wio_Schema,
      offering_id,
      "offering_id",
      requestData,
      "offering",
      validateOfferingConstraints
    );
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * DELETE /api/offerings/[id]
 * @description Deletes an offering master data record, strictly following the established
 * architectural pattern for dependency checking and cascading.
 */
export const DELETE: RequestHandler = async ({ params, request }): Promise<Response> => {
  const operationId = uuidv4();
  const info = `DELETE /api/offerings/${params.id} - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] DELETE /offerings/${params.id}: FN_START`);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const body: DeleteRequest<WholesalerItemOffering> = await request.json();
    const cascade = body.cascade || false;
    const forceCascade = body.forceCascade || false;
    log.debug(`[${operationId}] Parsed request body`, { id, cascade, forceCascade });

    const transaction = db.transaction();
    await transaction.begin();
    log.info(`[${operationId}] Transaction started for offering deletion.`);

    try {
      // === CHECK DEPENDENCIES =====================================================================

      const { hard, soft } = await checkOfferingDependencies(id, transaction);
      log.info(`Offering has dependent objects:`, { hard, soft });

      if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
        await rollbackTransaction(transaction);
        const conflictResponse: DeleteConflictResponse<string[]> = {
          success: false,
          message: "Cannot delete offering: It is still in use by other entities.",
          status_code: 409,
          error_code: "DEPENDENCY_CONFLICT",
          dependencies: { hard, soft },
          cascade_available: hard.length === 0,
          meta: { timestamp: new Date().toISOString() },
        };
        log.warn(`[${operationId}] FN_FAILURE: Deletion blocked by dependencies.`, { dependencies: { hard, soft } });
        return json(conflictResponse, { status: 409 });
      }

      // === DELETE =================================================================================

      const deletedInfo = await deleteOffering(id, cascade || forceCascade, transaction);
      await transaction.commit();
      log.info(`[${operationId}] Transaction committed.`);

      // === RETURN RESPONSE ========================================================================

      const response: DeleteOfferingSuccessResponse = {
        success: true,
        message: `Offering (ID: ${deletedInfo.deleted.offering_id}) deleted successfully.`,
        data: {
          deleted_resource: deletedInfo.deleted,
          cascade_performed: cascade || forceCascade,
          dependencies_cleared: deletedInfo.stats.total,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      log.info(`[${operationId}] FN_SUCCESS: Offering deleted.`, { responseData: response.data });
      return json(response);
    } catch (err) {
      await rollbackTransaction(transaction);
      log.error(`[${operationId}] FN_EXCEPTION: Transaction failed, rolling back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
