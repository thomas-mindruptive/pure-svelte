// src/lib/pages/offerings/offeringDetailBasisLoads.ts

/**
 * Load the base data for offering detail pages.
 */

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync } from "./offeringDetail.types";
import { type ProductDefinition, type Wholesaler } from "$lib/domain/domainTypes";
import { getCategoryApi } from "$lib/api/client/category";
import { parseUrlSegments } from "$lib/utils/url";

/**
 * Load the basis data for offering detail pages.
 */
export function loadOfferingDetailBasisData({
  url,
  params,
  fetch: fetchLoad,
}: Pick<LoadEvent, "url" | "params" | "fetch">): OfferingDetail_LoadDataAsync {
  log.info("Load called with params:", { url, params });

  let offeringId: number | null = Number(params.offeringId);
  let categoryId: number | null = Number(params.categoryId);
  let supplierId: number | null = Number(params.supplierId);
  let productDefId: number | null = Number(params.productDefId);

  // ------------------------------------------------------
  // ⚠️ There is not try/catch because we return promises!
  // ------------------------------------------------------

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);
  const categoryApi = getCategoryApi(client);

  // --- MODE and ROUTE CONTEXT and VALIDATION ----------------------------------------------------

  let isCreateMode = false;
  let isSuppliersRoute = false;
  let isCategoriesRoute = false;

  const urlSegments = parseUrlSegments(url);

  if (isNaN(offeringId)) {
    isCreateMode = true;
    offeringId = null;
    if (params.offeringId?.toLowerCase() !== "new") {
      throw error(422, 'offeringDetailBaseLoads.load: Invalid Offering ID: Must be number or "new"');
    }
  }

  if (isNaN(supplierId)) {
    supplierId = null;
  }
  if (isNaN(categoryId)) {
    categoryId = null;
  }
  if (isNaN(productDefId)) {
    productDefId = null;
  }

  if (urlSegments[0].toLowerCase() === "suppliers") {
    isSuppliersRoute = true;
    if (null === supplierId || isNaN(supplierId)) {
      throw error(422, "offeringDetailBaseLoads.load: supplierID must be defined for '/suppliers/...' route.");
    }
  } else if (urlSegments[0].toLowerCase() === "categories") {
    isCategoriesRoute = true;
    if (!productDefId) {
      throw error(422, "offeringDetailBaseLoads.load: productDefId must be defined for '/categories/...' route.");
    }
  } else {
    throw error(400, `url route must be "/suppliers..." or "/categories" but was "/${urlSegments[0]}"`);
  }

  if (!categoryId) {
    categoryId = null;
    throw error(422, "offeringDetailBaseLoads.load: categoryId must be defined.");
  }

  // --- CREATE LOAD PROMISES through API clients -------------------------------------------------

  let availableProducts = (async () => [] as ProductDefinition[])();
  let availableSuppliers = (async () => [] as Wholesaler[])();

  if (isSuppliersRoute) {
    //  Load all product defs for category because multiple offerings for same product def may exist, e.g. with different sizes.
    availableProducts = categoryApi.loadProductDefsForCategory(categoryId);
  } else {
    //  Load suppliers with the CORRECT category asigned.
    // Note: Multiple offerings for the same supplier may exist, e.g. with different size.
    availableSuppliers = categoryApi.loadSuppliersForCategory(categoryId);
  }

  // --- RETURN LOADDATA --------------------------------------------------------------------------

  if (isCreateMode) {
    // --- CREATE MODE -----
    log.info(`Kicking off promises for CREATE mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
    const asyncLoadData: OfferingDetail_LoadDataAsync = {
      urlPathName: url.pathname,
      supplierId,
      categoryId,
      productDefId,
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
      urlPathName: url.pathname,
      supplierId,
      categoryId,
      productDefId,
      offering: offeringApi.loadOffering(offeringId!), // We made sure above that we only enter "CREATE" mode, if offeringId is invalid.
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
