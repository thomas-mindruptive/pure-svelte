// File: src/lib/backendQueries/imageMatching.ts

/**
 * Image Matching Logic for Offerings
 *
 * Finds the best matching image for an offering based on variant properties.
 * Used primarily for Shopify upload and AI image generation to select the correct image for each offering.
 *
 * IMPORTANT: Images are only matched within the same product_def_id!
 */

import type { ProductDefinitionImage_Image, Wio_pdef_mat_form_surf_constr_Nested } from "$lib/domain/domainTypes";
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

  /**
   * Size matching score multipliers
   */
  size_matching_scores?: {
    exact_match: number;           // e.g., "S" == "S" or "S-M" == "S-M"
    single_in_range: number;       // e.g., "S" in "S-M"
    range_fully_covered: number;   // e.g., "S-M" fully in "S-L"
    range_overlap_high: number;    // e.g., >=50% overlap
    range_overlap_low: number;     // e.g., <50% overlap
  };

  /**
   * Enable verbose logging for debugging
   */
  verbose_logging?: boolean;
}

/**
 * Default configuration for image matching
 */
export const DEFAULT_MATCH_CONFIG: ImageMatchConfig = {
  required_fields: ['material_id'], // Material MUST match
  optional_fields: {
    form_id: 0.3,
    surface_finish_id: 0.25,
    construction_type_id: 0.2,
    color_variant: 0.15,
    size: 0.1
  },
  min_optional_score: 0.5, // At least 50% of optional fields should match
  null_behavior: {
    image_null_is_wildcard: false, // NULL in image is NOT a wildcard anymore!
    offering_null_accepts_all: true // NULL in offering accepts any value
  },
  size_matching_scores: {
    exact_match: 1.0,           // "S" == "S" or "S-M" == "S-M" (100%)
    single_in_range: 0.8,       // "S" in "S-M" (80%)
    range_fully_covered: 0.9,   // "S-M" fully in "S-L" (90%)
    range_overlap_high: 0.6,    // >=50% overlap (60%)
    range_overlap_low: 0.3      // <50% overlap (30%)
  },
  verbose_logging: false
};

/**
 * Criteria for matching images to offerings.
 * Extracted from offering or manually specified.
 * Note: product_type is NOT included as it's not a variant field -
 * all images within a product_def share the same product_type via category.
 */
export interface ImageMatchCriteria {
  material_id?: number | null;
  form_id?: number | null;
  surface_finish_id?: number | null;
  construction_type_id?: number | null;
  color_variant?: string | null;
  size?: string | null; // From offering.size (maps to image.size_range)
}

/**
 * Type-safe mapping between criteria fields and image fields
 * Most fields have the same name, except size->size_range
 */
const CRITERIA_TO_IMAGE_FIELD_MAP: Record<keyof ImageMatchCriteria, keyof ProductDefinitionImage_Image> = {
  material_id: 'material_id',
  form_id: 'form_id',
  surface_finish_id: 'surface_finish_id',
  construction_type_id: 'construction_type_id',
  color_variant: 'color_variant',
  size: 'size_range', // This is the special mapping!
} as const;

/**
 * Type-safe helper to get image field value based on criteria field name
 */
function getImageFieldValue(
  image: ProductDefinitionImage_Image,
  criteriaField: keyof ImageMatchCriteria
): any {
  const imageField = CRITERIA_TO_IMAGE_FIELD_MAP[criteriaField];
  return image[imageField];
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
  const result = findBestMatchingImageWithScore(criteria, images, config);
  return result?.image || null;
}

/**
 * Finds the best matching image and returns both the image and its match score.
 *
 * @param criteria - Offering properties to match against
 * @param images - Available Product Definition Images (from SAME product_def)
 * @param config - Matching configuration (optional, uses DEFAULT_MATCH_CONFIG if not provided)
 * @returns Object with image and score, or null if no suitable match found
 */
