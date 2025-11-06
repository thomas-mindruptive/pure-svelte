// src/routes/api/offerings/nested/+server.ts

/**
 * @file Nested Offerings Query API Endpoint
 * @description Provides POST operation for flexible querying of nested offerings with joins and links.
 */

import type { ApiErrorResponse, ApiSuccessResponse, QueryResponseData } from "$lib/api/api.types";
import { db } from "$lib/backendQueries/db";
import { buildUnexpectedError } from "$lib/backendQueries/genericEntityOperations";
import { loadNestedOfferingsOptimized } from "$lib/backendQueries/entityOperations/offering";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import {
  Wio_PDef_Cat_Supp_Nested_WithLinks_Schema,
  type WholesalerItemOffering,
  type Wio_PDef_Cat_Supp_Nested_WithLinks,
} from "$lib/domain/domainTypes";
import { validateEntityBySchema } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import { json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";

/**
 * POST /api/offerings/nested
 * @description Retrieves offerings with nested structure (product_def, category, wholesaler, links as objects)
 * based on flexible WHERE, ORDER BY, LIMIT, and OFFSET criteria.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/nested - ${operationId}`;
  log.infoHeader(info);
  log.info(`[${operationId}] POST /offerings/nested: FN_START`);

  const transaction = db.transaction();

  try {
    const payload: QueryPayload<WholesalerItemOffering> = await request.json();
    log.info(`[${operationId}] Parsed request payload`, {
      hasWhere: !!payload.where,
      hasOrderBy: !!payload.orderBy,
      limit: payload.limit,
      offset: payload.offset,
    });

    // Start transaction
    const tBegin = Date.now();
    await transaction.begin();
    console.log(`[PERF] [${operationId}] Transaction.begin() took: ${Date.now() - tBegin}ms`);
    log.info(`[${operationId}] Transaction started for nested offerings query.`);

    try {
      const t0 = Date.now();
      const offeringsArray = await loadNestedOfferingsOptimized(
        transaction,
        payload.where,
        payload.orderBy,
        payload.limit,
        payload.offset,
      );
      console.log(`[PERF] [${operationId}] SQL query took: ${Date.now() - t0}ms`);
      log.debug(`[${operationId}] Loaded ${offeringsArray.length} offerings directly as objects.`);

      // Log first offering for debugging
      if (offeringsArray.length > 0) {
        log.debug(`[${operationId}] First offering structure:`, {
          offering_id: offeringsArray[0].offering_id,
          product_def_type: typeof offeringsArray[0].product_def,
          category_type: typeof offeringsArray[0].category,
          wholesaler_type: typeof offeringsArray[0].wholesaler,
          links_type: typeof offeringsArray[0].links,
        });
      }

      // Validate each offering
      const t2 = Date.now();
      const validatedOfferings: Wio_PDef_Cat_Supp_Nested_WithLinks[] = [];
      const validationErrors: Array<{ index: number; errors: any }> = [];

      for (let i = 0; i < offeringsArray.length; i++) {
        const offering = offeringsArray[i];
        const validation = validateEntityBySchema(Wio_PDef_Cat_Supp_Nested_WithLinks_Schema, offering);

        if (!validation.isValid) {
          validationErrors.push({ index: i, errors: validation.errors });
        } else {
          validatedOfferings.push(validation.sanitized as Wio_PDef_Cat_Supp_Nested_WithLinks);
        }
      }
      console.log(`[PERF] [${operationId}] Validation took: ${Date.now() - t2}ms`);

      if (validationErrors.length > 0) {
        await rollbackTransaction(transaction);
        const errRes: ApiErrorResponse = {
          success: false,
          message: "Data validation failed for one or more offering records.",
          status_code: 500,
          error_code: "INTERNAL_SERVER_ERROR",
          errors: validationErrors as any,
          meta: { timestamp: new Date().toISOString() },
        };
        log.error(`[${operationId}] FN_FAILURE: Database record validation failed.`, { validationErrors });
        return json(errRes, { status: 500 });
      }

      // Commit transaction
      const tCommit = Date.now();
      await transaction.commit();
      console.log(`[PERF] [${operationId}] Transaction.commit() took: ${Date.now() - tCommit}ms`);
      log.info(`[${operationId}] Transaction committed successfully.`);

      const responseData: QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
        results: validatedOfferings as any,
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: validatedOfferings.length,
          columns_selected: ["*"],
          has_joins: true,
          has_where: !!payload.where,
          parameter_count: 0,
          table_fixed: "wholesaler_item_offerings",
          sql_generated: "nested JSON query",
        },
      };

      const response: ApiSuccessResponse<QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks>> = {
        success: true,
        message: "Nested offerings retrieved successfully.",
        data: responseData,
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: Returning ${validatedOfferings.length} nested offerings.`);
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
