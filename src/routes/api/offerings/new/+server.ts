// src/routes/api/offerings/new/+server.ts

/**
 * @file Offerings List API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/offerings - Provides type-safe, paginated, and filterable
 * access to the wholesaler_item_offerings list. It strictly follows the "Secure Entity Endpoint"
 * pattern by enforcing the database table name on the server.
 */

import { type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateAndInsertEntity } from "$lib/backendQueries/entityOperations";
import { WholesalerItemOfferingForCreateSchema } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";

/**
 * @description Creates a new offering.
 * Foreign key constraints in the database ensure referential integrity:
 * - wholesaler_id, category_id, product_def_id must exist
 * - wholesaler_categories assignment is enforced by FK
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/new - ${operationId}`;
  log.infoHeader(info);

  try {
    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    return validateAndInsertEntity(WholesalerItemOfferingForCreateSchema, requestData, "offering");
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};
