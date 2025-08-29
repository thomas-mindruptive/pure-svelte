// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  const offeringId = Number(params.offeringId);
  if (isNaN(offeringId)) {
    throw error(400, 'Invalid Offering ID');
  }

  log.info(`(OfferDetailLinksPage) loading all data for offeringId: ${offeringId}`);

  // 1. Create an ApiClient instance with the client `fetch`.
  const client = new ApiClient(fetchLoad);

  // 2. Get the supplier-specific API methods from the factory.
  const offeringApi = getOfferingApi(client);

  try {
    // Lade Angebots-Details und Links parallel
    const [offering, links] = await Promise.all([
      offeringApi.loadOffering(offeringId),
      offeringApi.loadOfferingLinks(offeringId)
    ]);

    return {
      offering,
      links
    };
  } catch (err) {
    log.error(`(OfferDetailLinksPage) Failed to load data`, { offeringId, err });
    throw error(404, `Offering with ID ${offeringId} not found.`);
  }
}