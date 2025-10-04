import { log } from "$lib/utils/logger";
import { parseUrlSegments } from "$lib/utils/url";
import { error, type LoadEvent } from "@sveltejs/kit";

/**
 * @param params Contains the orderId from the URL.
 * @param url The URL object for route detection.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ url, params, fetch: loadEventFetch }: LoadEvent) {
  log.debug(`orderDetailPage::load`, {url, params});
  const orderId = Number(params.orderId);
  let isCreateMode = false;
  let isOrdersRoute = false;
  let isSuppliersRoute = false;

  // --- VALIDATION ---
  if (isNaN(orderId) && params.orderId?.toLowerCase() !== "new") {
    throw error(400, `orderDetailPage: Invalid Order ID - ${JSON.stringify(params)} `);
  }
  if (params.orderId?.toLowerCase() === "new") {
    isCreateMode = true;
  }

  // --- ROUTE CONTEXT DETECTION ---
  const urlSegments = parseUrlSegments(url);

  if (urlSegments[0].toLowerCase() === "orders") {
    isOrdersRoute = true;
  } else if (urlSegments[0].toLowerCase() === "suppliers") {
    isSuppliersRoute = true;
  } else {
    throw error(400, `orderDetailPage: url route must be "/orders..." or "/suppliers..." but was "/${urlSegments[0]}"`);
  }

  log.info(`load: ${orderId}, isOrdersRoute: ${isOrdersRoute}, isSuppliersRoute: ${isSuppliersRoute}`);
  return { orderId, isCreateMode, isOrdersRoute, isSuppliersRoute, loadEventFetch, params };
}
