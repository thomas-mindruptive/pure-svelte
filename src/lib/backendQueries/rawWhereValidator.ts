// src/lib/backendQueries/rawWhereValidator.ts

/**
 * @file Raw WHERE Clause Validator
 * @description Validates raw SQL WHERE clauses for superuser mode.
 * ⚠️ SECURITY CRITICAL: This allows direct SQL injection - use ONLY for trusted superusers!
 */

import { error } from "@sveltejs/kit";
import { log } from "$lib/utils/logger";

/**
 * Allowed column names from view_offerings_pt_pc_pd
 * Whitelist approach to prevent SQL injection
 */
const ALLOWED_COLUMNS = new Set([
  // Offering columns
  "wioId",
  "wioTitle",
  "wioPrice",
  "wioSize",
  "wioDimensions",
  "wioWeightGrams",
  "wioComment",
  "wioQuality",
  "wioMaterialName",
  "wioFormName",
  "wioConstrTypeName",
  "wioSurfFinishName",

  // Wholesaler columns
  "wsId",
  "wsName",

  // Product Definition columns
  "pdefId",
  "pdefTitle",
  "pdefMatName",
  "pdefFormName",
  "pdConstrTypeName",
  "pdSurfFinName",

  // Category columns
  "pcId",
  "catName",

  // Product Type columns
  "ptId",
  "ptName",
]);

/**
 * Dangerous SQL keywords that should be blocked
 */
const BLOCKED_KEYWORDS = /\b(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|UNION|;|--|\bOR\b.*\bOR\b)/i;

/**
 * Validates a raw WHERE clause for security
 * @param rawWhere - The raw SQL WHERE clause (without "WHERE" keyword)
 * @throws {Error} If validation fails
 */
export function validateRawWhere(rawWhere: string): void {
  if (!rawWhere || rawWhere.trim().length === 0) {
    throw error(400, "rawWhere cannot be empty");
  }

  log.info(`[RAW WHERE VALIDATION] Validating: ${rawWhere}`);

  // 1. Block dangerous keywords
  if (BLOCKED_KEYWORDS.test(rawWhere)) {
    const match = rawWhere.match(BLOCKED_KEYWORDS);
    log.error(`[RAW WHERE VALIDATION] Blocked keyword detected: ${match?.[0]}`);
    throw error(400, `Forbidden SQL keyword detected: ${match?.[0]}`);
  }

  // 2. Extract and validate column names
  // Match patterns like: columnName operator value
  const columnPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[=<>!]+|LIKE|IN|NOT IN|BETWEEN|IS)/gi;
  const matches = [...rawWhere.matchAll(columnPattern)];

  if (matches.length === 0) {
    log.warn(`[RAW WHERE VALIDATION] No valid column patterns found in: ${rawWhere}`);
    throw error(400, "No valid WHERE conditions found");
  }

  for (const match of matches) {
    const columnName = match[1];
    if (!ALLOWED_COLUMNS.has(columnName)) {
      log.error(`[RAW WHERE VALIDATION] Unknown column: ${columnName}. Allowed columns: ${Array.from(ALLOWED_COLUMNS).join(', ')}`);
      throw error(400, `Column '${columnName}' is not allowed. Check the allowed columns list in the filter toolbar.`);
    }
  }

  // 3. Check for suspicious patterns
  const suspiciousPatterns = [
    /['"].*[;].*['"]/, // Semicolon in strings
    /\/\*.*\*\//, // Block comments
    /--/, // Line comments
    /\bxp_/, // Extended stored procedures
    /\bsp_/, // System stored procedures
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(rawWhere)) {
      log.error(`[RAW WHERE VALIDATION] Suspicious pattern detected: ${pattern}`);
      throw error(400, `Suspicious SQL pattern detected`);
    }
  }

  log.info(`[RAW WHERE VALIDATION] ✅ Validation passed`);
}
