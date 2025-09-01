// src/routes/(browser)/+layout.ts

import { get } from 'svelte/store';
import { log } from '$lib/utils/logger';
import type { LoadEvent } from '@sveltejs/kit';
import { navigationState, type NavigationPath } from '$lib/stores/navigationState';
import { ApiClient } from '$lib/api/client/ApiClient';
import { getSupplierApi } from '$lib/api/client/supplier';
import { getCategoryApi } from '$lib/api/client/category';
import { getOfferingApi } from '$lib/api/client/offering';
import { buildBreadcrumb, type ConservedPath } from '$lib/utils/buildBreadcrumb';

type EntityNames = {
  supplier: string | null;
  category: string | null;
  offering: string | null | undefined;
};

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  depends(`url:${url.href}`);

  // --- STEP 1: DEFINE PATHS FROM BOTH SOURCES ---
  const pathFromUrl: NavigationPath = {
    supplierId: params.supplierId ? Number(params.supplierId) : null,
    categoryId: params.categoryId ? Number(params.categoryId) : null,
    offeringId: params.offeringId ? Number(params.offeringId) : null,
    leaf: url.pathname.endsWith('/attributes') ? 'attributes' : (url.pathname.endsWith('/links') ? 'links' : null)
  };

  const conservedPath = get(navigationState);


  // --- STEP 2: RECONCILE PATHS (THE CORRECT LOGIC) ---
  let finalUiPath: NavigationPath;

  // Case A: The user is switching to a completely new supplier tree.
  // The new URL's supplierId exists and is DIFFERENT from the one in memory.
  // ACTION: The memory is obsolete. Reset the path completely to the URL's path.
  if (pathFromUrl.supplierId && pathFromUrl.supplierId !== conservedPath.supplierId) {
    finalUiPath = pathFromUrl;
  } else {
    // Case B: The user is navigating WITHIN the same supplier tree, or to the root list.
    // ACTION: Construct the UI path by taking the deeper value from either the URL or the memory.
    // This correctly handles both forward and backward navigation.
    finalUiPath = {
      supplierId: pathFromUrl.supplierId ?? conservedPath.supplierId,
      categoryId: pathFromUrl.categoryId ?? conservedPath.categoryId,
      offeringId: pathFromUrl.offeringId ?? conservedPath.offeringId,
      leaf: pathFromUrl.leaf ?? conservedPath.leaf
    };
  }

  // Ensure the final path is logically consistent (pruning).
  // e.g., if categoryId becomes null, offeringId and leaf must also be null.
  if (!finalUiPath.supplierId) finalUiPath.categoryId = null;
  if (!finalUiPath.categoryId) finalUiPath.offeringId = null;
  if (!finalUiPath.offeringId) finalUiPath.leaf = null;

  // The newly reconciled path is now the new "truth" for our memory.
  navigationState.set(finalUiPath);


  // --- STEP 3: FETCH ENTITY NAMES FOR THE UI PATH ---
  // API calls are based on the `finalUiPath` to ensure breadcrumbs and sidebar are always complete.
  const entityNames: EntityNames = { supplier: null, category: null, offering: null };
  const apiPromises = [];
  const client = new ApiClient(loadEventFetch);

  if (finalUiPath.supplierId) {
    apiPromises.push(getSupplierApi(client).loadSupplier(finalUiPath.supplierId).then(s => entityNames.supplier = s.name).catch(() => {}));
  }
  if (finalUiPath.categoryId) {
    apiPromises.push(getCategoryApi(client).loadCategory(finalUiPath.categoryId).then(c => entityNames.category = c.name).catch(() => {}));
  }
  if (finalUiPath.offeringId) {
    apiPromises.push(getOfferingApi(client).loadOffering(finalUiPath.offeringId).then(o => entityNames.offering = o.product_def_title).catch(() => {}));
  }


  // --- STEP 4: DETERMINE ACTIVE LEVEL BASED ON THE ACTUAL URL ---
  // The active highlight must correspond to the page the user is *actually viewing* (`pathFromUrl`).
  let activeLevel: string;
  if (pathFromUrl.offeringId) {
    activeLevel = pathFromUrl.leaf || 'attributes';
  } else if (pathFromUrl.categoryId) {
    activeLevel = 'offerings';
  } else if (pathFromUrl.supplierId) {
    activeLevel = 'categories';
  } else {
    activeLevel = 'suppliers';
  }
  

  // --- STEP 5: BUILD FINAL PROPS AND RETURN ---
  await Promise.all(apiPromises);

  const breadcrumbItems = buildBreadcrumb({
    url,
    params,
    entityNames,
    conservedPath: finalUiPath as ConservedPath,
    activeLevel
  });

  const supplierPath = finalUiPath.supplierId ? `/suppliers/${finalUiPath.supplierId}` : '#';
  const categoryPath = finalUiPath.supplierId && finalUiPath.categoryId ? `/suppliers/${finalUiPath.supplierId}/categories/${finalUiPath.categoryId}` : '#';
  const offeringPathBase = finalUiPath.supplierId && finalUiPath.categoryId && finalUiPath.offeringId ? `/suppliers/${finalUiPath.supplierId}/categories/${finalUiPath.categoryId}/offerings/${finalUiPath.offeringId}` : '#';

  const sidebarItems = [
    { key: 'suppliers', label: 'Suppliers', disabled: false, level: 0, href: '/suppliers' },
    { key: 'categories', label: 'Categories', disabled: !finalUiPath.supplierId, level: 1, href: supplierPath },
    { key: 'offerings', label: 'Offerings', disabled: !finalUiPath.categoryId, level: 2, href: categoryPath },
    { key: 'attributes', label: 'Attributes', disabled: !finalUiPath.offeringId, level: 3, href: offeringPathBase === '#' ? '#' : `${offeringPathBase}/attributes` },
    { key: 'links', label: 'Links', disabled: !finalUiPath.offeringId, level: 3, href: offeringPathBase === '#' ? '#' : `${offeringPathBase}/links` },
  ];

  log.info(`(Layout Load) Data prepared for UI`, { finalUiPath, activeLevel });

  return {
    breadcrumbItems,
    sidebarItems,
    activeLevel
  };
}