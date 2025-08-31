// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
// TODO: import { getProductDefinitionApi } from '$lib/api/client/productDefinition';


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

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);
  // TODO: const productDefApi = getProductDefinitionApi(client); 

  try {
    // Lade Angebots-Details und Links parallel
    const [offering, links /*, availableProducts*/] = await Promise.all([
      offeringApi.loadOffering(offeringId),
      offeringApi.loadOfferingLinks(offeringId)
    ]);

    return {
      offering,
      links,
      availableProducts: [  // TODO: change after API implemented
        { product_def_id: 10, category_id: offering.category_id, title: 'Mock Product A' },
        { product_def_id: 11, category_id: offering.category_id, title: 'Mock Product B' }
      ]
    };
  } catch (err: any) {
    log.error(`Failed to load data for offeringId: ${offeringId}`, err);
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}