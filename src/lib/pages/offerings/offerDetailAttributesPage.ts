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

  try {
    // EDIT MODE
    if (offeringId) {
      const [offering, assignedAttributes, availableAttributes] = await Promise.all([
        offeringApi.loadOffering(offeringId),
        offeringApi.loadOfferingAttributes(offeringId),
        offeringApi.getAvailableAttributesForOffering(offeringId),
        // One cannot change the product definiton once an offering exists. 
        // => Attributes would be useless and one would have to check, if there is not other offering for this product def.
        // => No need to load product definitions for the category in edit mode.

      ]);

      return {
        offering,
        assignedAttributes,
        availableAttributes,
      };
    } else {
      // CREATE MODE
      // API loads only those product definitions that are available for the selected category and supplier 
      // and have NOT YET been assigned to supplier.
      const availableProducts = await offeringApi.getAvailableProductDefsForOffering(categoryId, supplierId);

      return {
        offering: null, // Not initial offering to edit
        availableAttributes: [],
        availableProducts: availableProducts // Only the "remaining" products
      };
    }

  } catch (err: any) {
    log.error(`Failed to load data for offeringId: ${offeringId}`, { err });
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}

