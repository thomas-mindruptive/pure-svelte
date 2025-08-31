// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { getProductDefinitionApi } from '$lib/api/client/productDefintion';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  const offeringId = Number(params.offeringId);
  const categoryId = Number(params.categoryId);
  const supplierId = Number(params.supplierId);

  if (isNaN(offeringId)) {
    throw error(400, 'Invalid Offering ID');
  }
  if (isNaN(categoryId)) {
    throw error(400, 'Invalid Category ID');
  }
  if (isNaN(supplierId)) {
    throw error(400, 'Invalid Supplier ID');
  }

  log.info(`(OfferDetailAttributesPage) loading all data for offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);

  // API
  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);
  const productDefApi = getProductDefinitionApi(client);

  try {
    // Führe alle notwendigen Datenabrufe parallel aus.
    const [offering, assignedAttributes, availableAttributes, availableProducts] = await Promise.all([
      offeringApi.loadOffering(offeringId),
      offeringApi.loadOfferingAttributes(offeringId),
      offeringApi.getAvailableAttributesForOffering(offeringId),
      productDefApi.getAvailableProductDefsForOffering(categoryId, supplierId)
    ]);

    return {
      offering,
      assignedAttributes,
      availableAttributes,
      availableProducts
    };

  } catch (err: any) {
    log.error(`Failed to load data for offeringId: ${offeringId}`, { err });
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}