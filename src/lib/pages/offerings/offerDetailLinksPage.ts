// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import type { OfferingDetailLinks_LoadData } from './offeringDetail.types';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export async function load({ params, fetch: fetchLoad }: LoadEvent) {
  log.info('(OfferDetailLinksPage) load called with params:', params);

  const offeringId = Number(params.offeringId);
  const categoryId = Number(params.categoryId);
  const supplierId = Number(params.supplierId);

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

  try {
    // EDIT MODE
    if (offeringId) {
      const [offering, links, availableProducts] = await Promise.all([
        offeringApi.loadOffering(offeringId),
        offeringApi.loadOfferingLinks(offeringId),
        offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId)
      ]);
      log.info(`(OfferDetailLinksPage) Loaded data for offeringId: ${offeringId}`, {
        offering,
        links,
        availableProducts
      });

      return {
        supplierId, // Always pass from the params.
        categoryId, // Always pass from the params.
        offering,
        links,
        availableProducts
      };
    } else {
      // CREATE MODE
      // API loads only those product definitions that are available for the selected category and supplier 
      // and have NOT YET been assigned to supplier.
      const availableProducts = await offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId);

      const loadData: OfferingDetailLinks_LoadData = {
        supplierId, // Always pass from the params.
        categoryId, // Always pass from the params.
        offering: null, // No initial offering to edit
        links: [],
        availableProducts: availableProducts // Only the "remaining" products
      };

      return loadData;
    }
  } catch (err: any) {
    log.error(`Failed to load data for offeringId: ${offeringId}`, err);
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}