// src/lib/pages/categories/categoryDetailPage.ts

/**
 * <refact01> CHANGED: No more assignmentDetails (wholesaler_categories removed)
 * Now loads supplierId, categoryId, category details, and offerings directly
 */
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { ApiClient } from '$lib/api/client/apiClient';
import type { SupplierCategoryDetailPage_LoadDataAsync } from './supplierCategoryDetailPage.types';
import { getCategoryApi } from '$lib/api/client/category';

/**
 * Loads all data for the Supplier Category Detail Page using the non-blocking "app shell" pattern.
 * This function makes parallel API calls for category details and offerings.
 *
 * @returns An object where each property is either a simple value or a promise for the required data,
 *          matching the `SupplierCategoryDetailPage_LoadDataAsync` type for compile-time safety.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent): SupplierCategoryDetailPage_LoadDataAsync {
  const supplierId = Number(params.supplierId);
  const categoryId = Number(params.categoryId);

  if (isNaN(supplierId) || isNaN(categoryId)) {
    const message = 'supplierCategoryDetailPage: Invalid Supplier or Category ID'
    log.error(message);
    throw error(400, message);
  }

  log.info(`(SupplierCategoryDetailPage) Kicking off non-blocking load for supplierId: ${supplierId}, categoryId: ${categoryId}`);

  const client = new ApiClient(loadEventFetch);
  const categoryApi = getCategoryApi(client);

  // <refact01> CHANGED: Return simple IDs + promises for category and offerings
  return {
    supplierId,
    categoryId,
    // Load category details (PROMISE - not awaited!)
    category: categoryApi.loadCategory(categoryId),
    // Load offerings for this supplier+category combination (PROMISE - not awaited!)
    offerings: categoryApi.loadOfferingsForSupplierCategory(supplierId, categoryId)
  };
}