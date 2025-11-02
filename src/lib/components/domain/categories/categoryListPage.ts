import { log } from '$lib/utils/logger';
import { type LoadEvent } from '@sveltejs/kit';

// Import the new dependencies
import { ApiClient } from '$lib/api/client/apiClient';
import { getCategoryApi } from '$lib/api/client/category';

/**
 * Loads the data required for the Category List Page.
 * This function is called by SvelteKit when the /categories route is loaded.
 * ⚠️⚠️⚠️
 * NOTE: We use the streaming/"App Shell" model: load MUST NEVER block, because it prevents naviation!
 * This is not suitable for a modern SPA-like app!
 * => We return the promise, the respective "shell" component MUST handle the error.
 * ⚠️⚠️⚠️
 */
export function load({ fetch }: LoadEvent) {
  log.info(`Kicking of promise for loading ...`);
  const client = new ApiClient(fetch);
  const categoryApi = getCategoryApi(client);
  const categories = categoryApi.loadCategories({orderBy: [{ key: 'name', direction: 'asc' }],
  });
  // ⚠️ Return the promise. Target component must handle it!
  return {categories};

}