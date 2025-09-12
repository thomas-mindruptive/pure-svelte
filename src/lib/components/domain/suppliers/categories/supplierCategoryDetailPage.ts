// src/lib/pages/categories/categoryDetailPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { getCategoryApi } from '$lib/api/client/category';
import { getSupplierApi } from '$lib/api/client/supplier';
import { ApiClient } from '$lib/api/client/ApiClient';
import type { SupplierCategoryDetailPage_LoadDataAsync } from './supplierCategoryDetailPage.types';

/**
 * Loads all data for the Category Detail Page using the non-blocking "app shell" pattern.
 * This function is now highly efficient, making only two parallel API calls.
 *
 * @returns An object where each property is a promise for the required data,
 *          matching the `CategoryDetailPage_LoadDataAsync` type for compile-time safety.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent): SupplierCategoryDetailPage_LoadDataAsync {
  const supplierId = Number(params.supplierId);
  const categoryId = Number(params.categoryId);

  if (isNaN(supplierId) || isNaN(categoryId)) {
    throw error(400, 'Invalid Supplier or Category ID');
  }

  log.info(`(CategoryDetailPage) Kicking off non-blocking load for supplierId: ${supplierId}, categoryId: ${categoryId}`);

  const client = new ApiClient(loadEventFetch);
  const supplierApi = getSupplierApi(client);
  const categoryApi = getCategoryApi(client);

  // The function now returns an object that perfectly matches the ...LoadDataAsync type.
  return {
    // 1. Fetches the combined assignment and category details in one call.
    assignmentDetails: supplierApi.loadCategoryAssignmentForSupplier(supplierId, categoryId),
    
    // 2. Fetches the list of offerings for this context.
    offerings: categoryApi.loadOfferingsForCategory(supplierId, categoryId)
  };
}