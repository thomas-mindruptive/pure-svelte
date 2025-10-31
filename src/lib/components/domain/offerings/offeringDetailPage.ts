// src/lib/components/domain/offerings/offeringDetailPage.ts

import { supplierHierarchyConfig, productCategoriesHierarchyConfig } from "$lib/routes/navHierarchyConfig";
import { log } from "$lib/utils/logger";
import { parseUrlPathSegments } from "$lib/utils/url";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { OfferingChildRelationships, OfferingDetailPageProps } from "./OfferingDetailPage.svelte";

/**
 * Loads all data for the Offering Detail Page using the non-blocking "app shell" pattern.
 * This function returns immediately with props including activeChildPath.
 * The corresponding Svelte component is responsible for loading data based on activeChildPath.
 *
 * @param params Contains the offeringId and route context from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object with props including activeChildPath for conditional rendering.
 */
export function load(loadEvent: LoadEvent): OfferingDetailPageProps {
  log.debug(`offeringDetailPage load:`, loadEvent);

  // ===== SETUP ==================================================================================

  const { params, fetch: loadEventFetch, url } = loadEvent;

  const offeringId = Number(params.offeringId);

  if (isNaN(offeringId) && params.offeringId?.toLowerCase() !== "new") {
    throw error(400, "Invalid Offering ID");
  }

  const isCreateMode = "new" === params.offeringId?.toLowerCase();

  // ===== DETECT ROUTE TYPE ======================================================================

  // Determine if we're in suppliers or categories route
  const isSuppliersRoute = url.pathname.includes("/suppliers/");
  const isCategoriesRoute = url.pathname.includes("/categories/");

  if (!isSuppliersRoute && !isCategoriesRoute) {
    throw error(500, "Invalid route: Must be suppliers or categories route");
  }

  // ===== EXTRACT CHILD PATH  ====================================================================

  // Extract child path from URL
  const urlSegments = parseUrlPathSegments(url);
  log.debug(`URL segments:`, urlSegments);

  // Get offering node from the appropriate hierarchy config
  const hierarchyConfig = isSuppliersRoute ? supplierHierarchyConfig : productCategoriesHierarchyConfig;

  // Navigate to offering node:
  // Suppliers: rootItem → supplier (children[0]) → categories (children[0]) → category (children[0]) → offerings (children[0]) → offering (children[0])
  // Categories: rootItem → category (children[0]) → productdefinitions (children[0]) → productDefinition (children[0]) → offerings (children[1]) → offering (children[0])

  let offeringNode;
  if (isSuppliersRoute) {
    // suppliers → supplier → categories → category → offerings → offering
    offeringNode = hierarchyConfig.rootItem.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0];
  } else {
    // categories → category → productdefinitions → productDefinition → offerings → offering
    offeringNode = hierarchyConfig.rootItem.children?.[0]?.children?.[0]?.children?.[0]?.children?.[1]?.children?.[0];
  }

  const defaultChild = offeringNode?.defaultChild;
  if (!defaultChild) {
    throw error(500, `No default child defined for offering node: ${JSON.stringify(offeringNode)}`);
  }

  // For suppliers route: ['suppliers', '1', 'categories', '2', 'offerings', '3', 'attributes']
  // For categories route: ['categories', '1', 'productdefinitions', '2', 'offerings', '3', 'links']
  // We want the segment AFTER 'offerings' and offeringId
  const offeringsIndex = urlSegments.indexOf("offerings");
  const activeChildPath: OfferingChildRelationships =
    (urlSegments[offeringsIndex + 2] as OfferingChildRelationships) || defaultChild;

  log.debug(`Extracted child path:`, { activeChildPath, urlSegments, offeringsIndex });

  // ===== EXTRACT ROUTE PARAMS  ==================================================================

  const supplierId = params.supplierId ? Number(params.supplierId) : undefined;
  const categoryId = Number(params.categoryId);
  const productDefId = params.productDefId ? Number(params.productDefId) : undefined;

  // ===== RETURN PAGE DATA =======================================================================

  return {
    isCreateMode,
    loadEventFetch,
    offeringId,
    activeChildPath,
    isSuppliersRoute,
    isCategoriesRoute,
    supplierId: supplierId ?? undefined,
    categoryId,
    productDefId: productDefId ?? undefined,
    params,
    urlPathName: url.pathname,
  };
}
