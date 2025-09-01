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
  log.info('(Layout Load) called with URL:', url.href, 'and params:', params);
  depends(`url:${url.href}`);

  // --- STEP 1: DEFINE PATHS FROM BOTH SOURCES ---
  const pathFromUrl: NavigationPath = {
    supplierId: params.supplierId ? Number(params.supplierId) : null,
    categoryId: params.categoryId ? Number(params.categoryId) : null,
    offeringId: params.offeringId ? Number(params.offeringId) : null,
    leaf: url.pathname.endsWith('/attributes') ? 'attributes' : (url.pathname.endsWith('/links') ? 'links' : null)
  };
  const conservedPath = get(navigationState);

  // --- STEP 2: RECONCILE PATHS (HIERARCHICALLY CORRECT LOGIC) ---
  // This logic correctly prunes the "memory" path when a parent level changes.
  
  // The supplier is our root anchor. It's always taken from the URL if present.
  const supplierId = pathFromUrl.supplierId;

  // The category can be restored from memory ONLY IF its parent (supplierId) is consistent.
  // If the URL specifies a categoryId, it ALWAYS takes precedence.
  const categoryId = pathFromUrl.categoryId ?? (supplierId != null && supplierId === conservedPath.supplierId ? conservedPath.categoryId : null);

  // The offering can be restored from memory ONLY IF its entire parent chain (supplierId AND categoryId) is consistent.
  // If the URL specifies an offeringId, it ALWAYS takes precedence.
  const offeringId = pathFromUrl.offeringId ?? (categoryId != null && categoryId === conservedPath.categoryId && supplierId === conservedPath.supplierId ? conservedPath.offeringId : null);
  
  // The leaf can be restored from memory ONLY IF the full path down to the offering is consistent.
  const leaf = pathFromUrl.leaf ?? (offeringId != null && offeringId === conservedPath.offeringId && categoryId === conservedPath.categoryId && supplierId === conservedPath.supplierId ? conservedPath.leaf : null);
  
  // This is the final, valid path that represents the state of the application shell.
  const finalUiPath: NavigationPath = { supplierId, categoryId, offeringId, leaf };
  
  // The newly reconciled path becomes the new "truth" for our memory.
  navigationState.set(finalUiPath);

  // --- STEP 3: FETCH ENTITY NAMES FOR THE UI PATH ---
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
  log.info(`(Layout Load) Reconciled navigation path, before loading data:`, { pathFromUrl, conservedPath, finalUiPath, activeLevel });
  
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

  log.info(`(Layout Load) Data prepared for UI`, { finalUiPath, activeLevel, pathFromUrl });

  return {
    breadcrumbItems,
    sidebarItems,
    activeLevel
  };
}