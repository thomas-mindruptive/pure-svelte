import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/ApiClient";
import type { CategoryDetailPage_LoadDataAsync } from "./categoryDetailPage.types";
import { getCategoryApi } from "$lib/api/client/category";

/**
 * Loads all data for the Category Detail Page using the non-blocking "app shell" pattern.
 * This function returns immediately with an object of promises.
 * The corresponding Svelte component is responsible for resolving these promises.
 *
 * @param params Contains the categoryId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent): CategoryDetailPage_LoadDataAsync {
  const categoryId = Number(params.categoryId);

  let isCreateMode = false;

  if (isNaN(categoryId) && params.categoryId?.toLowerCase() !== "new") {
    // This error is thrown immediately as it's a client-side validation error.
    throw error(400, `categoryDetailPage: Invalid Category ID - ${JSON.stringify(params)} `);
  }

  if (params.categoryId?.toLowerCase() !== "new") {
    isCreateMode = true;
  }

  log.info(`Kicking off non-blocking load for categoryId: ${categoryId}`);

  // Create an ApiClient instance with the context-aware `fetch`.
  const client = new ApiClient(loadEventFetch);

  // Get the specific API methods from the factory.
  const categoryApi = getCategoryApi(client);

  // ⚠️ Return the object of promises directly without `await`.
  //    The page component will handle resolving and error states.

  // EDIT mode
  if (categoryId) {
    const loadDataAsync: CategoryDetailPage_LoadDataAsync = {
      category: categoryApi.loadCategory(categoryId),
      productDefinitions: categoryApi.loadProductDefsForCategory(categoryId),
	  isCreateMode
    };
    return loadDataAsync;
  }
  // CREATE mode
  else {
    const loadDataAsync: CategoryDetailPage_LoadDataAsync = {
      category: Promise.resolve(null),
      productDefinitions: Promise.resolve([]),
	  isCreateMode
    };
    return loadDataAsync;
  }
}
