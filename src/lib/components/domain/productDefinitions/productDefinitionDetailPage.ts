// File: src/lib/components/domain/productDefinitions/productDefinitionDetailPage.ts

import { findNodeByKeyRecursive } from "$lib/components/sidebarAndNav/hierarchyUtils";
import { productCategoriesHierarchyConfig } from "$lib/routes/navHierarchyConfig";
import { log } from "$lib/utils/logger";
import { parseUrlPathSegments } from "$lib/utils/url";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { ProductDefChildRelationships, ProductDefPageProps } from "./ProductDefinitionDetailPage.svelte";

/**
 * Loads all data for the Product Definition Detail Page using the non-blocking "app shell" pattern.
 * It returns an object of promises that the Svelte component will resolve.
 *
 * @param params Contains the productDefId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ params, url, fetch: loadEventFetch }: LoadEvent): ProductDefPageProps {
  log.debug(`load`, { params });

  const productDefId = Number(params.productDefId);
  const categoryId = Number(params.categoryId);

  const isCreateMode = params.productDefId?.toLowerCase() === "new";

  if (! isCreateMode && (isNaN(productDefId) || productDefId <= 0)) {
    throw error(400, "productDefintionDetailPage::load: Invalid Product Definition ID. Must be a positive number.");
  }
  // We must always come from a path like /.../categories/[categoryId]
  if (isNaN(categoryId) || !params.categoryId) {
    throw error(400, "categoryId must be passed in params.");
  }

    // ===== EXTRACT CHILD PATH  ====================================================================
  
    // Extract child path from URL
    const urlSegments = parseUrlPathSegments(url);
    // ['categories', 1, 'productdefinitions', '1', 'offerings'] → take index 4
    const prodDefNode = findNodeByKeyRecursive(productCategoriesHierarchyConfig.rootItem, "productDefinition");
    if (!prodDefNode) {
      throw error(500, `Cannot find node for "productdefinitions" in productCategoriesHierarchyConfig.`);
    }
    const defaultChild = prodDefNode?.defaultChild;
    if (!defaultChild) {
      throw error(500, `No default child defined for "productDefinition"`);
    }
  
    const activeChildPath: ProductDefChildRelationships = (urlSegments[4] as ProductDefChildRelationships) || defaultChild;
    log.debug(`Extracted child path:`, {activeChildPath, urlSegments});
    
  return {
    categoryId,
    productDefId,
    isCreateMode,
    loadEventFetch,
    activeChildPath
  };
}
