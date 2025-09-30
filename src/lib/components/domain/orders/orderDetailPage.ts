import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";

/**
 * @param params Contains the orderId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent) {
  const orderId = Number(params.orderId);
  let isCreateMode = false;
  if (isNaN(orderId) && params.orderId?.toLowerCase() !== "new") {
    // This error is thrown immediately as it's a client-side validation error.
    throw error(400, `orderDetailPage: Invalid Order ID - ${JSON.stringify(params)} `);
  }
  if (params.orderId?.toLowerCase() !== "new") {
    isCreateMode = true;
  }
  log.info(`load: ${orderId}`);
  return {orderId, isCreateMode, loadEventFetch};
}
