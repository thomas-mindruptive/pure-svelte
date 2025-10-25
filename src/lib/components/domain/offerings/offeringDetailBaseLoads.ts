// src/lib/pages/offerings/offeringDetailBasisLoads.ts

/**
 * Load the base data for offering detail pages.
 */

import { ApiClient } from "$lib/api/client/ApiClient";
import { getCategoryApi } from "$lib/api/client/category";
import { getFormApi } from "$lib/api/client/form";
import { getMaterialApi } from "$lib/api/client/material";
import { getOfferingApi } from "$lib/api/client/offering";
import { type Form, type Material, type ProductDefinition, type Wholesaler } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { parseUrlPathSegments } from "$lib/utils/url";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync } from "./offeringDetail.types";
import { getConstructionTypeApi } from "$lib/api/client/constructionType";
import { getSurfaceFinishApi } from "$lib/api/client/surfaceFinish";

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
  const materialApi = getMaterialApi(client);
  const formApi = getFormApi(client);
  const constructionTypeApi = getConstructionTypeApi(client);
  const surfaceFinishesApi = getSurfaceFinishApi(client);

  // --- MODE and ROUTE CONTEXT and VALIDATION ----------------------------------------------------

  let isCreateMode = false;
  let isSuppliersRoute = false;
  let isCategoriesRoute = false;

  const urlSegments = parseUrlPathSegments(url);

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
  let materials = (async () => [] as Material[])();
  let forms = (async () => [] as Form[])()

  if (isSuppliersRoute) {
    //  Load all product defs for category because multiple offerings for same product def may exist, e.g. with different sizes.
    availableProducts = categoryApi.loadProductDefsForCategory(categoryId);
  } else {
    //  Load suppliers with the CORRECT category asigned.
    // Note: Multiple offerings for the same supplier may exist, e.g. with different size.
    availableSuppliers = categoryApi.loadSuppliersForCategory(categoryId);
  }

  materials = materialApi.loadMaterials();
  forms = formApi.loadForms();
  const constructionTypes = constructionTypeApi.loadConstructionTypes();
  const surfaceFinishes = surfaceFinishesApi.loadSurfaceFinishes();

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
      materials,
      forms,
      constructionTypes,
      surfaceFinishes
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE -----

    // ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    // This is the svelte kit way to prevent unhandled promise rejections during SSR.
    // => The data of promises is streamed to the client through an open IP-connection.
    // => Client does not need to call an API after hydration.
    // => Faster than client api call. => better SEO.
    //
    // TODO: Change 
    // a) to component based loading or 
    // b) "pure" svelte kit way: promise must not fail, but return a composite object like 
    //    {result: offering | null, error: ....} 
    //
    const offeringPromise = offeringApi.loadOffering(offeringId!).catch((err) => {
      // Wenn der ApiClient einen SvelteKit-`error` wirft, ist `err` eine `Response`-Instanz.
      // Wir loggen es und werfen es erneut, damit SvelteKit seine Fehlerseite anzeigen kann.
      log.error(`SSR Load failed, re-throwing SvelteKit error for page display.`, err);
      return { offering: null, error: err };
      // DO NOT: throw err; 
    });
    // ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

    log.info(`Kicking off promises for EDIT mode: offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);
    const asyncLoadData: OfferingDetail_LoadDataAsync = {
      urlPathName: url.pathname,
      supplierId,
      categoryId,
      productDefId,
      offering: offeringPromise as any,
      isCreateMode,
      isSuppliersRoute,
      isCategoriesRoute,
      availableProducts,
      availableSuppliers,
      materials,
      forms,
      constructionTypes,
      surfaceFinishes
    };
    log.info(`(OfferDetailLinksPage) Kicked off loading promises offeringId: ${offeringId}`);
    return asyncLoadData;
  }
}