export function findBestMatchingImageWithScore(
  criteria: ImageMatchCriteria,
  images: ProductDefinitionImage_Image[],
  config: ImageMatchConfig = DEFAULT_MATCH_CONFIG
): { image: ProductDefinitionImage_Image; score: number } | null {
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

  return { image: result.image, score: result.score };
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
    const imageValue = getImageFieldValue(image, field);
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

    const imageValue = getImageFieldValue(image, field as keyof ImageMatchCriteria);
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
    // Special case for size matching with configurable scores
    else if (field === 'size' && typeof imageValue === 'string' && typeof criteriaValue === 'string') {
      const sizeScores = config.size_matching_scores || DEFAULT_MATCH_CONFIG.size_matching_scores!;

      // Size order mapping
      const SIZE_ORDER: Record<string, number> = {
        'XS': 0,
        'S': 1,
        'M': 2,
        'L': 3,
        'XL': 4,
        'XXL': 5
      };

      // Parse size or range into min/max values
      const parseRange = (size: string): { min: number; max: number; str: string } | null => {
        if (size.includes('-')) {
          const [minStr, maxStr] = size.split('-');
          const min = SIZE_ORDER[minStr];
          const max = SIZE_ORDER[maxStr];
          return (min !== undefined && max !== undefined) ? { min, max, str: size } : null;
        } else {
          const order = SIZE_ORDER[size];
          return (order !== undefined) ? { min: order, max: order, str: size } : null;
        }
      };

      const imageRange = parseRange(imageValue);
      const criteriaRange = parseRange(criteriaValue);

      if (imageRange && criteriaRange) {
        let matchScore = 0;
        let matchType = '';

        // 1. Exact match
        if (imageValue === criteriaValue) {
          matchScore = sizeScores.exact_match;
          matchType = 'exact_match';
        }
        // 2. Single size in range
        else if (criteriaRange.min === criteriaRange.max) {
          if (criteriaRange.min >= imageRange.min && criteriaRange.min <= imageRange.max) {
            matchScore = sizeScores.single_in_range;
            matchType = 'single_in_range';
          }
        }
        // 3. Range vs Range
        else {
          const overlapStart = Math.max(imageRange.min, criteriaRange.min);
          const overlapEnd = Math.min(imageRange.max, criteriaRange.max);

          if (overlapStart <= overlapEnd) {
            const overlapSize = overlapEnd - overlapStart + 1;
            const criteriaSize = criteriaRange.max - criteriaRange.min + 1;
            const overlapPercent = overlapSize / criteriaSize;

            if (overlapPercent >= 1.0) {
              matchScore = sizeScores.range_fully_covered;
              matchType = 'range_fully_covered';
            } else if (overlapPercent >= 0.5) {
              matchScore = sizeScores.range_overlap_high;
              matchType = `range_overlap_high (${Math.round(overlapPercent * 100)}%)`;
            } else {
              matchScore = sizeScores.range_overlap_low;
              matchType = `range_overlap_low (${Math.round(overlapPercent * 100)}%)`;
            }
          }
        }

        if (matchScore > 0) {
          score += weight * matchScore;
          if (config.verbose_logging) {
            log.debug(`Size matching: criteria="${criteriaValue}" vs image="${imageValue}" -> ${matchType} (score: ${matchScore})`);
          }
        } else if (config.verbose_logging) {
          log.debug(`Size matching: criteria="${criteriaValue}" vs image="${imageValue}" -> no match`);
        }
      }
    }
  }

  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Convenience: Extracts matching criteria from an Offering.
 *
 * COALESCE logic: If offering doesn't have a value, inherit from product_def.
 *
 * @param offering - Wholesaler Item Offering (with product_def nested)
 * @returns ImageMatchCriteria for use with findBestMatchingImage
 */
export function extractMatchCriteriaFromOffering(
  offering: Wio_pdef_mat_form_surf_constr_Nested
): ImageMatchCriteria {
  return {
    material_id: offering.material_id ?? offering.product_def.material_id ?? null,
    form_id: offering.form_id ?? offering.product_def.form_id ?? null,
    surface_finish_id: offering.surface_finish_id ?? offering.product_def.surface_finish_id ?? null,
    construction_type_id: offering.construction_type_id ?? offering.product_def.construction_type_id ?? null,
    color_variant: offering.color_variant ?? null,
    size: offering.size ?? null,
  };
}