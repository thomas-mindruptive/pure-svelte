import * as path from "path";
import type { OfferingWithGenerationPlan } from "./imageGenTypes";
import { assertions, log as LogNS } from "@pure/svelte/utils";

const log = LogNS.log;

/**
 * Generates a canonical filename for the generated image
 * 
 * ⚠️ NO TIMESTAMP - Same attributes = Same filename (for reusability!)
 * 
 * Format: {form-eng}_{surface-eng?}_{construction-eng?}_{color?}_{size?}.png
 * Examples:
 *   - sphere_polished_l.png
 *   - obelisk-wand_m.png
 *   - beaded_polished-beads_s.png
 *   - heart-shaped_red-color.png
 */
export function generateImageFilename(offering: OfferingWithGenerationPlan): string {
  log.debug(`generateImageFilename: offering: ${offering.offeringId}`);

  assertions.assertDefined(offering, "offering");
  
  const offeringDescription = `${offering.offeringId} - ${offering.offeringTitle}`;

  const parts: string[] = [];
  
  // 1. Form (required, English)
  assertions.assertDefined(offering.formEng, `offering.formEng - ${offeringDescription}`);
  parts.push(sanitizeForFilename(offering.formEng));

  // 2. Surface Finish (optional, English)
  if (offering.surfaceFinishEng) {
    parts.push(sanitizeForFilename(offering.surfaceFinishEng));
  }

  // 3. Construction Type (optional, English) - for necklaces/bracelets
  if (offering.constructionTypeEng) {
    parts.push(sanitizeForFilename(offering.constructionTypeEng));
  }

  // 4. Color Variant (optional)
  if (offering.offeringColorVariant) {
    parts.push(sanitizeForFilename(offering.offeringColorVariant + "-color"));
  }

  // 5. Size (optional)
  if (offering.offeringSize) {
    parts.push(sanitizeForFilename(offering.offeringSize));
  }

  return parts.join("_") + ".png";
}

/**
 * Generate the absolute directory name (English names only!)
 * 
 * Format: {baseDir}/{productType-eng}/{material-eng}/
 * Examples:
 *   - C:\dev\pureenergyworks\generated-images\semi-precious-stone\amethyst\
 *   - C:\dev\pureenergyworks\generated-images\necklace\rose-quartz\
 * 
 * @param baseDir Base directory for generated images
 * @param offering Offering with generation plan
 * @returns Absolute directory path
 */
export function genAbsImgDirName(baseDir: string, offering: OfferingWithGenerationPlan) {
  log.debug(`genAbsImgDirName: offering: ${offering.offeringId}`);

  assertions.assertDefined(baseDir, "baseDir");
  assertions.assertDefined(offering, "offering");

  const offeringDescription = `${offering.offeringId} - ${offering.offeringTitle}`;

  const parts: string[] = [];
  
  // 1. Product Type (English)
  assertions.assertDefined(offering.productTypeEng, `offering.productTypeEng - ${offeringDescription}`);
  parts.push(sanitizeForFilename(offering.productTypeEng));
  
  // 2. Material (English)
  assertions.assertDefined(offering.materialEng, `offering.materialEng - ${offeringDescription}`);
  parts.push(sanitizeForFilename(offering.materialEng));

  const dir = path.join(baseDir, ...parts);
  return dir;
}

/**
 * Sanitizes a string for use in filenames (English-friendly!)
 * - Lowercase
 * - Replace spaces and slashes with hyphens (more readable than underscores)
 * - Remove special characters except hyphens
 * - Collapse multiple hyphens into one
 * - Remove leading/trailing hyphens
 * 
 * Examples:
 *   - "Obelisk - Stab" → "obelisk-stab"
 *   - "Semi-precious Stone" → "semi-precious-stone"
 *   - "Heart Shaped" → "heart-shaped"
 */
function sanitizeForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")        // Spaces → hyphens
    .replace(/\//g, "-")         // Slashes → hyphens  
    .replace(/[^a-z0-9-]/g, "")  // Remove special chars (keep hyphens)
    .replace(/-+/g, "-")         // Multiple hyphens → single hyphen
    .replace(/^-|-$/g, "")       // Remove leading/trailing hyphens
    .substring(0, 50);           // Limit length
}
