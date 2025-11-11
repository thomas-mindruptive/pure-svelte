import { type LoadEvent } from '@sveltejs/kit';

/**
 * Loads the data for the Attribute List Page.
 *
 * NO MORE LOADING DATA HERE!
 * Datagrid has full control over data loading.
 * Only pass fetch for ApiClient.
 */
export function load({ fetch }: LoadEvent) {
  // Only return fetch for client-side API calls
  // Note: AttributesListPage expects loadEventFetch
  return { loadEventFetch: fetch };
}