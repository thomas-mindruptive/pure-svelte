// File: src/lib/backendQueries/imageMatching.ts

/**
 * Image Matching Logic for Offerings
 *
 * Finds the best matching image for an offering based on variant properties.
 * Used primarily for Shopify upload to select the correct image for each offering.
 */

import type { ProductDefinitionImage_Image, WholesalerItemOffering } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

/**
 * Criteria for matching images to offerings.
 * Extracted from offering or manually specified.
 */
export interface ImageMatchCriteria {
  material_id?: number | null;
  form_id?: number | null;
  surface_finish_id?: number | null;
  construction_type_id?: number | null;
  color_variant?: string | null;
  size?: string | null; // From offering.size
}

/**
 * Finds the best matching image for an offering from available Product Definition Images.
 *
 * **Matching Priority:**
 * All visual properties are CRITICAL - if specified, they must match or return null:
 * 1. material_id (CRITICAL - completely different color/appearance, e.g., Rose Quartz vs Amethyst)
 * 2. form_id (CRITICAL - completely different shape, e.g., Sphere vs Pyramid)
 * 3. surface_finish_id (CRITICAL - different texture, e.g., Polished vs Tumbled)
 * 4. construction_type_id (CRITICAL - different assembly, e.g., Threaded beads vs Pendant)
 * 5. color_variant (OPTIONAL - subtle color nuance, e.g., "pink" vs "deep pink")
 * 6. size_range (NICE-TO-HAVE - size preference, e.g., "S" matches "S-M")
 *
 * **Fallback Logic:**
 * - Images with NULL values are considered "generic" and match any offering
 * - If no exact match for critical fields: fallback to NULL-valued images (generic)
 * - If still no match: return null
 *
 * **Note:** In practice, Product Definitions are often structured to encode critical variants
 * in the definition itself (e.g., "Necklace Threaded" vs "Necklace Pendant" as separate
 * product_def_ids), so matching happens within the same product_def_id context.
 *
 * **Tiebreaker:**
 * - Prefer is_primary = true
 * - Then sort by sort_order ASC
 *
 * @param criteria - Offering properties to match against
 * @param images - Available Product Definition Images
 * @returns The best matching image or null if no suitable match found
 *
 * @example
 * ```typescript
 * const criteria = extractMatchCriteriaFromOffering(offering);
 * const bestImage = findBestMatchingImage(criteria, productDefImages);
 * ```
 */
export function findBestMatchingImage(
  criteria: ImageMatchCriteria,
  images: ProductDefinitionImage_Image[]
): ProductDefinitionImage_Image | null {
  if (!images || images.length === 0) {
    log.warn("findBestMatchingImage: No images available");
    return null;
  }

  let matches = [...images];

  // 1. Material Match (CRITICAL)
  matches = filterByFieldOrNull(matches, 'material_id', criteria.material_id);
  if (matches.length === 0) {
    log.warn("findBestMatchingImage: No material match found", {
      material_id: criteria.material_id
    });
    return null; // Material mismatch = fundamentally wrong image
  }

  // 2. Form Match (CRITICAL)
  matches = filterByFieldOrNull(matches, 'form_id', criteria.form_id);
  if (matches.length === 0) {
    log.warn("findBestMatchingImage: No form match found", {
      form_id: criteria.form_id
    });
    return null;
  }

  // 3. Surface Finish Match (IMPORTANT)
  matches = filterByFieldOrNull(matches, 'surface_finish_id', criteria.surface_finish_id);
  if (matches.length === 0) {
    log.warn("findBestMatchingImage: No surface finish match found", {
      surface_finish_id: criteria.surface_finish_id
    });
    return null;
  }

  // 4. Construction Type Match (IMPORTANT)
  matches = filterByFieldOrNull(matches, 'construction_type_id', criteria.construction_type_id);
  if (matches.length === 0) {
    log.warn("findBestMatchingImage: No construction type match found", {
      construction_type_id: criteria.construction_type_id
    });
    return null;
  }

  // 5. Color Variant Match (OPTIONAL - only if specified)
  if (criteria.color_variant) {
    const colorMatches = filterByFieldOrNull(matches, 'color_variant', criteria.color_variant);
    if (colorMatches.length > 0) {
      matches = colorMatches;
    }
    // If no color match: continue with existing matches (not critical)
  }

  // 6. Size Range Match (NICE-TO-HAVE)
  if (criteria.size) {
    const sizeMatches = matches.filter(img =>
      // Match if image has no size restriction (NULL)
      img.size_range === null ||
      // Or exact size match
      img.size_range === criteria.size ||
      // Or size is included in range (e.g., "S" matches "S-M")
      (img.size_range && criteria.size ? img.size_range.includes(criteria.size) : false)
    );
    if (sizeMatches.length > 0) {
      matches = sizeMatches;
    }
  }

  // 7. Tiebreaker: is_primary first, then sort_order ascending
  matches.sort((a, b) => {
    // Primary images first
    if (a.is_primary !== b.is_primary) {
      return b.is_primary ? 1 : -1; // b.is_primary = true → b comes first (return 1)
    }
    // Lower sort_order first
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const result = matches[0];

  log.debug("findBestMatchingImage", {
    criteria,
    totalImages: images.length,
    matchedImages: matches.length,
    selectedImageId: result?.image_id,
    selectedImageFilename: result?.image?.filename,
  });

  return result;
}

/**
 * Helper: Filters images by field match OR NULL (generic).
 *
 * **Logic:**
 * - First: Look for exact matches (image.field === value)
 * - Fallback: Accept NULL/undefined images (generic, matches anything)
 * - If neither: return empty array
 *
 * @param items - Images to filter
 * @param field - Field to match on
 * @param value - Value to match against
 * @returns Filtered images (exact matches or generic fallbacks)
 */
function filterByFieldOrNull<T extends Record<string, any>>(
  items: T[],
  field: keyof T,
  value: any
): T[] {
  // Exact matches
  const exactMatches = items.filter(item => item[field] === value);

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // Fallback: NULL/undefined (generic images)
  const genericMatches = items.filter(item =>
    item[field] === null || item[field] === undefined
  );

  return genericMatches.length > 0 ? genericMatches : [];
}

/**
 * Convenience: Extracts matching criteria from an Offering.
 *
 * @param offering - Wholesaler Item Offering
 * @returns ImageMatchCriteria for use with findBestMatchingImage
 */
export function extractMatchCriteriaFromOffering(
  offering: WholesalerItemOffering
): ImageMatchCriteria {
  return {
    material_id: offering.material_id ?? null,
    form_id: offering.form_id ?? null,
    surface_finish_id: offering.surface_finish_id ?? null,
    construction_type_id: offering.construction_type_id ?? null,
    color_variant: offering.color_variant ?? null,
    size: offering.size ?? null,
  };
}
