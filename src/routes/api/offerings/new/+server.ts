// src/routes/api/offerings/new/+server.ts

import { type RequestHandler } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";
import { buildUnexpectedError, validateAndInsertEntity } from "$lib/backendQueries/genericEntityOperations";
import { WholesalerItemOfferingForCreateSchema } from "$lib/domain/domainTypes";
import { validateOfferingConstraints } from "$lib/backendQueries/validations/valOffering";
import { v4 as uuidv4 } from "uuid";

/**
 * @description Creates a new offering.
 * Foreign key constraints in the database ensure referential integrity:
 * - wholesaler_id, category_id, product_def_id must exist
 *
 * NOTE: wholesaler_categories assignment NO LONGER required
 * Suppliers can now create offerings for ANY category.
 *
 * Business rule validation:
 * - Offerings cannot override material/form/surface/construction fields
 *   if they are already set in the parent Product Definition
 * - UNLESS override_material=true (for material_id only)
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/new - ${operationId}`;
  log.infoHeader(info);

  try {
    const requestData = await request.json();
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(requestData) });

    return validateAndInsertEntity(
      WholesalerItemOfferingForCreateSchema,
      requestData,
      "offering",
      validateOfferingConstraints
    );
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};
