import * as path from "path";
import type { OfferingWithGenerationPlan } from "./imageGenTypes";
import { assertions, log as LogNS } from "@pure/svelte/utils";

const log = LogNS.log;

/**
 * Generates a filename for the generated image
 *
 * Format: {material}_{form}_{size}_{timestamp}.png
 * Example: rose_quartz_sphere_5cm_1704123456.png
 */
export function generateImageFilename(offering: OfferingWithGenerationPlan): string {
  log.debug(`generateImageFilename: offering: ${offering.offeringId}`);

  assertions.assertDefined(offering, "offering");
  
  const offeringDescription = `${offering.offeringId} - ${offering.offeringTitle}`

  const parts: string[] = [];
  assertions.assertDefined(offering.productTypeName, `item.productTypeName`)
  parts.push(sanitizeForFilename(offering.productTypeName));
  assertions.assertDefined(offering.finalMaterialName, `item.finalMaterialName`)
  parts.push(sanitizeForFilename(offering.finalMaterialName));
  assertions.assertDefined(offering.finalFormName, `item.finalFormName`)
  parts.push(sanitizeForFilename(offering.finalFormName));

  // Construction type and size are optional.
  if (offering.finalConstructionTypeName) parts.push(sanitizeForFilename(offering.finalConstructionTypeName));
  if (offering.offeringSize) parts.push(sanitizeForFilename(offering.offeringSize));
  const timestamp = Date.now();
  parts.push(timestamp.toString());
  return parts.join("_") + ".png";
}

/**
 * Generate the absolute directory name.
 * @param baseDir 
 * @param item 
 * @returns 
 */
export function genAbsImgDirName(baseDir: string, offering: OfferingWithGenerationPlan) {
  log.debug(`genAbsImgDirName: offering: ${offering.offeringId}`);

  assertions.assertDefined(baseDir, "baseDir");
  assertions.assertDefined(offering, "offering");

  const parts: string[] = [];
  assertions.assertDefined(offering.productTypeName, "item.productTypeName")
  parts.push(sanitizeForFilename(offering.productTypeName));
  assertions.assertDefined(offering.finalMaterialName, "item.finalMaterialName")
  parts.push(sanitizeForFilename(offering.finalMaterialName));
  assertions.assertDefined(offering.finalFormName, "item.finalFormName")
  const dir = path.join(baseDir, ...parts);
  return dir;
}

/**
 * Sanitizes a string for use in filenames
 * - Replace German umlauts (ä→ae, ö→oe, ü→ue, ß→ss)
 * - Lowercase
 * - Replace spaces with underscores
 * - Remove special characters
 */
function sanitizeForFilename(text: string): string {
  return text
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .substring(0, 50); // Limit length
}
