import { assertDefined } from "$lib/utils/assertions";
import type { OfferingWithGenerationPlan } from "./generateMissingImages";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Generates a filename for the generated image
 *
 * Format: {material}_{form}_{size}_{timestamp}.png
 * Example: rose_quartz_sphere_5cm_1704123456.png
 */
export function generateImageFilename(item: OfferingWithGenerationPlan): string {
  const parts: string[] = [];

  const prodType = item.product_type;
  const offering = item.offering;
  const material = item.offering.material;
  const form = item.offering.form;
  const constructionType = item.construction_type;

  if (prodType) {
    parts.push(sanitizeForFilename(prodType.name));
  } else {
    parts.push("unk-prodType");
  }

  if (material) {
    parts.push(sanitizeForFilename(material.name));
  } else {
    parts.push("unk-mat");
  }

  if (form) {
    parts.push(sanitizeForFilename(form.name));
  } else {
    parts.push("unk-form");
  }

  if (constructionType) {
    parts.push(sanitizeForFilename(constructionType.name));
  } else {
    parts.push("unk-ctype");
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

export function genAbsImgDirName(baseDir: string, item: OfferingWithGenerationPlan) {
  assertDefined(baseDir, "baseDir");
  assertDefined(item, "item");

  const parts: string[] = [];
  const prodType = item.product_type;
  const material = item.offering.material;
  const form = item.offering.form;

  if (prodType) {
    parts.push(sanitizeForFilename(prodType.name));
  } else {
    parts.push("unk-prodType");
  }

  if (material) {
    parts.push(sanitizeForFilename(material.name));
  } else {
    parts.push("unk-mat");
  }

  if (form) {
    parts.push(sanitizeForFilename(form.name));
  } else {
    parts.push("unk-form");
  }

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
