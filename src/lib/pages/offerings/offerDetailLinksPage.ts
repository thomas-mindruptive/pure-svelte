// src/lib/pages/offerings/offerDetailLinksPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { loadOffering, loadOfferingLinks } from '$lib/api/client/offering';

/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export async function load({ params }: LoadEvent) {
  const offeringId = Number(params.offeringId);
  if (isNaN(offeringId)) {
    throw error(400, 'Invalid Offering ID');
  }

  log.info(`(OfferDetailLinksPage) loading all data for offeringId: ${offeringId}`);

  try {
    // Lade Angebots-Details und Links parallel
    const [offering, links] = await Promise.all([
      loadOffering(offeringId),
      loadOfferingLinks(offeringId)
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