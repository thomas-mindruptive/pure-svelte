/**
 * @file createFingerprint.ts
 * @description Utility function for creating stable hash fingerprints from object properties
 */

import * as crypto from 'crypto';

/**
 * Creates a stable hash fingerprint from an object and a list of keys.
 * 
 * - Null/undefined values are converted to empty strings
 * - Strings are trimmed and lowercased
 * - Numbers are converted to strings
 * - Keys are processed in the order provided (no sorting)
 * - Result is a deterministic string of "key=value" pairs separated by "|"
 * - Final hash is MD5 hex string
 * 
 * @param obj - The object to create a fingerprint from
 * @param keys - Array of keys to include in the fingerprint (in order)
 * @returns MD5 hash hex string
 * 
 * @example
 * const obj = { material_id: 1, form_id: 2, size: "M" };
 * const keys = ["material_id", "form_id", "size"] as const;
 * const fingerprint = createFingerprint(obj, keys);
 */
export function createFingerprint<T extends object>(
  obj: T,
  keys: readonly (keyof T)[],
): string {
  const parts: string[] = [];

  for (const key of keys) {
    const value = obj[key];
    
    // Handle null/undefined
    if (value === null || value === undefined) {
      parts.push(`${String(key)}=`);
      continue;
    }
    
    // Handle strings: trim and lowercase
    if (typeof value === 'string') {
      parts.push(`${String(key)}=${value.trim().toLowerCase()}`);
      continue;
    }
    
    // Handle numbers: convert to string
    if (typeof value === 'number') {
      parts.push(`${String(key)}=${value.toString()}`);
      continue;
    }
    
    // For other types, convert to string
    parts.push(`${String(key)}=${String(value)}`);
  }

  // Build deterministic string
  const fingerprintString = parts.join('|');
  
  // Create MD5 hash
  const hash = crypto.createHash('md5');
  hash.update(fingerprintString);
  return hash.digest('hex');
}
