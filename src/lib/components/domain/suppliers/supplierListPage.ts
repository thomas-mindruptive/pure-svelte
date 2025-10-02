// src/lib/pages/suppliers/supplierListPage.ts

import { log } from '$lib/utils/logger';
import { type LoadEvent } from '@sveltejs/kit';

// Import the new dependencies
import { ApiClient } from '$lib/api/client/ApiClient';
import { getSupplierApi } from '$lib/api/client/supplier';
import type { SupplierListPageProps } from './SupplierListPage.svelte';

/**
 * Loads the data required for the Supplier List Page.
 * This function is called by SvelteKit when the /suppliers route is loaded.
 * ⚠️⚠️⚠️
 * NOTE: We use the streaming/"App Shell" model: load MUST NEVER block, because it prevents naviation!
 * This is not suitable for a modern SPA-like app!
 * => We return the promise, the respective "shell" component MUST handle the error.
 * ⚠️⚠️⚠️
 */
export function load({ fetch }: LoadEvent): SupplierListPageProps {
  log.info(`Kicking of promise for loading suppliers...`);

  // 1. Create an ApiClient instance with the context-aware `fetch`.
  const client = new ApiClient(fetch);

  // 2. Get the supplier-specific API methods from the factory.
  const supplierApi = getSupplierApi(client);

  // 3. Call the API method. The call is now clean and doesn't need `fetch`.
  const suppliers = supplierApi.loadSuppliers();

  // ⚠️ Return the promise. Target component must handle it!
  return {suppliers};

}