// src/lib/pages/offerings/offerDetailLinksPage.ts

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync, OfferingDetailLinks_LoadDataAsync } from "./offeringDetail.types";
import { loadOfferingDetailBasisData } from "./offeringDetailBasisLoads";

/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export function load({ url, params, fetch: fetchLoad }: LoadEvent): OfferingDetailLinks_LoadDataAsync {
 log.debug(`OfferingDetailLinksPage: load page-specific data`);

  // --- PARAMS and basis data for all offering detail pages --------------------------------------

  const offeringId = Number(params.offeringId);
  const offeringDetailBasisData: OfferingDetail_LoadDataAsync = loadOfferingDetailBasisData({ url, params, fetch: fetchLoad });

  // --- LOAD SPECIFIC DATA -----------------------------------------------------------------------

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);

  if (offeringDetailBasisData.isCreateMode) {
    // --- CREATE MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      ...offeringDetailBasisData,
      links: Promise.resolve([]),
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      ...offeringDetailBasisData,
      links: offeringApi.loadOfferingLinks(offeringId),
    };
    return asyncLoadData;
  }
}
