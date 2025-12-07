// File: tools/images/promptBuilder.ts

/**
 * Builds fal.ai prompts from offering data
 *
 * Generates natural language prompts optimized for AI image generation
 * Example: "A polished amazonite obelisk wand, small size. Professional product photography on white background, studio lighting, sharp detail."
 */

import { assertDefined } from "$lib/utils/assertions.js";
import { assertions } from "$lib/utils/index.js";
import type { ImageGenerationConfig } from "./generateMissingImages.config.js";
import type { Lookups, OfferingWithGenerationPlan } from "./imageGenTypes.js";

/**
 * Product-specific prompt builder function type
 */
type PromptBuilder = (offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]) => string;

/**
 * Product type specific prompt builders (ID-based)
 */
const PRODUCT_TYPE_BUILDERS: Record<number, PromptBuilder> = {
  1: buildNecklacePrompt,           // Necklace
  2: buildBraceletPrompt,           // Bracelet
  3: buildStandStonePrompt,         // Stand/Table Stone
  4: buildPendulumPrompt,           // Pendulum
  5: buildWaterEnergizerPrompt,     // Water Energizer
  6: buildGeometricFormPrompt,      // Geometric Esoteric Form
  7: buildHandStonePrompt,          // Hand Stone
  8: buildPendantPrompt,            // Pendant
  9: buildBottlePrompt,             // Powder
  10: buildBottlePrompt,            // Tincture
  11: buildSemiPreciousStonePrompt, // Semi-precious Stone
  12: buildFigurePrompt,            // Figure
  13: buildMassageStickPrompt,      // Massage Stick/Stylus
  14: buildStandPrompt,             // Stand
  15: buildBottlePrompt,            // Capsule
  16: buildBottlePrompt,            // Cream
  17: buildBottlePrompt,            // Oil
  18: buildBottlePrompt,            // Serum
  19: buildChainBandPrompt,         // Chain/Band
};

/**
 * Main entry point - builds prompt for any offering
 */
export function buildPrompt(
  offering: OfferingWithGenerationPlan,
  config: ImageGenerationConfig["prompt"],
  lookups: Lookups
): string {
  assertDefined(offering, "offering");
  
  const offeringDescription = `${offering.offeringId} - ${offering.offeringTitle}`;
  assertions.assertDefined(offering.productTypeName, `offering.productTypeName - ${offeringDescription}`);
  assertions.assertDefined(offering.productTypeId, `offering.productTypeId - ${offeringDescription}`);
  assertions.assertDefined(offering.finalFormName, `offering.finalFormName - ${offeringDescription}`);
  assertions.assertDefined(offering.finalMaterialName, `offering.finalMaterialName - ${offeringDescription}`);

  // Get product-specific builder
  const builder = PRODUCT_TYPE_BUILDERS[offering.productTypeId];
  if (!builder) {
    // Fallback to generic builder if product type not found
    return buildGenericPrompt(offering, config);
  }

  // Build main object description
  const objectDescription = builder(offering, config);

  // Add size if present
  const sizeText = getSizeText(offering.offeringSize);
  const withSize = sizeText ? `${objectDescription}, ${sizeText}` : objectDescription;

  // Add color variant if present
  const withColor = offering.offeringColorVariant 
    ? `${withSize}, ${offering.offeringColorVariant.toLowerCase()} color` 
    : withSize;

  // Add custom prompt hint if present
  const withHint = offering.offeringImagePromptHint
    ? `${withColor}. ${offering.offeringImagePromptHint}`
    : withColor;

  // Add photography context
  const photoContext = buildPhotoContext(config);

  return `${withHint}. ${photoContext}`;
}

/**
 * Get material text - handles material_mixture_en for mixed materials
 */
function getMaterialText(offering: OfferingWithGenerationPlan): string {
  // If material_id = 2 (Semi-precious Stone) and mixture is defined, use mixture
  if (offering.finalMaterialId === 2 && offering.offeringMaterialMixtureEn) {
    // Normalize: remove extra spaces, trim spaces around commas
    return offering.offeringMaterialMixtureEn
      .toLowerCase()
      .replace(/\s*,\s*/g, ', ')      // Normalize spaces around commas: ", " 
      .replace(/\s+/g, ' ')            // Replace multiple spaces with single space
      .trim();
  }
  
  assertions.assertDefined(offering.materialEng, `materialEng for offering ${offering.offeringId}`);
  return offering.materialEng.toLowerCase();
}

/**
 * Convert size code to natural language
 */
