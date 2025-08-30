// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  const offeringId = Number(params.offeringId);

  if (isNaN(offeringId)) {
    throw error(400, 'Invalid Offering ID');
  }

  log.info(`(OfferDetailAttributesPage) loading all data for offeringId: ${offeringId}`);

    // 1. Create an ApiClient instance with the context-aware `fetch`.
    const client = new ApiClient(fetchLoad);
  
    // 2. Get the supplier-specific API methods from the factory.
    const offeringApi = getOfferingApi(client);

  try {
    // Führe alle notwendigen Datenabrufe parallel aus.
    const [offering, assignedAttributes, availableAttributes] = await Promise.all([
      offeringApi.loadOffering(offeringId),
      offeringApi.loadOfferingAttributes(offeringId),
      offeringApi.getAvailableAttributesForOffering(offeringId)
    ]);

    return {
      offering,
      assignedAttributes,
      availableAttributes
    };

  } catch (err: any) {
    log.error(`Failed to load data for offeringId: ${offeringId}`, { err });
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}