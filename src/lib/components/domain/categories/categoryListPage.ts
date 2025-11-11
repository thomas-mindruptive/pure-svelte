import { type LoadEvent } from '@sveltejs/kit';

/**
 * Loads the data required for the Category List Page.
 *
 * NO MORE LOADING DATA HERE!
 * Datagrid has full control over data loading.
 * Only pass fetch for ApiClient.
 */
export function load({ fetch }: LoadEvent) {
  // Only return fetch for client-side API calls
  // Note: CategoryListPage expects loadEventFetch, not fetch
  return { loadEventFetch: fetch };
}