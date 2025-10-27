// File: src/lib/components/domain/productDefinitionImages/imageDetailPage.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import type { ImageDetailPageProps } from "./ImageDetailPage.svelte";

/**
 * Load function for Image Detail Page.
 * Returns only parameters - component loads data in $effect.
 */
export function load({ params }: LoadEvent): ImageDetailPageProps {
  log.debug(`imageDetailPage::load`, { params });

  const imageId = params.imageId;
  const productDefId = Number(params.productDefId);
  const categoryId = Number(params.categoryId);

  const isCreateMode = imageId?.toLowerCase() === "new";

  if (!isCreateMode) {
    const imageIdNum = Number(imageId);
    if (isNaN(imageIdNum) || imageIdNum <= 0) {
      throw error(400, "imageDetailPage::load: Invalid Image ID. Must be a positive number.");
    }
  }

  if (isNaN(productDefId) || productDefId <= 0) {
    throw error(400, "imageDetailPage::load: Invalid Product Definition ID. Must be a positive number.");
  }

  if (isNaN(categoryId) || categoryId <= 0) {
    throw error(400, "imageDetailPage::load: Invalid Category ID. Must be a positive number.");
  }

  return {
    imageId: isCreateMode ? "new" : Number(imageId),
    productDefId,
    categoryId,
    isCreateMode,
  };
}
