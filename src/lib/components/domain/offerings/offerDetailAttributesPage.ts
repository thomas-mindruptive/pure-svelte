// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync, OfferingDetailAttributes_LoadDataAsync } from "./offeringDetail.types";
import { loadOfferingDetailBasisData } from "./offeringDetailBasisLoads";

/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export function load({ params, fetch: fetchLoad }: LoadEvent): OfferingDetailAttributes_LoadDataAsync {
  log.debug(`OfferingDetailAttributesPage: load page-specific data`);

  // --- PARAMS ans basis data for all offering detail pages --------------------------------------

  const offeringId = Number(params.offeringId);
  const offeringDetailBasisData: OfferingDetail_LoadDataAsync = loadOfferingDetailBasisData({ params, fetch: fetchLoad });

  // --- LOAD SPECIFIC DATA -----------------------------------------------------------------------

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);

  if (offeringDetailBasisData.isCreateMode) {
    // --- CREATE MODE
    const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
      ...offeringDetailBasisData,
      assignedAttributes: offeringApi.loadOfferingAttributes(offeringId),
      availableAttributes: offeringApi.getAvailableAttributesForOffering(offeringId),
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE
    const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
      ...offeringDetailBasisData,
      availableAttributes: Promise.resolve([]),
      assignedAttributes: Promise.resolve([]),
    };
    return asyncLoadData;
  }

  // Old -------------------------------------------------------------------------------------------
  // const categoryId = Number(params.categoryId);
  // const supplierId = Number(params.supplierId);

  // // ⚠️ There is no try/catch because we return promises!

  // if (isNaN(offeringId) && params.offeringId?.toLowerCase() !== "new") {
  //   throw error(400, 'OfferDetailAttributesPage.load: Invalid Offering ID: Must be number or "new"');
  // }
  // if (isNaN(categoryId)) {
  //   throw error(400, "OfferDetailAttributesPage.load: Invalid Category ID");
  // }
  // if (isNaN(supplierId)) {
  //   throw error(400, "OfferDetailAttributesPage.load: Invalid Supplier ID");
  // }

  // // API
  // const client = new ApiClient(fetchLoad);
  // const offeringApi = getOfferingApi(client);
  // const supplierApi = getSupplierApi(client);

  // // EDIT MODE
  // if (offeringId) {
  //   log.info(`Kicking off promises for EDIT mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
  //   const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
  //     supplierId, // Always pass from the params.
  //     categoryId, // Always pass from the params.
  //     offering: offeringApi.loadOffering(offeringId),
  //     assignedAttributes: offeringApi.loadOfferingAttributes(offeringId),
  //     availableAttributes: offeringApi.getAvailableAttributesForOffering(offeringId),
  //     availableProducts: Promise.resolve([]),
  //     availableSuppliers: Promise.resolve([]),
  //   };
  //   return asyncLoadData;
  // }
  // // CREATE MODE
  // else {
  //   log.info(`Kicking off promises for CREATE mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
  //   const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
  //     supplierId, // Always pass from the params.
  //     categoryId, // Always pass from the params.
  //     offering: Promise.resolve(null), // Not initial offering to edit
  //     availableAttributes: Promise.resolve([]),
  //     assignedAttributes: Promise.resolve([]),

  //     // TODO:
  //     //   Replace old algorithm which was an "anti-join":
  //     //     API only loads those product definitions that are available for the selected category and supplier
  //     //     and have NOT YET been assigned to supplier.
  //     //  New: load all product defs because multiple assignments may exist, e.g. with different sizes.

  //     availableProducts: offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId),

  //     // Same as for product defs: Load all suppliers because multiple assignments may exist.
  //     availableSuppliers: supplierApi.loadSuppliers(),
  //   };

  //   return asyncLoadData;
  // }
}
