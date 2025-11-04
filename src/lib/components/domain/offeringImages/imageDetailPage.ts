// File: src/lib/components/domain/offeringImages/imageDetailPage.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { ImageDetailPageProps } from "./ImageDetailPage.svelte";

/**
 * Load function for Offering Image Detail Page.
 * Returns only parameters - component loads data in $effect.
 */
export function load({ params }: LoadEvent): ImageDetailPageProps {
  log.debug(`offeringImageDetailPage::load`, { params });

  const imageId = params.imageId;
  const offeringId = Number(params.offeringId);
  const productDefId = params.productDefId ? Number(params.productDefId) : undefined;
  const categoryId = Number(params.categoryId);
  const supplierId = params.supplierId ? Number(params.supplierId) : undefined;

  const isCreateMode = imageId?.toLowerCase() === "new";

  if (!isCreateMode) {
    const imageIdNum = Number(imageId);
    if (isNaN(imageIdNum) || imageIdNum <= 0) {
      throw error(400, "offeringImageDetailPage::load: Invalid Image ID. Must be a positive number.");
    }
  }

  if (isNaN(offeringId) || offeringId <= 0) {
    throw error(400, "offeringImageDetailPage::load: Invalid Offering ID. Must be a positive number.");
  }

  // productDefId is only present in categories route, not in suppliers route
  if (productDefId !== undefined && (isNaN(productDefId) || productDefId <= 0)) {
    throw error(400, "offeringImageDetailPage::load: Invalid Product Definition ID. Must be a positive number.");
  }

  if (isNaN(categoryId) || categoryId <= 0) {
    throw error(400, "offeringImageDetailPage::load: Invalid Category ID. Must be a positive number.");
  }

  if (supplierId !== undefined && (isNaN(supplierId) || supplierId <= 0)) {
    throw error(400, "offeringImageDetailPage::load: Invalid Supplier ID. Must be a positive number.");
  }

  return {
    imageId: isCreateMode ? "new" : Number(imageId),
    offeringId,
    productDefId,
    categoryId,
    supplierId,
    isCreateMode,
    isSuppliersRoute: supplierId !== undefined,
  };
}
