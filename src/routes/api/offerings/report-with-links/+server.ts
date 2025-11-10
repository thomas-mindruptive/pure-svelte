// src/routes/api/offerings/report-with-links/+server.ts

/**
 * @file Offering Report with Links API Endpoint (uses view_offerings_pt_pc_pd + links)
 * @description Provides POST operation for querying the offering report view with all product/category/lookup data and offering links.
 */

import type { ApiSuccessResponse, QueryResponseData } from "$lib/api/api.types";
import { db } from "$lib/backendQueries/db";
import { loadOfferingsFromViewWithLinks } from "$lib/backendQueries/entityOperations/offering";
import { buildUnexpectedError } from "$lib/backendQueries/genericEntityOperations";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import type { OfferingReportView } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/offerings/report-with-links
 * @description Retrieves offerings from view_offerings_pt_pc_pd with links, using flexible filtering and sorting.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/report-with-links - ${operationId}`;
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
    log.info(`[${operationId}] Transaction started for view query with links.`);

    try {
      const t0 = Date.now();
      const offeringsArray = await loadOfferingsFromViewWithLinks(
        transaction,
        payload.where,
        payload.orderBy,
        payload.limit,
        payload.offset,
      );
      console.log(`[PERF] [${operationId}] View with links query took: ${Date.now() - t0}ms`);
      log.debug(`[${operationId}] Loaded ${offeringsArray.length} offerings from view with links.`);

      await transaction.commit();
      log.info(`[${operationId}] Transaction committed successfully.`);

      const responseData: QueryResponseData<any> = {
        results: offeringsArray,
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: offeringsArray.length,
          columns_selected: ["*"],
          has_joins: false, // View handles joins
          has_where: !!payload.where,
          parameter_count: 0,
          table_fixed: "view_offerings_pt_pc_pd + links",
          sql_generated: "view query with links",
        },
      };

      const response: ApiSuccessResponse<QueryResponseData<any>> = {
        success: true,
        message: "Offering report data with links retrieved successfully.",
        data: responseData,
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: Returning ${offeringsArray.length} offerings with links from view.`);
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
