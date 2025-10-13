// src/lib/pages/suppliers/supplierDetailPage.ts

import { supplierHierarchyConfig } from "$lib/routes/navHierarchyConfig";
import { log } from "$lib/utils/logger";
import { parseUrlPathSegments } from "$lib/utils/url";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { ChildRelationships, SupplierDetailPageProps } from "./SupplierDetailPage.svelte";

// ===== LOAD =====================================================================================

/**
 * Loads all data for the Supplier Detail Page using the non-blocking "app shell" pattern.
 * This function returns immediately with an object of promises.
 * The corresponding Svelte component is responsible for resolving these promises.
 *
 * @param params Contains the supplierId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load(loadEvent: LoadEvent): SupplierDetailPageProps {
  log.debug(`load: `, loadEvent);

  // ===== SETUP ==================================================================================

  const { params, fetch: loadEventFetch, url } = loadEvent;

  const supplierId = Number(params.supplierId);

  if (isNaN(supplierId) && params.supplierId?.toLowerCase() !== "new") {
    // This error is thrown immediately as it's a client-side validation error.
    throw error(400, "Invalid Supplier ID");
  }

  const isCreateMode = "new" === params.supplierId?.toLowerCase();

  // ===== EXTRACT CHILD PATH  ====================================================================

  // Extract child path from URL
  const urlSegments = parseUrlPathSegments(url);
  // ['suppliers', '1', 'orders'] → take index 2
  const supplierNode = supplierHierarchyConfig.rootItem.children?.[0];
  const defaultChild = supplierNode?.defaultChild;
  if (!defaultChild) {
    throw error(500, `No default child defined for ${JSON.stringify(supplierNode)}`);
  }

  const activeChildPath: ChildRelationships = (urlSegments[2] as ChildRelationships) || defaultChild;
  log.debug(`Extracted child path:`, {activeChildPath, urlSegments});


  // ===== RETURN PAGE DATA =======================================================================

  return {
    isCreateMode,
    loadEventFetch,
    supplierId, 
    activeChildPath, 
    params
  }
}
