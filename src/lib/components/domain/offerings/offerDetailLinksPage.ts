// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync, OfferingDetailLinks_LoadDataAsync } from "./offeringDetail.types";
import { loadOfferingDetailBasisData } from "./offeringDetailBasisLoads";

/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export function load({ params, fetch: fetchLoad }: LoadEvent): OfferingDetailLinks_LoadDataAsync {
 log.debug(`OfferingDetailLinksPage: load page-specific data`);

  // --- PARAMS ans basis data for all offering detail pages --------------------------------------

  const offeringId = Number(params.offeringId);
  const offeringDetailBasisData: OfferingDetail_LoadDataAsync = loadOfferingDetailBasisData({ params, fetch: fetchLoad });

  // --- LOAD SPECIFIC DATA -----------------------------------------------------------------------

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);

  if (offeringDetailBasisData.isCreateMode) {
    // --- CREATE MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      ...offeringDetailBasisData,
      links: Promise.resolve([]),
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      ...offeringDetailBasisData,
      links: offeringApi.loadOfferingLinks(offeringId),
    };
    return asyncLoadData;
  }

  // OLD -----------------------------------------------------------------------------------
  // const categoryId = Number(params.categoryId);
  // const supplierId = Number(params.supplierId);
  // const productDefId = Number(params.productDefId);

  // // ------------------------------------------------------
  // // ⚠️ There is not try/catch because we return promises!
  // // ------------------------------------------------------

  // const supplierApi = getSupplierApi(client);

  // if (isNaN(offeringId)) {
  //   isCreateMode = true;
  //   if (params.offeringId?.toLowerCase() !== "new") {
  //     throw error(422, 'OfferingDetailLinksPage.load: Invalid Offering ID: Must be number or "new"');
  //   }
  // }
  // if (isNaN(supplierId)) {
  //   isCategoriesRoute = true;
  //   if (isNaN(productDefId)) {
  //     throw error(422, "OfferingDetailLinksPage.load: Either supplierID or productDefId must be defined.");
  //   }
  // }
  // if (isNaN(productDefId)) {
  //   isSuppliersRoute = true;
  //   if (isNaN(supplierId)) {
  //     throw error(422, "OfferingDetailLinksPage.load: Either supplierID or productDefId must be defined.");
  //   }
  // }

  // // --- CREATE LOAD PROMISES through API clients -------------------------------------------------

  // if (isCreateMode) {
  //   // --- CREATE MODE -----
  //   log.info(`Kicking off promises for CREATE mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
  //   const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
  //     supplierId, // Always pass from the params.
  //     categoryId, // Always pass from the params.
  //     offering: Promise.resolve(null), // No initial offering to edit
  //     links: Promise.resolve([]),
  //     isCreateMode,
  //     isSuppliersRoute,
  //     isCategoriesRoute,

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
  // } else {
  //   // --- EDIT MODE -----
  //   log.info(`Kicking off promises for EDIT mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
  //   const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
  //     supplierId, // Always pass from the params.
  //     categoryId, // Always pass from the params.
  //     offering: offeringApi.loadOffering(offeringId),
  //     links: offeringApi.loadOfferingLinks(offeringId),
  //     isCreateMode,
  //     isSuppliersRoute,
  //     isCategoriesRoute,
  //     availableProducts: Promise.resolve([]),
  //     availableSuppliers: Promise.resolve([]),
  //   };
  //   log.info(`(OfferDetailLinksPage) Kicked off loading promises offeringId: ${offeringId}`);
  //   return asyncLoadData;
  // }
}
