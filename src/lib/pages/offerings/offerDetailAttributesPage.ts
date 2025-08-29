// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { 
    loadOffering, 
    loadOfferingAttributes, 
    getAvailableAttributesForOffering 
} from '$lib/api/client/offering';

/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export async function load({ params }: LoadEvent) {
  const offeringId = Number(params.offeringId);

  if (isNaN(offeringId)) {
    throw error(400, 'Invalid Offering ID');
  }

  log.info(`(OfferDetailAttributesPage) loading all data for offeringId: ${offeringId}`);

  try {
    // Führe alle notwendigen Datenabrufe parallel aus.
    const [offering, assignedAttributes, availableAttributes] = await Promise.all([
      loadOffering(offeringId),
      loadOfferingAttributes(offeringId),
      getAvailableAttributesForOffering(offeringId)
    ]);

    return {
      offering,
      assignedAttributes,
      availableAttributes
    };

  } catch (err) {
    log.error(`(OfferDetailAttributesPage) Failed to load data for offeringId: ${offeringId}`, { err });
    throw error(404, `Offering with ID ${offeringId} not found.`);
  }
}