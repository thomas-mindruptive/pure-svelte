// src/lib/pages/suppliers/supplierListPage.ts

import { type LoadEvent } from '@sveltejs/kit';
import type { SupplierListPageProps } from './SupplierListPage.svelte';

/**
 * Loads the data required for the Supplier List Page.
 *
 * NO MORE LOADING DATA HERE!
 * Datagrid has full control over data loading.
 * Only pass fetch for ApiClient.
 */
export function load({ fetch }: LoadEvent): SupplierListPageProps {
  // Only return fetch for client-side API calls
  return { loadEventFetch: fetch };
}