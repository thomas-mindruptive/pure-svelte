// src/lib/pages/suppliers/supplierDetailPage.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import { getSupplierApi } from "$lib/api/client/supplier";
import { ApiClient } from "$lib/api/client/ApiClient";
import type { ChildRelationships, SupplierDetailPage_LoadDataAsync } from "./supplierDetailPage.types";
import { parseUrlSegments } from "$lib/utils/url";
import { supplierHierarchyConfig } from "$lib/routes/navHierarchyConfig";

/**
 * Loads all data for the Supplier Detail Page using the non-blocking "app shell" pattern.
 * This function returns immediately with an object of promises.
 * The corresponding Svelte component is responsible for resolving these promises.
 *
 * @param params Contains the supplierId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load(loadEvent: LoadEvent): SupplierDetailPage_LoadDataAsync {
  log.debug(`load: `, loadEvent);

  // ===== SETUP ==================================================================================

  const { params, fetch: loadEventFetch, url } = loadEvent;

  const supplierId = Number(params.supplierId);

  if (isNaN(supplierId) && params.supplierId?.toLowerCase() !== "new") {
    // This error is thrown immediately as it's a client-side validation error.
    throw error(400, "Invalid Supplier ID");
  }

  // ===== EXTRACT CHILD PATH  ====================================================================

  // Extract child path from URL
  const urlSegments = parseUrlSegments(url);
  // ['suppliers', '1', 'orders'] → take index 2
  const supplierNode = supplierHierarchyConfig.rootItem.children?.[0];
  const defaultChild = supplierNode?.defaultChild;
  if (!defaultChild) {
    throw error(500, `No default child defined for ${JSON.stringify(supplierNode)}`);
  }

  const activeChildPath: ChildRelationships = (urlSegments[2] as ChildRelationships) || defaultChild;

  // ===== API ====================================================================================

  log.info(`Kicking off non-blocking load for supplierId: ${supplierId}`);

  // Create an ApiClient instance with the context-aware `fetch`.
  const client = new ApiClient(loadEventFetch);

  // Get the supplier-specific API methods from the factory.
  const supplierApi = getSupplierApi(client);

  // ===== RETURN PAGE DATA =======================================================================

  // ⚠️ Return the promises directly without `await`.
  //    The page component will handle resolving and error states.

  // EDIT mode
  if (supplierId) {
    const loadDataAsync: SupplierDetailPage_LoadDataAsync = {
      supplier: supplierApi.loadSupplier(supplierId),
      assignedCategories: supplierApi.loadCategoriesForSupplier(supplierId),
      availableCategories: supplierApi.loadAvailableCategoriesForSupplier(supplierId),
      activeChildPath,
    };
    return loadDataAsync;
  }
  // CREATE mode
  else {
    const loadDataAsync: SupplierDetailPage_LoadDataAsync = {
      supplier: Promise.resolve(null),
      assignedCategories: Promise.resolve([]),
      availableCategories: Promise.resolve([]),
      activeChildPath,
    };
    return loadDataAsync;
  }
}
