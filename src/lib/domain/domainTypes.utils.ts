import type { ITableRegistry, IAliasedTableRegistry } from "$lib/backendQueries/tableRegistry";
import { AliasedTableRegistry } from "$lib/backendQueries/tableRegistry";
import { log } from "$lib/utils/logger";
import z from "zod";
import type { QualifiedColumnsFromSchema } from "./domainTypes.derived";
import { OrderItem_ProdDef_Category_Schema } from "./domainTypes";


/**
 * Utility: Generate qualified column names from an array of schemas using TableRegistry
 * @param schemas - Array of Zod schemas
 * @param tableRegistry - Registry mapping entity names to table definitions
 * @returns Array of qualified column names like ["ord.order_id", "ori.order_item_id", ...]
 */
export function genQualifiedColumnsForSchemas(schemas: z.ZodObject<any>[], tableRegistry: ITableRegistry): string[] {
  const columns: string[] = [];

  for (const schema of schemas) {
    // Find matching table config by schema reference
    const tableEntry = Object.entries(tableRegistry).find(([, config]) => config.schema === schema);

    if (!tableEntry) {
      throw new Error(`Schema not found in TableRegistry: ${schema.description || "unnamed schema"}`);
    }

    const [, config] = tableEntry;
    const alias = config.alias;
    const schemaKeys = schema.keyof().options;

    // Add all columns with alias prefix
    columns.push(...schemaKeys.map((key: string) => `${alias}.${key}`));
  }

  return columns;
}

/**
 * Generate SQL SELECT columns from a Zod schema for JOIN queries.
 *
 * This function analyzes a schema and generates the appropriate
 * column list for SQL queries. Base table fields remain unqualified, while joined
 * table fields get qualified with their respective aliases.
 *
 * Example:
 *
 * const OrderItem_ProDef_Category = OrderItemSchema.extend({
 *   product_def: ProductDefinitionSchema,
 *   category: ProductCategorySchema
 * });
 *
 * genQualifiedColumns(OrderItem_Extended, tableRegistry)
 * // Returns: ["order_item_id", "quantity", "pd.product_def_id", "pd.name", "pc.category_id", "pc.name"]
 *
 *
 * @param schema - Zod schema created with .extend() containing base fields + nested objects
 * @param tableRegistry - Registry mapping entity names to table definitions
 * @returns Array of column names: base fields unqualified, joined fields with aliases
 */
export function genQualifiedColumns(schema: z.ZodObject<any>, tableRegistry: ITableRegistry): string[] {
  const columns: string[] = [];
  const shape = schema.shape;

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject) {
      // This is a nested object representing a joined table (e.g., product_def, category)
      const tableEntry = Object.entries(tableRegistry).find(([, config]) => config.schema === zodType);

      if (tableEntry) {
        const [, config] = tableEntry;
        const alias = config.alias;
        const nestedKeys = zodType.keyof().options;

        // Add qualified columns for joined table: "pd.product_def_id", "pd.name", etc.
        columns.push(...nestedKeys.map((key: string) => `${alias}.${key}`));
      } else {
        throw new Error(`Cannot find tableEntry for ${zodType}`);
      }

    } else {
      // This is a direct field from the base table - no alias qualification needed
      // Base table fields remain unqualified in SELECT to maintain consistency
      columns.push(fieldName);
    }
  }

  return columns;
}

/**
 * Generate typed qualified column names from a schema - the reverse of recordsetTransformer.
 *
 * This is the type-safe version of genQualifiedColumns that returns properly typed column names
 * that match exactly what recordsetTransformer expects as input.
 *
 * Example:
 * const OrderItem_Extended = OrderItemSchema.extend({
 *   product_def: ProductDefinitionSchema,
 *   category: ProductCategorySchema
 * });
 *
 * genTypedQualifiedColumns(OrderItem_Extended)
 * // Returns: ["order_item_id", "quantity", "pd.product_def_id", "pd.title", "pc.category_id", "pc.name"]
 * // With full TypeScript type safety
 *
 * @param schema - Zod schema with nested objects representing JOINed tables
 * @param aliasedTableRegistry - Registry mapping aliases to table definitions
 * @returns Array of qualified column names with full type safety
 */
export function genTypedQualifiedColumns<T extends z.ZodObject<any>>(
  schema: T,
  aliasedTableRegistry: IAliasedTableRegistry = AliasedTableRegistry
): QualifiedColumnsFromSchema<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject) {
      // This is a nested object representing a joined table (e.g., product_def, category)
      // Find matching table config by schema reference - mirrors recordsetTransformer logic
      const aliasEntry = Object.entries(aliasedTableRegistry).find(([, config]) => config.schema === zodType);

      if (aliasEntry) {
        const [alias, config] = aliasEntry;
        const nestedKeys = zodType.keyof().options;

        // Add qualified columns for joined table: "pd.product_def_id", "pd.title", etc.
        columns.push(...nestedKeys.map((key: string) => `${alias}.${key}`));
      } else {
        throw new Error(
          `Schema for nested field '${fieldName}' not found in AliasedTableRegistry. ` +
          `Available aliases: ${Object.keys(aliasedTableRegistry).join(', ')}`
        );
      }
    } else {
      // This is a direct field from the base table - no alias qualification needed
      // Base table fields remain unqualified in SELECT to maintain consistency with recordsetTransformer
      columns.push(fieldName);
    }
  }

  return columns as QualifiedColumnsFromSchema<T>[];
}

export const DomainTypesUtils_TestColumns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
// The return type will be: ("order_item_id" | "quantity" | "pd.product_def_id" | "pd.title" | "pc.category_id" | "pc.name")[]


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

export type ValidationResultFor<S extends z.ZodTypeAny> =
  | {
      isValid: true;
      errors: Record<string, never>;
      sanitized: z.output<S>;
    }
  | {
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
// const validationResult = validateEntity(WholesalerSchema, {});
// const sanitized = validationResult.sanitized;
// void sanitized;
