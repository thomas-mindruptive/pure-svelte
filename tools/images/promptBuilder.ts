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
import type { OfferingWithGenerationPlan } from "./imageGenTypes.js";

export function buildPrompt(item: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]) {
  assertDefined(item, "item");
  return _buildPrompt(
    item.offeringId,
    item.offeringSize,
    null,
    item.finalMaterialName,
    item.finalFormName,
    item.finalSurfaceFinishName,
    item.finalConstructionTypeName,
    item.productTypeName,
    null,
    config,
  );
}

/**
 * Builds a fal.ai prompt from offering and lookup data
 */
function _buildPrompt(
  offeringId: number,
  size: string | null | undefined,
  productDef: string | null,
  material: string | null| undefined,
  form: string | null| undefined,
  surfaceFinish: string | null| undefined,
  constructionType: string | null| undefined,
  productType: string | null| undefined,
  color: string | null| undefined,
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
  if (productType) {
    parts.push(productType.toLowerCase());
  }

  // 3. Material
  if (material) {
    const materialText = material.toLowerCase();
    parts.push(materialText);
  }

  // 4. Form
  if (form) {
    parts.push(form.toLowerCase());
  }

  // 5. Size (if available)
  if (size) {
    switch (size) {
      case "XS":
        parts.push(`'size extra small'`);
        break;
      case "S":
        parts.push(`'size small'`);
        break;
      case "M":
        parts.push(`'size medium'`);
        break;
      case "L":
        parts.push(`'size extra large'`);
        break;
      case "XL":
        parts.push(`'size extra large'`);
        break;
      case "XXL":
        parts.push(`'size extra-extra large'`);
        break;
      case "XS-S":
        parts.push(`'size small'`);
        break;
      case "XS-M":
        parts.push(`'size medium'`);
        break;
      case "XS-L":
        parts.push(`'size large'`);
        break;
      case "XS-XL":
        parts.push(`'size large'`);
        break;
      case "XS-XXL":
        parts.push(`'size large'`);
        break;
      case "S-M":
        parts.push(`'size medium'`);
        break;
      case "S-L":
        parts.push(`'size large'`);
        break;
      case "S-XL":
        parts.push(`'size large'`);
        break;
      case "S-XXL":
        parts.push(`'size large'`);
        break;
      case "M-L":
        parts.push(`'size large'`);
        break;
      case "M-XL":
        parts.push(`'size large'`);
        break;
      case "M-XXL":
        parts.push(`'size large'`);
        break;
      case "L-XL":
        parts.push(`'size extra large'`);
        break;
      case "L-XXL":
        parts.push(`'size extra large'`);
        break;
      case "XL-XXL":
        parts.push(`'size extra large'`);
        break;
      default:
        throw new Error(`Invalid size in offering: ${offeringId}`);
    }
  }

  // 6. Surface finish
  if (surfaceFinish) {
    parts.push(surfaceFinish.toLowerCase());
  }

  // 7. Construction type (if relevant)
  if (constructionType) {
    parts.push(constructionType.toLowerCase());
  }

  // 8. Color variant (if specified)
  if (color) {
    parts.push(`${color.toLowerCase()}`);
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
