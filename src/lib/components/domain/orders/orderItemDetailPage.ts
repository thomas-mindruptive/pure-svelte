import { log } from "$lib/utils/logger";
import { parseUrlPathSegments } from "$lib/utils/url";
import { error, type LoadEvent } from "@sveltejs/kit";

/**
 * Load function for OrderItem detail page.
 * Extracts URL parameters and route context only.
 * Actual data loading happens in OrderItemDetailPage.svelte via $effect.
 *
 * @param url The URL object for route detection.
 * @param params Contains orderId and orderItemId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns Extracted parameters and context flags for OrderItemDetailPage.
 */
export function load({ url, params, fetch: loadEventFetch }: LoadEvent) {
  const orderId = Number(params.orderId);
  const orderItemId = Number(params.orderItemId);
  let isCreateMode = false;
  let isOrdersRoute = false;
  let isSuppliersRoute = false;

  // --- VALIDATION ---
  if (isNaN(orderId)) {
    throw error(400, `orderItemDetailPage: Invalid Order ID - ${JSON.stringify(params.orderId)}`);
  }

  if (isNaN(orderItemId) && params.orderItemId?.toLowerCase() !== "new") {
    throw error(400, `orderItemDetailPage: Invalid OrderItem ID - ${JSON.stringify(params.orderItemId)}`);
  }

  if (params.orderItemId?.toLowerCase() === "new") {
    isCreateMode = true;
  }

  // --- ROUTE CONTEXT DETECTION ---
  const urlSegments = parseUrlPathSegments(url);

  if (urlSegments[0].toLowerCase() === "orders") {
    isOrdersRoute = true;
  } else if (urlSegments[0].toLowerCase() === "suppliers") {
    isSuppliersRoute = true;
  } else {
    throw error(400, `orderItemDetailPage: url route must be "/orders..." or "/suppliers..." but was "/${urlSegments[0]}"`);
  }

  log.info(
    `orderItemDetailPage load: orderId=${orderId}, orderItemId=${orderItemId}, isCreateMode=${isCreateMode}, isOrdersRoute=${isOrdersRoute}`
  );

  return {
    orderId,
    orderItemId: isCreateMode ? null : orderItemId,
    isCreateMode,
    isOrdersRoute,
    isSuppliersRoute,
    loadEventFetch,
    params,
  };
}
