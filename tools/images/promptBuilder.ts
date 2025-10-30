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
} from "../../src/lib/domain/domainTypes.js";
import type { ImageGenerationConfig } from "./generateMissingImages.config.js";
import type { OfferingWithGenerationPlan } from "./generateMissingImages.js";

export function buildPrompt(item: OfferingWithGenerationPlan, config: ImageGenerationConfig["prompt"]) {
  assertDefined(item, "item");
  return _buildPrompt(item.offering, null, item.material, item.form, item.surface_finish, item.construction_type, config);
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

  // 2. Material
  if (material?.name) {
    const materialText = material.name.toLowerCase();
    parts.push(materialText);
  }

  // 3. Form
  if (form?.name) {
    parts.push(form.name.toLowerCase());
  }

  // 4. Size (if available)
  if (offering?.size) {
    parts.push(offering.size.toLowerCase());
  }

  // 5. Surface finish
  if (surfaceFinish?.name) {
    parts.push(surfaceFinish.name.toLowerCase());
  }

  // 6. Construction type (if relevant)
  if (constructionType?.name) {
    parts.push(constructionType.name.toLowerCase());
  }

  // 7. Color variant (if specified)
  if (offering?.color_variant) {
    parts.push(`${offering.color_variant.toLowerCase()} variant`);
  }

  // 8. Background setting
  parts.push(`${config.background} background`);

  // 9. Quality keywords
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

  // 10. Optional: Metaphysical properties (use sparingly!)
  if (config.include_metaphysical && material) {
    // This is very experimental and may not produce good results
    // Only enable if you want more abstract/spiritual imagery
    // parts.push("healing energy", "spiritual properties");
  }

  // Join all parts with commas
  return parts.join(", ");
}

/**
 * Generates a filename for the generated image
 *
 * Format: {material}_{form}_{size}_{timestamp}.png
 * Example: rose_quartz_sphere_5cm_1704123456.png
 */
export function generateImageFilename(offering: WholesalerItemOffering, material: Material | null, form: Form | null): string {
  const parts: string[] = [];

  // Material (sanitized)
  if (material) {
    parts.push(sanitizeForFilename(material.name));
  } else {
    parts.push("unknown_material");
  }

  // Form (sanitized)
  if (form) {
    parts.push(sanitizeForFilename(form.name));
  } else {
    parts.push("unknown_form");
  }

  // Size (if available, sanitized)
  if (offering.size) {
    parts.push(sanitizeForFilename(offering.size));
  }

  // Timestamp for uniqueness
  const timestamp = Date.now();
  parts.push(timestamp.toString());

  return parts.join("_") + ".png";
}

/**
 * Sanitizes a string for use in filenames
 * - Lowercase
 * - Replace spaces with underscores
 * - Remove special characters
 */
function sanitizeForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .substring(0, 50); // Limit length
}
