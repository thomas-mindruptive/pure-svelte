// File: src/lib/backendQueries/offeringImageAnalysis.ts

/**
 * Backend module for analyzing offerings and determining which need AI-generated images.
 *
 * This module orchestrates:
 * - Loading offerings with all lookup data
 * - Finding best matching images for each offering
 * - Classifying match quality
 * - Determining which offerings need image generation
 */

import type { Transaction } from "mssql";
import {
  loadOfferingsForImageAnalysis,
  type ImageAnalysisFilters
} from "./entityOperations/offering.js";
import { loadProductDefinitionImagesWithImage } from "./entityOperations/image.js";
import {
  extractMatchCriteriaFromOffering,
  findBestMatchingImage,
  type ImageMatchCriteria
} from "./imageMatching.js";
import type {
  WholesalerItemOffering,
  ProductDefinition,
  ProductDefinitionImage_Image,
  Material,
  Form,
  SurfaceFinish,
  ConstructionType
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { ComparisonOperator } from "./queryGrammar.js";
import type { ProdDefLog } from "./imageGenTypes.js";

/**
 * Match quality classification
 */
export type MatchQuality = "exact" | "generic_fallback" | "none";

/**
 * Complete analysis result for one offering
 */
export interface OfferingWithImageAnalysis {
  offering: WholesalerItemOffering;
  product_def: ProductDefinition;
  material: Material | null;
  form: Form | null;
  surface_finish: SurfaceFinish | null;
  construction_type: ConstructionType | null;
  available_images: ProductDefinitionImage_Image[];
  best_match: ProductDefinitionImage_Image | null;
  match_quality: MatchQuality;
  needs_generation: boolean;
}

/**
 * Determines the quality of an image match.
 *
 * - "exact": All critical fields match (material, form, surface_finish, construction_type)
 * - "generic_fallback": Generic image with NULL values was used
 * - "none": No image found at all
 */
function determineMatchQuality(
  bestMatch: ProductDefinitionImage_Image | null,
  criteria: ImageMatchCriteria,
  availableImages: ProductDefinitionImage_Image[]
): MatchQuality {
  if (!bestMatch) {
    return "none";
  }

  // Check if this is a generic fallback (image has NULL values)
  const isGeneric =
    (criteria.material_id && !bestMatch.material_id) ||
    (criteria.form_id && !bestMatch.form_id) ||
    (criteria.surface_finish_id && !bestMatch.surface_finish_id) ||
    (criteria.construction_type_id && !bestMatch.construction_type_id);

  if (isGeneric) {
    return "generic_fallback";
  }

  return "exact";
}

/**
 * Analyzes offerings to determine which need AI-generated images.
 *
 * Workflow:
 * 1. Load offerings with all lookup data (material, form, etc.)
 * 2. For each offering:
 *    - Load available images for product_def
 *    - Extract match criteria from offering
 *    - Find best matching image
 *    - Classify match quality
 *    - Determine if generation is needed
 *
 * @param transaction - Active database transaction
 * @param filters - Filter criteria (is_assortment, min_price, etc.)
 * @returns Array of offerings with complete image analysis
 */
export async function analyzeOfferingsForImages(
  transaction: Transaction,
  filters: ImageAnalysisFilters = {},
  verboseLog: ProdDefLog[],
): Promise<OfferingWithImageAnalysis[]> {
  log.info("analyzeOfferingsForImages: Starting analysis", { filters });

  // Step 1: Load offerings with all lookup data
  const offeringsJson = await loadOfferingsForImageAnalysis(transaction, filters);
  const offerings = JSON.parse(offeringsJson) as any[];

  log.info(`analyzeOfferingsForImages: Loaded ${offerings.length} offerings`);

  if (offerings.length === 0) {
    return [];
  }

  // Step 2: Analyze each offering
  const results: OfferingWithImageAnalysis[] = [];

  for (const offering of offerings) {
    try {
      // 2a. Load available images for this product_def
      const imagesJson = await loadProductDefinitionImagesWithImage(
        transaction,
        {
          where: {
            key: "pdi.product_def_id",
            whereCondOp: ComparisonOperator.EQUALS,
            val: offering.product_def_id
          }
        }
      );

      const availableImages = JSON.parse(imagesJson) as ProductDefinitionImage_Image[];

      // 2b. Extract match criteria from offering
      const criteria = extractMatchCriteriaFromOffering(offering as WholesalerItemOffering);

      // 2c. Find best matching image
      const bestMatch = findBestMatchingImage(criteria, availableImages);

      // 2d. Determine match quality
      const matchQuality = determineMatchQuality(bestMatch, criteria, availableImages);

      // 2e. Build analysis result
      results.push({
        offering: offering as WholesalerItemOffering,
        product_def: offering.product_def as ProductDefinition,
        material: offering.material || null,
        form: offering.form || null,
        surface_finish: offering.surface_finish || null,
        construction_type: offering.construction_type || null,
        available_images: availableImages,
        best_match: bestMatch,
        match_quality: matchQuality,
        needs_generation: matchQuality === "none"
      });

      log.debug(`analyzeOfferingsForImages: Analyzed offering ${offering.offering_id}`, {
        offering_id: offering.offering_id,
        match_quality: matchQuality,
        best_match_id: bestMatch?.image_id,
        available_images_count: availableImages.length
      });

    } catch (error) {
      log.error(`analyzeOfferingsForImages: Failed to analyze offering ${offering.offering_id}`, {
        offering_id: offering.offering_id,
        error: String(error)
      });
      // Continue with next offering instead of failing completely
    }
  }

  const needsGenerationCount = results.filter(r => r.needs_generation).length;

  log.info("analyzeOfferingsForImages: Analysis complete", {
    total_offerings: results.length,
    needs_generation: needsGenerationCount,
    exact_matches: results.filter(r => r.match_quality === "exact").length,
    generic_fallbacks: results.filter(r => r.match_quality === "generic_fallback").length,
    no_images: results.filter(r => r.match_quality === "none").length
  });

  return results;
}
