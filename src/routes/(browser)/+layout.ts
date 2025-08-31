import { get } from 'svelte/store';
import { log } from '$lib/utils/logger';
import type { LoadEvent } from '@sveltejs/kit';
import { navigationState } from '$lib/stores/navigationState';
import { ApiClient } from '$lib/api/client/ApiClient';
import { getSupplierApi } from '$lib/api/client/supplier';
import { getCategoryApi } from '$lib/api/client/category';
import { getOfferingApi } from '$lib/api/client/offering';
import { buildBreadcrumb } from '$lib/utils/buildBreadcrumb';


// Define a type for the entity names to keep the code clean.
type EntityNames = {
  supplier: string | null;
  category: string | null;
  offering: string | null | undefined; // `product_def_title` can be undefined
};

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  // 1. Register a dependency on the URL.
  depends(`url:${url.href}`);

  // 2. Extract the current path from the URL parameters.
  const currentSupplierId = params.supplierId ? Number(params.supplierId) : null;
  const currentCategoryId = params.categoryId ? Number(params.categoryId) : null;
  const currentOfferingId = params.offeringId ? Number(params.offeringId) : null;

  // 3. Get the "conserved" path from the store.
  const conservedPath = get(navigationState);

  // 4. Determine the final, "resolved" path.
  const resolvedSupplierId = currentSupplierId ?? conservedPath.supplierId;
  const resolvedCategoryId = currentCategoryId ?? (resolvedSupplierId === conservedPath.supplierId ? conservedPath.categoryId : null);
  const resolvedOfferingId = currentOfferingId ?? (resolvedCategoryId === conservedPath.categoryId ? conservedPath.offeringId : null);

  // 5. Load entity names for the breadcrumb.
  //    CORRECTION: Apply the explicit `EntityNames` type here.
  const entityNames: EntityNames = { supplier: null, category: null, offering: null };
  const apiPromises = [];
  const client = new ApiClient(loadEventFetch);

  if (resolvedSupplierId) {
    apiPromises.push(
      getSupplierApi(client).loadSupplier(resolvedSupplierId).then(s => entityNames.supplier = s.name).catch(() => { })
    );
  }
  if (resolvedCategoryId) {
    apiPromises.push(
      getCategoryApi(client).loadCategory(resolvedCategoryId).then(c => entityNames.category = c.name).catch(() => { })
    );
  }
  if (resolvedOfferingId) {
    apiPromises.push(
      getOfferingApi(client).loadOffering(resolvedOfferingId).then(o => entityNames.offering = o.product_def_title).catch(() => { })
    );
  }

  // 6. Determine the `activeLevel`.
  let activeLevel: string;
  if (currentOfferingId) {
    activeLevel = url.pathname.endsWith('/links') ? 'links' : 'attributes';
  } else if (currentCategoryId) {
    activeLevel = 'offerings';
  } else if (currentSupplierId) {
    activeLevel = 'categories';
  } else {
    activeLevel = 'suppliers';
  }

  await Promise.all(apiPromises);
  const breadcrumbItems = buildBreadcrumb({
    url,
    params,
    entityNames,
    conservedPath, // <-- Injecting the state
    activeLevel
  });

  // 7. Create the sidebar paths and states.
  const supplierPath = resolvedSupplierId ? `/suppliers/${resolvedSupplierId}` : '#';
  const categoryPath = resolvedSupplierId && resolvedCategoryId ? `/suppliers/${resolvedSupplierId}/categories/${resolvedCategoryId}` : '#';
  const offeringPathBase = resolvedSupplierId && resolvedCategoryId && resolvedOfferingId ? `/suppliers/${resolvedSupplierId}/categories/${resolvedCategoryId}/offerings/${resolvedOfferingId}` : '#';

  const sidebarItems = [
    { key: 'suppliers', label: 'Suppliers', disabled: false, level: 0, href: '/suppliers' },
    { key: 'categories', label: 'Categories', disabled: !resolvedSupplierId, level: 1, href: supplierPath },
    { key: 'offerings', label: 'Offerings', disabled: !resolvedCategoryId, level: 2, href: categoryPath },
    { key: 'attributes', label: 'Attributes', disabled: !resolvedOfferingId, level: 3, href: offeringPathBase === '#' ? '#' : `${offeringPathBase}/attributes` },
    { key: 'links', label: 'Links', disabled: !resolvedOfferingId, level: 3, href: offeringPathBase === '#' ? '#' : `${offeringPathBase}/links` },
  ];

  log.info(`(Layout Load) Resolved Path for UI`, { resolved: { supplierId: resolvedSupplierId, categoryId: resolvedCategoryId, offeringId: resolvedOfferingId }, activeLevel });

  // 8. Return all the prepared data.
  return {
    breadcrumbItems,
    sidebarItems,
    activeLevel,
    entityNames,
    url: new URL(url),
    params
  };
}