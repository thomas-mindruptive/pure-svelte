// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetailLinks_LoadDataAsync } from "./offeringDetail.types";
import { getSupplierApi } from "$lib/api/client/supplier";

/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  log.info("(OfferDetailLinksPage) load called with params:", params);

  const offeringId = Number(params.offeringId);
  const categoryId = Number(params.categoryId);
  const supplierId = Number(params.supplierId);

  // ⚠️ There is not try/catch because we return promises!

  if (isNaN(offeringId) && params.offeringId?.toLowerCase() !== "new") {
    throw error(400, 'OfferingDetailLinksPage.load: Invalid Offering ID: Must be number or "new"');
  }
  if (isNaN(categoryId)) {
    throw error(400, "OfferingDetailLinksPage.load: Invalid Category ID");
  }
  if (isNaN(supplierId)) {
    throw error(400, "OfferingDetailLinksPage.load: Invalid Supplier ID");
  }

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);
  const supplierApi = getSupplierApi(client);

  // EDIT MODE
  if (offeringId) {
    log.info(`Kicking off promises for EDIT mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      supplierId, // Always pass from the params.
      categoryId, // Always pass from the params.
      offering: offeringApi.loadOffering(offeringId),
      links: offeringApi.loadOfferingLinks(offeringId),
      availableProducts: Promise.resolve([]),
      availableSuppliers: Promise.resolve([]),
    };
    log.info(`(OfferDetailLinksPage) Kicked off loading promises offeringId: ${offeringId}`);
    return asyncLoadData;
  } else {
    log.info(`Kicking off promises for CREATE mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
    // CREATE MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      supplierId, // Always pass from the params.
      categoryId, // Always pass from the params.
      offering: Promise.resolve(null), // No initial offering to edit
      links: Promise.resolve([]),

      // TODO:
      //   Replace old algorithm which was an "anti-join":
      //     API only loads those product definitions that are available for the selected category and supplier
      //     and have NOT YET been assigned to supplier.
      //  New: load all product defs because multiple assignments may exist, e.g. with different sizes.

      availableProducts: offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId),

      // Same as for product defs: Load all suppliers because multiple assignments may exist.
      availableSuppliers: supplierApi.loadSuppliers(),
    };

    return asyncLoadData;
  }
}
