// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
// TODO: import { getProductDefinitionApi } from '$lib/api/client/productDefinition';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  const offeringId = Number(params.offeringId);

  if (isNaN(offeringId)) {
    throw error(400, 'Invalid Offering ID');
  }

  log.info(`(OfferDetailAttributesPage) loading all data for offeringId: ${offeringId}`);

  // API
  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);
  // TODO: const productDefApi = getProductDefinitionApi(client);

  try {
    // Führe alle notwendigen Datenabrufe parallel aus.
    const [offering, assignedAttributes, availableAttributes /*, availableProducts*/] = await Promise.all([
      offeringApi.loadOffering(offeringId),
      offeringApi.loadOfferingAttributes(offeringId),
      offeringApi.getAvailableAttributesForOffering(offeringId)
      // TODO: productDefApi.loadProductDefinitions()
    ]);

    return {
      offering,
      assignedAttributes,
      availableAttributes,
      availableProducts: [  // TODO: change after API implemented
        { product_def_id: 10, category_id: offering.category_id, title: 'Mock Product A' },
        { product_def_id: 11, category_id: offering.category_id, title: 'Mock Product B' }
      ]
    };

  } catch (err: any) {
    log.error(`Failed to load data for offeringId: ${offeringId}`, { err });
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}