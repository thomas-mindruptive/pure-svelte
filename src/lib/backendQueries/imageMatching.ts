// File: src/lib/backendQueries/imageMatching.ts

/**
 * Image Matching Logic for Offerings
 *
 * Finds the best matching image for an offering based on variant properties.
 * Used primarily for Shopify upload and AI image generation to select the correct image for each offering.
 *
 * IMPORTANT: Images are only matched within the same product_def_id!
 */

import type { ProductDefinitionImage_Image, WholesalerItemOffering } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

/**
 * Configuration for image matching behavior
 */
export interface ImageMatchConfig {
  /**
   * Fields that MUST match exactly (unless NULL)
   */
  required_fields: Array<keyof ImageMatchCriteria>;

  /**
   * Fields that contribute to matching score with weights
   */
  optional_fields: Partial<Record<keyof ImageMatchCriteria, number>>;

  /**
   * Minimum score (0.0-1.0) for optional fields to consider a match
   */
  min_optional_score: number;

  /**
   * How to handle NULL values
   */
  null_behavior: {
    /**
     * If true, NULL in image acts as wildcard (matches any value)
     * If false, NULL in image only matches NULL in offering
     */
    image_null_is_wildcard: boolean;

    /**
     * If true, NULL in offering accepts any value (including non-NULL)
     * If false, NULL in offering only matches NULL in image
     */
    offering_null_accepts_all: boolean;
  };
}

/**
 * Default configuration for image matching
 */
export const DEFAULT_MATCH_CONFIG: ImageMatchConfig = {
  required_fields: ['material_id'], // Material MUST match
  optional_fields: {
    form_id: 0.4,
    surface_finish_id: 0.3,
    construction_type_id: 0.2,
    color_variant: 0.1
  },
  min_optional_score: 0.5, // At least 50% of optional fields should match
  null_behavior: {
    image_null_is_wildcard: false, // NULL in image is NOT a wildcard anymore!
    offering_null_accepts_all: true // NULL in offering accepts any value
  }
};

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
 * Result of image matching with score
 */
interface ScoredImage {
  image: ProductDefinitionImage_Image;
  score: number;
  requiredFieldsMatch: boolean;
  optionalScore: number;
}

/**
 * Finds the best matching image for an offering from available Product Definition Images.
 *
 * IMPORTANT: Images should already be filtered by product_def_id before calling this function!
 *
 * Matching process:
 * 1. Check required fields - must all match exactly
 * 2. Calculate score for optional fields
 * 3. Return highest scoring image that meets minimum requirements
 *
 * @param criteria - Offering properties to match against
 * @param images - Available Product Definition Images (from SAME product_def)
 * @param config - Matching configuration (optional, uses DEFAULT_MATCH_CONFIG if not provided)
 * @returns The best matching image or null if no suitable match found
 */
export function findBestMatchingImage(
  criteria: ImageMatchCriteria,
  images: ProductDefinitionImage_Image[],
  config: ImageMatchConfig = DEFAULT_MATCH_CONFIG
): ProductDefinitionImage_Image | null {
  if (!images || images.length === 0) {
    log.warn("findBestMatchingImage: No images available");
    return null;
  }

  // Score all images
  const scoredImages: ScoredImage[] = [];

  for (const image of images) {
    // Step 1: Check required fields
    const requiredFieldsMatch = checkRequiredFields(image, criteria, config);

    if (!requiredFieldsMatch) {
      continue; // Skip images that don't match required fields
    }

    // Step 2: Calculate optional fields score
    const optionalScore = calculateOptionalScore(image, criteria, config);

    // Step 3: Calculate total score (required fields are binary, optional adds to score)
    const totalScore = optionalScore;

    scoredImages.push({
      image,
      score: totalScore,
      requiredFieldsMatch,
      optionalScore
    });
  }

  // Filter by minimum optional score
  const validImages = scoredImages.filter(s => s.optionalScore >= config.min_optional_score);

  if (validImages.length === 0) {
    log.warn("findBestMatchingImage: No images meet minimum requirements", {
      criteria,
      totalImages: images.length,
      scoredImages: scoredImages.length,
      minOptionalScore: config.min_optional_score
    });
    return null;
  }

  // Sort by score (highest first), then by primary flag, then by sort order
  validImages.sort((a, b) => {
    // Higher score wins
    if (a.score !== b.score) {
      return b.score - a.score;
    }

    // Primary images first
    if (a.image.is_primary !== b.image.is_primary) {
      return b.image.is_primary ? 1 : -1;
    }

    // Lower sort_order first
    return (a.image.sort_order || 0) - (b.image.sort_order || 0);
  });

  const result = validImages[0];

  log.debug("findBestMatchingImage", {
    criteria,
    totalImages: images.length,
    scoredImages: scoredImages.length,
    validImages: validImages.length,
    bestMatch: {
      imageId: result.image.image_id,
      filename: result.image.image?.filename,
      score: result.score,
      optionalScore: result.optionalScore
    }
  });

  return result.image;
}

/**
 * Check if all required fields match
 */
function checkRequiredFields(
  image: ProductDefinitionImage_Image,
  criteria: ImageMatchCriteria,
  config: ImageMatchConfig
): boolean {
  for (const field of config.required_fields) {
    const imageValue = image[field as keyof ProductDefinitionImage_Image];
    const criteriaValue = criteria[field];

    // Handle NULL cases based on configuration
    if (imageValue === null || imageValue === undefined) {
      if (!config.null_behavior.image_null_is_wildcard) {
        // NULL in image only matches NULL in criteria
        if (criteriaValue !== null && criteriaValue !== undefined) {
          return false;
        }
      }
      // If image_null_is_wildcard is true, NULL matches anything
    } else if (criteriaValue === null || criteriaValue === undefined) {
      if (!config.null_behavior.offering_null_accepts_all) {
        // NULL in criteria only matches NULL in image
        return false;
      }
      // If offering_null_accepts_all is true, NULL accepts anything
    } else if (imageValue !== criteriaValue) {
      // Both have values, they must match
      return false;
    }
  }

  return true;
}

/**
 * Calculate matching score for optional fields
 */
function calculateOptionalScore(
  image: ProductDefinitionImage_Image,
  criteria: ImageMatchCriteria,
  config: ImageMatchConfig
): number {
  let score = 0;
  let maxScore = 0;

  for (const [field, weight] of Object.entries(config.optional_fields)) {
    maxScore += weight;

    const imageValue = image[field as keyof ProductDefinitionImage_Image];
    const criteriaValue = criteria[field as keyof ImageMatchCriteria];

    // Handle NULL cases
    if (imageValue === null || imageValue === undefined) {
      if (config.null_behavior.image_null_is_wildcard) {
        // NULL in image matches anything
        score += weight;
      } else if (criteriaValue === null || criteriaValue === undefined) {
        // Both are NULL
        score += weight;
      }
    } else if (criteriaValue === null || criteriaValue === undefined) {
      if (config.null_behavior.offering_null_accepts_all) {
        // NULL in criteria accepts anything
        score += weight;
      }
    } else if (imageValue === criteriaValue) {
      // Exact match
      score += weight;
    }
    // Special case for size matching (partial match)
    else if (field === 'size' && typeof imageValue === 'string' && typeof criteriaValue === 'string') {
      // Check if size is included in range (e.g., "S" matches "S-M")
      if (imageValue.includes(criteriaValue) || criteriaValue.includes(imageValue)) {
        score += weight * 0.5; // Partial score for partial match
      }
    }
  }

  return maxScore > 0 ? score / maxScore : 0;
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