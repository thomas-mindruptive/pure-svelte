// src/lib/pages/offerings/offerDetailAttributesPage.ts

import { ApiClient } from "$lib/api/client/ApiClient";
import { getOfferingApi } from "$lib/api/client/offering";
import { log } from "$lib/utils/logger";
import { type LoadEvent } from "@sveltejs/kit";
import type { OfferingDetail_LoadDataAsync, OfferingDetailAttributes_LoadDataAsync } from "./offeringDetail.types";
import { loadOfferingDetailBasisData } from "./offeringDetailBasisLoads";

/**
 * Lädt alle Daten für die Angebots-Detailseite (Attribute).
 */
export function load({ url, params, fetch: fetchLoad }: LoadEvent): OfferingDetailAttributes_LoadDataAsync {
  log.debug(`OfferingDetailAttributesPage: load page-specific data`);

  // --- PARAMS ans basis data for all offering detail pages --------------------------------------

  const offeringId = Number(params.offeringId);
  const offeringDetailBasisData: OfferingDetail_LoadDataAsync = loadOfferingDetailBasisData({ url, params, fetch: fetchLoad });

  // --- LOAD SPECIFIC DATA -----------------------------------------------------------------------

  const client = new ApiClient(fetchLoad);
  const offeringApi = getOfferingApi(client);

  if (offeringDetailBasisData.isCreateMode) {
    // --- CREATE MODE
    const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
      ...offeringDetailBasisData,
      assignedAttributes: offeringApi.loadOfferingAttributes(offeringId),
      availableAttributes: offeringApi.getAvailableAttributesForOffering(offeringId),
    };
    return asyncLoadData;
  } else {
    // --- EDIT MODE
    const asyncLoadData: OfferingDetailAttributes_LoadDataAsync = {
      ...offeringDetailBasisData,
      availableAttributes: Promise.resolve([]),
      assignedAttributes: Promise.resolve([]),
    };
    return asyncLoadData;
  }
}
