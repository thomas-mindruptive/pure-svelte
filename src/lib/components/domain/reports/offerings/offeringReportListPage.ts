import type { LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/apiClient";
import { getOfferingApi } from "$lib/api/client/offering";

export function load({ fetch }: LoadEvent) {
  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  // Promise ohne await - für Streaming
  const offerings = offeringApi.loadOfferingsForReportWithLinks();

  return { offerings, loadEventFetch: fetch };
}
