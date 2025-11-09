// src/routes/api/offerings/report/+server.ts

/**
 * @file Offering Report API Endpoint (uses view_offerings_pt_pc_pd)
 * @description Provides POST operation for querying the offering report view with all product/category/lookup data.
 */

import type { ApiSuccessResponse, QueryResponseData } from "$lib/api/api.types";
import { db } from "$lib/backendQueries/db";
import { loadOfferingsFromView } from "$lib/backendQueries/entityOperations/offering";
import { buildUnexpectedError } from "$lib/backendQueries/genericEntityOperations";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import type { OfferingReportView } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/offerings/report
 * @description Retrieves offerings from view_offerings_pt_pc_pd with flexible filtering and sorting.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/report - ${operationId}`;
  log.infoHeader(info);

  const transaction = db.transaction();

  try {
    const payload: QueryPayload<OfferingReportView> = await request.json();
    log.info(`[${operationId}] Parsed request payload`, {
      hasWhere: !!payload.where,
      hasOrderBy: !!payload.orderBy,
      limit: payload.limit,
      offset: payload.offset,
    });

    await transaction.begin();
    log.info(`[${operationId}] Transaction started for view query.`);

    try {
      const t0 = Date.now();
      const offeringsArray = await loadOfferingsFromView(
        transaction,
        payload.where,
        payload.orderBy,
        payload.limit,
        payload.offset,
      );
      console.log(`[PERF] [${operationId}] View query took: ${Date.now() - t0}ms`);
      log.debug(`[${operationId}] Loaded ${offeringsArray.length} offerings from view.`);

      await transaction.commit();
      log.info(`[${operationId}] Transaction committed successfully.`);

      const responseData: QueryResponseData<OfferingReportView> = {
        results: offeringsArray as OfferingReportView[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: offeringsArray.length,
          columns_selected: ["*"],
          has_joins: false, // View handles joins
          has_where: !!payload.where,
          parameter_count: 0,
          table_fixed: "view_offerings_pt_pc_pd",
          sql_generated: "view query",
        },
      };

      const response: ApiSuccessResponse<QueryResponseData<OfferingReportView>> = {
        success: true,
        message: "Offering report data retrieved successfully.",
        data: responseData,
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: Returning ${offeringsArray.length} offerings from view.`);
      return json(response);
    } catch (err) {
      await rollbackTransaction(transaction);
      log.error(`[${operationId}] Transaction failed, rolling back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
