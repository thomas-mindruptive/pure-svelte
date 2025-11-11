import type { LoadEvent } from "@sveltejs/kit";

export function load({ fetch }: LoadEvent) {
  // NO MORE LOADING DATA HERE!
  // Datagrid has full control over data loading
  // Only pass fetch for ApiClient
  return { loadEventFetch: fetch };
}
