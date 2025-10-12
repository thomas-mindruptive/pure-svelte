// src/lib/pages/offerings/offerDetailLinksPage.ts

import { log } from "$lib/utils/logger";
import { type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync, OfferingDetailLinks_LoadDataAsync } from "./offeringDetail.types";
import { loadOfferingDetailBasisData } from "./offeringDetailBaseLoads";

/**
 * Lädt alle Daten für die Angebots-Detailseite (Links).
 * Diese Seite ist eigenständig und lädt alle ihre Daten selbst.
 */
export function load({ url, params, fetch: fetchLoad }: LoadEvent): OfferingDetailLinks_LoadDataAsync {
 log.debug(`OfferingDetailLinksPage: load page-specific data`);

  // --- PARAMS and basis data for all offering detail pages --------------------------------------

  //⚠️NOTE: We load the links directly with the offering! => not needed: const offeringId = Number(params.offeringId);
  const offeringDetailBasisData: OfferingDetail_LoadDataAsync = loadOfferingDetailBasisData({ url, params, fetch: fetchLoad });

  // --- LOAD SPECIFIC DATA -----------------------------------------------------------------------

  //⚠️NOTE: We load the links directly with the offering! => not needed:
  // const client = new ApiClient(fetchLoad);
  // const offeringApi = getOfferingApi(client);
  // END NOT NEEDED 
  
  if (offeringDetailBasisData.isCreateMode) {
    // --- CREATE MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      ...offeringDetailBasisData,
      //⚠️NOTE: We load the links directly with the offering! => not needed: links: Promise.resolve([]),
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE
    const asyncLoadData: OfferingDetailLinks_LoadDataAsync = {
      ...offeringDetailBasisData,
      //⚠️NOTE: We load the links directly with the offering! => not needed: links: offeringApi.loadOfferingLinks(offeringId),
    };
    return asyncLoadData;
  }
}
