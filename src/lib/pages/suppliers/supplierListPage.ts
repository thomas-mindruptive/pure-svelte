// src/lib/pages/suppliers/supplierListPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';

// Import the new dependencies
import { ApiClient } from '$lib/api/client/ApiClient';
import { DEFAULT_SUPPLIER_QUERY, getSupplierApi } from '$lib/api/client/supplier';

/**
 * Loads the data required for the Supplier List Page.
 * This function is called by SvelteKit when the /suppliers route is loaded.
 */
export async function load({ fetch }: LoadEvent) {
  log.info(`(SupplierListPage) loading suppliers...`);

  try {
    // 1. Create an ApiClient instance with the context-aware `fetch`.
    const client = new ApiClient(fetch);

    // 2. Get the supplier-specific API methods from the factory.
    const supplierApi = getSupplierApi(client);

    // 3. Call the API method. The call is now clean and doesn't need `fetch`.
    const suppliers = await supplierApi.loadSuppliers({
      ...DEFAULT_SUPPLIER_QUERY,
      orderBy: [{ key: 'name', direction: 'asc' }],
    });

    // The returned data is available in the UI via the `data` prop.
    return {
      suppliers
    };
  } catch (err) {
    log.error(`(SupplierListPage) Failed to load suppliers`, { err });
    // Throws a SvelteKit-specific error, which displays a proper error page.
    throw error(500, 'Could not load suppliers. Please try again later.');
  }
}