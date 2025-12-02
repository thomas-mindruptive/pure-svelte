/**
 * @file promptFingerprint.ts
 * @description Domain-specific wrapper for creating prompt fingerprints from branded schemas
 */

import { createFingerprint } from "$lib/utils/createFingerprint";
import type { WithMeta, SchemaMeta } from "$lib/domain/domainTypes";
import type { z } from "zod";

/**
 * Creates a prompt fingerprint from a branded schema and entity data.
 * 
 * Uses the schema's metadata to extract the configured fingerprint keys
 * and calculates a stable hash fingerprint.
 * 
 * @param schema - Branded Zod schema with metadata (created with createSchemaWithMeta)
 * @param entity - Entity data matching the schema
 * @returns Fingerprint hash string, or null if no fingerprint keys are configured
 * 
 * @example
 * const fingerprint = createPromptFingerprint(ImageSchema, imageData);
 */
export function createPromptFingerprint<S extends z.ZodObject<any>>(
  schema: WithMeta<S, SchemaMeta<S>>,
  entity: z.infer<S>,
): string | null {
  // TypeScript now knows that schema.__brandMeta is SchemaMeta<S>
  const meta = schema.__brandMeta;
  const keys = meta.fingerPrintForPromptProps;
  
  if (!keys || keys.length === 0) {
    return null;
  }
  
  return createFingerprint(entity, keys);
}
