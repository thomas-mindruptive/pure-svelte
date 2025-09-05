// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { ApiClient } from '$lib/api/client/ApiClient';
import { getOfferingApi } from '$lib/api/client/offering';
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import type { OfferingDetailAttributes_LoadDataAsync } from './offeringDetail.types';


/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export function load({ params, fetch: fetchLoad }: LoadEvent) {
  const offeringId = Number(params.offeringId);
  const categoryId = Number(params.categoryId);
  const supplierId = Number(params.supplierId);

  // ⚠️ There is not try/catch because we return promises!

  if (isNaN(offeringId) && params.offeringId?.toLowerCase() !== 'new') {
    throw error(400, 'OfferDetailAttributesPage.load: Invalid Offering ID: Must be number or "new"');
  }
  if (isNaN(categoryId)) {
    throw error(400, 'OfferDetailAttributesPage.load: Invalid Category ID');
  }
  if (isNaN(supplierId)) {
    throw error(400, 'OfferDetailAttributesPage.load: Invalid Supplier ID');
  }

  log.info(`(OfferDetailAttributesPage) loading all data for offeringId: ${offeringId}, categoryId: ${categoryId}, supplierId: ${supplierId}`);

  // API
  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);

  // EDIT MODE
  if (offeringId) {
    const asyncLoadData: OfferingDetailAttributes_LoadDataAsync =
    {
      supplierId, // Always pass from the params.
      categoryId, // Always pass from the params.
      offering: offeringApi.loadOffering(offeringId),
      assignedAttributes: offeringApi.loadOfferingAttributes(offeringId),
      availableAttributes: offeringApi.getAvailableAttributesForOffering(offeringId),
      // One cannot change the product definiton once an offering exists. 
      // => Attributes would be useless and one would have to check, if there is not other offering for this product def.
      // => No need to load product definitions for the category in edit mode.

    };
    return asyncLoadData;
  } else {
    // CREATE MODE
    // API loads only those product definitions that are available for the selected category and supplier 
    // and have NOT YET been assigned to supplier.
    const availableProducts = offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId);

    const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
      supplierId, // Always pass from the params.
      categoryId, // Always pass from the params.
      offering: Promise.resolve(null), // Not initial offering to edit
      availableAttributes: Promise.resolve([]),
      assignedAttributes: Promise.resolve([]),
      availableProducts: availableProducts // Only the "remaining" products
    };

    return asyncLoadData;
  }
}

