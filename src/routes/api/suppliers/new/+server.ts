// src/routes/api/suppliers/new/+server.ts

/**
 * @file Create Supplier API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/suppliers/new - Handles the creation of a new wholesaler record.
 * It performs server-side validation and returns the newly created entity.
 */

import { type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { WholesalerForCreateSchema, type Wholesaler } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import { buildUnexpectedError, validateAndInsertEntity } from "$lib/backendQueries/entityOperations";

/**
 * POST /api/suppliers/new
 * @description Creates a new supplier.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/suppliers/new - ${operationId}`;
  log.infoHeader(info);

  try {
    // 1. Expect the request body to be the new supplier data.
    const requestData = (await request.json()) as Partial<Omit<Wholesaler, "wholesaler_id">>;
    log.info(`[${operationId}] Parsed request body`, { requestData });
    return validateAndInsertEntity(WholesalerForCreateSchema, requestData, "supplier");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};