function getSizeText(size: string | null | undefined): string | null {
  if (!size) return null;

  const sizeMap: Record<string, string> = {
    "XS": "extra small size",
    "S": "small size",
    "M": "medium size",
    "L": "large size",
    "XL": "extra large size",
    "XXL": "extra-extra large size",
    // Ranges - use middle value
    "XS-S": "small size",
    "XS-M": "medium size",
    "XS-L": "large size",
    "XS-XL": "large size",
    "XS-XXL": "large size",
    "S-M": "medium size",
    "S-L": "large size",
    "S-XL": "large size",
    "S-XXL": "large size",
    "M-L": "large size",
    "M-XL": "large size",
    "M-XXL": "large size",
    "L-XL": "extra large size",
    "L-XXL": "extra large size",
    "XL-XXL": "extra large size",
  };

  return sizeMap[size] || null;
}

/**
 * Build photography context (background, lighting, style)
 */
function buildPhotoContext(config: ImageGenerationConfig["prompt"]): string {
  const parts: string[] = [];

  if (config.style === "product_photography") {
    parts.push("Professional product photography");
  } else if (config.style === "realistic") {
    parts.push("Realistic product render");
  } else if (config.style === "artistic") {
    parts.push("Artistic product visualization");
  }

  parts.push(`on ${config.background} background`);

  if (config.style === "product_photography") {
    parts.push("studio lighting");
    parts.push("sharp detail");
  } else if (config.style === "realistic") {
    parts.push("natural lighting");
    parts.push("high resolution");
  } else if (config.style === "artistic") {
    parts.push("beautiful composition");
  }

  return parts.join(", ");
}

// ===== PRODUCT-SPECIFIC BUILDERS =====

function buildNecklacePrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const construction = offering.constructionTypeEng?.toLowerCase() || "beaded";
  const surface = offering.surfaceFinishEng?.toLowerCase();
  
  // Only add surface description if explicitly set
  const beadDescription = surface ? `${surface} beads` : "beads";
  return `A ${material} ${construction} necklace with ${beadDescription}`;
}

function buildBraceletPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const construction = offering.constructionTypeEng?.toLowerCase() || "beaded";
  const surface = offering.surfaceFinishEng?.toLowerCase();
  
  // Only add surface description if explicitly set
  const beadDescription = surface ? `${surface} beads` : "beads";
  return `A ${material} ${construction} bracelet with ${beadDescription}`;
}

function buildStandStonePrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "stone";
  
  // Only include surface if explicitly set
  return surface 
    ? `A ${surface} ${material} ${form} display stone`
    : `A ${material} ${form} display stone`;
}

function buildPendulumPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  
  return surface 
    ? `A ${surface} ${material} pendulum`
    : `A ${material} pendulum`;
}

function buildWaterEnergizerPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const form = offering.formEng?.toLowerCase() || "stone";
  
  return `A ${material} water energizing ${form}`;
}

function buildGeometricFormPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "form";
  
  return surface
    ? `A ${surface} ${material} ${form} sacred geometry`
    : `A ${material} ${form} sacred geometry`;
}

function buildHandStonePrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "";
  
  const surfacePrefix = surface ? `${surface} ` : "";
  
  return form 
    ? `A ${surfacePrefix}${material} palm stone ${form}`
    : `A ${surfacePrefix}${material} palm stone`;
}

function buildPendantPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "";
  
  const surfacePrefix = surface ? `${surface} ` : "";
  
  return form
    ? `A ${surfacePrefix}${material} ${form} pendant`
    : `A ${surfacePrefix}${material} pendant`;
}

function buildBottlePrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const productType = offering.productTypeEng?.toLowerCase() || "product";
  
  return `A bottle of ${material} ${productType}`;
}

function buildSemiPreciousStonePrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "stone";
  
  // Only include surface if explicitly set
  return surface
    ? `A ${surface} ${material} ${form}`
    : `A ${material} ${form}`;
}

function buildFigurePrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "";
  
  const surfacePrefix = surface ? `${surface} ` : "";
  
  // Don't add "figurine" if form already contains it (e.g. "angel figurine")
  if (form && form.includes("figurine")) {
    return `A ${surfacePrefix}${material} ${form}`;
  }
  
  return form
    ? `A ${surfacePrefix}${material} ${form} figurine`
    : `A ${surfacePrefix}${material} figurine`;
}

function buildMassageStickPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  
  return surface
    ? `A ${surface} ${material} massage wand`
    : `A ${material} massage wand`;
}

function buildStandPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  
  return `A ${material} display stand`;
}

function buildChainBandPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  
  const beadDescription = surface ? `${surface} beads` : "beads";
  return `A ${material} chain with ${beadDescription}`;
}

/**
 * Generic fallback for unknown product types
 */
function buildGenericPrompt(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]): string {
  const material = getMaterialText(offering);
  const surface = offering.surfaceFinishEng?.toLowerCase();
  const form = offering.formEng?.toLowerCase() || "item";
  
  return surface
    ? `A ${surface} ${material} ${form}`
    : `A ${material} ${form}`;
}
