// src/lib/pages/offerings/offeringDetailBasisLoads.ts

/**
 * Load the base data for offering detail pages.
 */

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync } from "./offeringDetail.types";
import { getSupplierApi } from "$lib/api/client/supplier";
import { type ProductDefinition, type Wholesaler } from "$lib/domain/domainTypes";
import { getCategoryApi } from "$lib/api/client/category";

/**
 * Load the basis data for offering detail pages.
 */
export function loadOfferingDetailBasisData({
  params,
  fetch: fetchLoad,
}: Pick<LoadEvent, "params" | "fetch">): OfferingDetail_LoadDataAsync {
  log.info("(OfferDetailLinksPage) load called with params:", params);

  const offeringId = Number(params.offeringId);
  const categoryId = Number(params.categoryId);
  const supplierId = Number(params.supplierId);
  const productDefId = Number(params.productDefId);

  // ------------------------------------------------------
  // ⚠️ There is not try/catch because we return promises!
  // ------------------------------------------------------

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);
  const supplierApi = getSupplierApi(client);
  const categoryApi = getCategoryApi(client);

  // --- MODE and ROUTE CONTEXT and VALIDATION ----------------------------------------------------

  let isCreateMode = false;
  let isSuppliersRoute = false;
  let isCategoriesRoute = false;

  if (isNaN(offeringId)) {
    isCreateMode = true;
    if (params.offeringId?.toLowerCase() !== "new") {
      throw error(422, 'OfferingDetailLinksPage.load: Invalid Offering ID: Must be number or "new"');
    }
  }
  if (isNaN(supplierId)) {
    isCategoriesRoute = true;
    if (isNaN(productDefId)) {
      throw error(422, "OfferingDetailLinksPage.load: Either supplierID or productDefId must be defined.");
    }
  }
  if (isNaN(productDefId)) {
    isSuppliersRoute = true;
    if (isNaN(supplierId)) {
      throw error(422, "OfferingDetailLinksPage.load: Either supplierID or productDefId must be defined.");
    }
  }

  // --- CREATE LOAD PROMISES through API clients -------------------------------------------------

  let availableProducts = (async () => [] as ProductDefinition[])();
  let availableSuppliers = (async () => [] as Wholesaler[])();

  if (isSuppliersRoute) {
    //  Load all product defs for category because multiple offerings for same product def may exist, e.g. with different sizes.
    availableProducts = categoryApi.loadProductDefsForCategory(categoryId);
  } else {
    //  Load suppliers because multiple offerings for the same supplier may exist, e.g. with different size
    availableSuppliers = supplierApi.loadSuppliers();
  }

  // --- RETURN LOADDATA --------------------------------------------------------------------------

  if (isCreateMode) {
    // --- CREATE MODE -----
    log.info(`Kicking off promises for CREATE mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
    const asyncLoadData: OfferingDetail_LoadDataAsync = {
      supplierId,
      categoryId,
      offering: Promise.resolve(null), // No initial offering to edit
      isCreateMode,
      isSuppliersRoute,
      isCategoriesRoute,
      availableProducts,
      availableSuppliers,
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE -----
    log.info(`Kicking off promises for EDIT mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
    const asyncLoadData: OfferingDetail_LoadDataAsync = {
      supplierId,
      categoryId,
      offering: offeringApi.loadOffering(offeringId),
      isCreateMode,
      isSuppliersRoute,
      isCategoriesRoute,
      availableProducts,
      availableSuppliers,
    };
    log.info(`(OfferDetailLinksPage) Kicked off loading promises offeringId: ${offeringId}`);
    return asyncLoadData;
  }
}
