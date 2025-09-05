// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import type { OfferingDetailLinks_LoadDataAsync } from './offeringDetail.types';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  log.info('(OfferDetailLinksPage) load called with params:', params);

  const offeringId = Number(params.offeringId);
  const categoryId = Number(params.categoryId);
  const supplierId = Number(params.supplierId);

  // ⚠️ There is not try/catch because we return promises!

  if (isNaN(offeringId) && params.offeringId?.toLowerCase() !== 'new') {
    throw error(400, 'OfferingDetailLinksPage.loadInvalid Offering ID: Must be number or "new"');
  }
  if (isNaN(categoryId)) {
    throw error(400, 'OfferingDetailLinksPage.load: Invalid Category ID');
  }
  if (isNaN(supplierId)) {
    throw error(400, 'OfferingDetailLinksPage.load: Invalid Supplier ID');
  }

  log.info(`(OfferDetailLinksPage) loading all data for offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);

  // EDIT MODE
  if (offeringId) {
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      supplierId, // Always pass from the params.
      categoryId, // Always pass from the params.
      offering: offeringApi.loadOffering(offeringId),
      links: offeringApi.loadOfferingLinks(offeringId),
      // API loads only those product definitions that are available for the selected category and supplier 
      // and have NOT YET been assigned to supplier.
      availableProducts: offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId)
    }
    log.info(`(OfferDetailLinksPage) Kicked off loading promises offeringId: ${offeringId}`);
    return asyncLoadData
  } else {

    // CREATE MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      supplierId, // Always pass from the params.
      categoryId, // Always pass from the params.
      offering: Promise.resolve(null), // No initial offering to edit
      links: Promise.resolve([]),
      // API loads only those product definitions that are available for the selected category and supplier 
      // and have NOT YET been assigned to supplier.
      availableProducts: offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId)
      // Only the "remaining" products
    };

    return asyncLoadData;
  }
}