import { TableRegistry } from "$lib/backendQueries/tableRegistry";
import { log } from "$lib/utils/logger";
import z from "zod";
import { WholesalerSchema } from "./domainTypes";

/**
   * Utility: Generate qualified column names from an array of schemas using TableRegistry
   * @param schemas - Array of Zod schemas
   * @returns Array of qualified column names like ["ord.order_id", "ori.order_item_id", ...]
   */
  export function genQualifiedColumns(schemas: z.ZodObject<any>[]): string[] {
    const columns: string[] = [];

    for (const schema of schemas) {
      // Find matching table config by schema reference
      const tableEntry = Object.entries(TableRegistry).find(([, config]) => config.schema === schema);

      if (!tableEntry) {
        throw new Error(`Schema not found in TableRegistry: ${schema.description || 'unnamed schema'}`);
      }

      const [, config] = tableEntry;
      const alias = config.alias;
      const schemaKeys = schema.keyof().options;

      // Add all columns with alias prefix
      columns.push(...schemaKeys.map((key: string) => `${alias}.${key}`));
    }

    return columns;
  }
// ===== UTILS =====
/**
 * ValidationResultFor represents the outcome of validating data
 * against a specific Zod schema.
 *
 * Understanding `z.output<S>`:
 * ---------------------------------------
 * - A Zod schema describes what a valid object should look like.
 * - `z.output<S>` is the exact **TypeScript type of the object you
 *   get back after Zod has successfully checked and cleaned it**.
 * - Think of it as “the final, trustworthy data” after validation.
 *   For example, if the schema says there must be
 *     { id: number; name: string }
 *   then `z.output<S>` is exactly { id: number; name: string }.
 *
 * The type below is a union of two cases:
 * 1. **Success**:
 *      - `isValid` is true.
 *      - `sanitized` contains the cleaned data with the type
 *        guaranteed by the schema (`z.output<S>`).
 *      - `errors` is an empty object.
 * 2. **Failure**:
 *      - `isValid` is false.
 *      - `errors` holds error messages for each field (and optional
 *        global errors).
 *      - `sanitized` is undefined because there is no valid data.
 */


export type ValidationResultFor<S extends z.ZodTypeAny> = {
  isValid: true;
  errors: Record<string, never>;
  sanitized: z.output<S>;
} |
{
  isValid: false;
  errors: Record<string, string[]>;
  sanitized: undefined;
};
/**
 * Validate any input against a given Zod schema.
 *
 * @param schema  The Zod schema describing the required shape of the data.
 * @param data    The raw input to check.
 * @returns       A ValidationResultFor<S>:
 *                  - On success: { isValid: true, sanitized: cleaned data }
 *                  - On failure: { isValid: false, errors: detailed messages }
 */

export function validateEntity<S extends z.ZodTypeAny>(schema: S, data: unknown): ValidationResultFor<S> {
  const res = schema.safeParse(data);
  const validationResult = toValidationResult(res);
  log.debug(`Validated through ${schema.description}`, validationResult);
  return validationResult;
}
/**
 * Convert the result of schema.safeParse into our unified ValidationResultFor<S>.
 *
 * - Uses `z.flattenError` (the Zod v4 helper) to collect
 *   both field-specific errors and form-level (“global”) errors.
 */

export function toValidationResult<S extends z.ZodTypeAny>(result: z.ZodSafeParseResult<z.output<S>>): ValidationResultFor<S> {
  if (result.success) {
    return {
      isValid: true,
      errors: {} as Record<string, never>,
      sanitized: result.data,
    };
  }
  const { fieldErrors, formErrors } = z.flattenError(result.error);

  // Ensure we only keep fields that actually have messages
  const errors: Record<string, string[]> = {};
  for (const [key, arr] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
    if (arr && arr.length) errors[key] = arr;
  }

  // Global errors (not tied to a specific field) are stored under "_root"
  if (formErrors.length) errors._root = formErrors;

  return {
    isValid: false,
    errors,
    sanitized: undefined,
  };
}
// Sample usage
const validationResult = validateEntity(WholesalerSchema, {});
const sanitized = validationResult.sanitized;
void sanitized;
