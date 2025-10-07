// File: src/lib/components/domain/productDefinitions/productDefinitionDetailPage.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { ProductDefPageProps } from "./ProductDefinitionDetailPage.svelte";

/**
 * Loads all data for the Product Definition Detail Page using the non-blocking "app shell" pattern.
 * It returns an object of promises that the Svelte component will resolve.
 *
 * @param params Contains the productDefId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent): ProductDefPageProps {
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

  return {
    categoryId,
    productDefId,
    isCreateMode,
    loadEventFetch,
  };
}
