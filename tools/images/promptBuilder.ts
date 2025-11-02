// File: tools/images/promptBuilder.ts

/**
 * Builds fal.ai prompts from offering data
 *
 * Generates prompts like:
 * "Professional product photography, rose quartz, sphere, 5cm, polished,
 *  white background, studio lighting, high detail, e-commerce style"
 */

import { assertDefined } from "$lib/utils/assertions.js";
import type {
  WholesalerItemOffering,
  ProductDefinition,
  Material,
  Form,
  SurfaceFinish,
  ConstructionType,
  ProductType,
} from "../../src/lib/domain/domainTypes.js";
import type { ImageGenerationConfig } from "./generateMissingImages.config.js";
import type { OfferingWithGenerationPlan, OfferingWithGenPlanAndImage } from "./generateMissingImages.js";

export function buildPrompt(item: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]) {
  assertDefined(item, "item");
  return _buildPrompt(item.offering, null, item.material, item.form, item.surface_finish, item.construction_type, item.product_type, config);
}

/**
 * Builds a fal.ai prompt from offering and lookup data
 */
function _buildPrompt(
  offering: WholesalerItemOffering,
  productDef: ProductDefinition | null,
  material: Material | null,
  form: Form | null,
  surfaceFinish: SurfaceFinish | null,
  constructionType: ConstructionType | null,
  productType: ProductType | null,
  config: ImageGenerationConfig["prompt"],
): string {
  const parts: string[] = [];

  // 1. Base style prefix
  if (config.style === "product_photography") {
    parts.push("Professional product photography");
  } else if (config.style === "realistic") {
    parts.push("Realistic product render");
  } else if (config.style === "artistic") {
    parts.push("Artistic product visualization");
  }

  // 2. Product Type (e.g., "bracelet", "necklace", "pendant")
  if (productType?.name) {
    parts.push(productType.name.toLowerCase());
  }

  // 3. Material
  if (material?.name) {
    const materialText = material.name.toLowerCase();
    parts.push(materialText);
  }

  // 4. Form
  if (form?.name) {
    parts.push(form.name.toLowerCase());
  }

  // 5. Size (if available)
  if (offering?.size) {
    parts.push(offering.size.toLowerCase());
  }

  // 6. Surface finish
  if (surfaceFinish?.name) {
    parts.push(surfaceFinish.name.toLowerCase());
  }

  // 7. Construction type (if relevant)
  if (constructionType?.name) {
    parts.push(constructionType.name.toLowerCase());
  }

  // 8. Color variant (if specified)
  if (offering?.color_variant) {
    parts.push(`${offering.color_variant.toLowerCase()} variant`);
  }

  // 9. Background setting
  parts.push(`${config.background} background`);

  // 10. Quality keywords
  if (config.style === "product_photography") {
    parts.push("studio lighting");
    parts.push("high detail");
    parts.push("e-commerce style");
    parts.push("professional quality");
  } else if (config.style === "realistic") {
    parts.push("photorealistic");
    parts.push("natural lighting");
    parts.push("high resolution");
  } else if (config.style === "artistic") {
    parts.push("beautiful composition");
    parts.push("aesthetic");
  }

  // 11. Optional: Metaphysical properties (use sparingly!)
  if (config.include_metaphysical && material) {
    // This is very experimental and may not produce good results
    // Only enable if you want more abstract/spiritual imagery
    // parts.push("healing energy", "spiritual properties");
  }

  // Join all parts with commas
  return parts.join(", ");
}

