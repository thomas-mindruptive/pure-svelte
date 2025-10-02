// File: src/lib/domain/domainTypes.utils.ts

import { log } from "$lib/utils/logger";
import z from "zod";
import { AllBrandedSchemas } from "./domainTypes";
import type { ValidationErrors, ValidationErrorTree } from "$lib/components/validation/validation.types";

// ===== TYPE DEFINITIONS FOR BRANDED SCHEMAS =====

type SchemaMeta = { alias: string; tableName: string; dbSchema: string };
type BrandedSchema = z.ZodObject<z.ZodRawShape> & { readonly _meta: SchemaMeta };
type BrandedSchemaWithDef = z.ZodObject<z.ZodRawShape> & { _def?: { meta?: SchemaMeta } };

// ===== TYPE UTILITIES FOR BRANDED SCHEMAS =====

/**
 * Extract meta information from branded schema
 */
export type ExtractSchemaMeta<T> = T extends { readonly _meta: infer M } ? M : never;

/**
 * Get alias from branded schema meta
 */
export type GetSchemaAlias<T> = ExtractSchemaMeta<T> extends { alias: infer A } ? A : never;

/**
 * Get table name from branded schema meta
 */
export type GetSchemaTableName<T> = ExtractSchemaMeta<T> extends { tableName: infer T } ? T : never;

/**
 * Extract column names from schema (actual data fields, not Zod internals)
 */
export type ExtractSchemaKeys<T extends z.ZodObject<z.ZodRawShape>> = Extract<keyof z.infer<T>, string>;

/**
 * Generate qualified columns for a single branded schema
 */
export type QualifiedColumnsFromBrandedSchema<T extends BrandedSchema> =
  GetSchemaAlias<T> extends string ? ExtractSchemaKeys<T> | `${GetSchemaAlias<T>}.${ExtractSchemaKeys<T>}` : ExtractSchemaKeys<T>;

/**
 * Generate qualified columns for schema with branded nested objects (JOIN scenario)
 * This is the main type used by genTypedQualifiedColumns
 */
export type QualifiedColumnsFromBrandedSchemaWithJoins<T extends z.ZodObject<z.ZodRawShape>> =
  T extends z.ZodObject<infer Shape>
    ? {
        [K in keyof Shape]: Shape[K] extends BrandedSchema
          ? GetSchemaAlias<Shape[K]> extends string
            ? `${GetSchemaAlias<Shape[K]>}.${Extract<keyof z.infer<Shape[K]>, string>}`
            : never
          : K extends string
            ? K
            : never;
      }[keyof Shape]
    : never;

// Get DB schema
export type GetSchemaDbSchema<T> = ExtractSchemaMeta<T> extends { dbSchema: infer D } ? D : never;

// Get full table name
export type GetFullTableName<T> =
  ExtractSchemaMeta<T> extends { dbSchema: infer D; tableName: infer T } ? `${D & string}.${T & string}` : never;

export type ValidFromClause = {
  [K in keyof typeof AllBrandedSchemas]: {
    table: GetFullTableName<(typeof AllBrandedSchemas)[K]>;
    alias: GetSchemaAlias<(typeof AllBrandedSchemas)[K]>;
  };
}[keyof typeof AllBrandedSchemas];

// Type-safe extraction from branded schemas collection
type GetQualifiedColumnsFromSchema<S> = S extends BrandedSchema
  ? GetSchemaAlias<S> extends string
    ? `${GetSchemaAlias<S>}.${ExtractSchemaKeys<S>}`
    : never
  : never;

// Apply to all schemas
export type AllQualifiedColumns = {
  [K in keyof typeof AllBrandedSchemas]: GetQualifiedColumnsFromSchema<(typeof AllBrandedSchemas)[K]>;
}[keyof typeof AllBrandedSchemas];

export type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

export type AliasKeys = GetSchemaAlias<(typeof AllBrandedSchemas)[keyof typeof AllBrandedSchemas]>;

export type DbTableNames = GetFullTableName<(typeof AllBrandedSchemas)[keyof typeof AllBrandedSchemas]>;

// ===== UTIL FUNCTIONS =====

/**
 * Generates a type-safe array of qualified column names from a branded Zod schema.
 *
 * This function processes schemas that may contain nested branded schemas (JOIN scenarios)
 * and produces SQL-qualified column names (e.g., "pd.title", "w.name").
 *
 * **How it works:**
 * - Direct fields (non-objects) are returned as-is: `["order_id", "status"]`
 * - Nested branded schemas are expanded with their alias: `["pd.product_def_id", "pd.title"]`
 * - Falls back to schema shape matching when `.extend()` loses metadata
 *
 * **Example:**
 * ```typescript
 * const cols = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
 * // Returns: ["ori.order_item_id", "pd.product_def_id", "pd.title", "pc.category_id", ...]
 * ```
 *
 * @template T - A Zod object schema, potentially with nested branded schemas
 * @param schema - Branded Zod schema with _meta information
 * @param qualifyAllColsFully - If true, base table columns are fully qualified (e.g., "ori.order_id"). If false, they remain unqualified (e.g., "order_id"). Default: false
 * @returns Array of qualified column names with full type safety
 * @throws Error if a nested schema lacks metadata and cannot be matched
 */
export function genTypedQualifiedColumns<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  qualifyAllColsFully = false,
): QualifiedColumnsFromBrandedSchemaWithJoins<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;
  const baseMeta = (schema as any).__brandMeta;
  const baseAlias = baseMeta?.alias;

  // Validate that base schema has metadata when fully qualified columns are required
  if (qualifyAllColsFully && !baseAlias) {
    throw new Error(
      `qualifyAllColsFully=true requires base schema to have metadata with alias. ` +
        `Use copyMetaFrom() after .extend() to preserve metadata from the base schema.`
    );
  }

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject) {
      // Get meta from either _meta (compile-time) or _def.meta (runtime)
      const brandedZodType = zodType as BrandedSchemaWithDef;
      const meta = (brandedZodType as any).__brandMeta;

      if (!meta?.alias) {
        // When .extend() is used, meta is lost. Try to find by schema shape comparison
        const schemaKeys = zodType.keyof().options as readonly string[];

        log.debug(`Trying to match schema for field '${fieldName}' with keys:`, schemaKeys);
        log.debug(
          "Available schemas in map:",
          Array.from(schemaByAlias.entries()).map(([alias, s]) => ({
            alias,
            keys: s.keyof().options,
          })),
        );

        // Find matching schema by comparing keys
        const schemaEntry = Array.from(schemaByAlias.entries()).find(([alias, s]) => {
          const mapSchemaKeys = s.keyof().options as readonly string[];
          const match = mapSchemaKeys.length === schemaKeys.length && schemaKeys.every((key) => mapSchemaKeys.includes(key));
          if (match) {
            log.debug(`Found matching schema with alias '${alias}'`);
          }
          return match;
        });

        if (schemaEntry) {
          const [alias] = schemaEntry;
          columns.push(...schemaKeys.map((key) => `${alias}.${key} AS '${alias}.${key}'`));
          continue;
        }

        throw new Error(
          `Schema for nested field '${fieldName}' has no meta.alias and could not be matched. ` +
            `Schema keys: [${schemaKeys.join(", ")}]. ` +
            `Available aliases in map: [${Array.from(schemaByAlias.keys()).join(", ")}]. ` +
            `All nested schemas must be branded schemas created with createSchemaWithMeta.`,
        );
      }

      const nestedKeys = zodType.keyof().options as readonly string[];
      // Add qualified columns with alias: "pd.product_def_id AS 'pd.product_def_id'", etc.
      columns.push(...nestedKeys.map((key) => `${meta.alias}.${key} AS '${meta.alias}.${key}'`));
    } else {
      // Direct field from base table
      if (qualifyAllColsFully && baseAlias) {
        columns.push(`${baseAlias}.${fieldName} AS '${baseAlias}.${fieldName}'`);
      } else {
        columns.push(fieldName);
      }
    }
  }

  log.info(`Generated qualified columns:`, columns);

  return columns as QualifiedColumnsFromBrandedSchemaWithJoins<T>[];
}

// ===== LOOKUP UTILS =====

/**
 * Lookup maps for efficient schema access by alias
 * Populated once at startup from AllBrandedSchemas
 */
export const schemaByAlias = new Map<string, z.ZodObject<z.ZodRawShape>>();
export const metaByAlias = new Map<string, SchemaMeta>();

// Initialize lookup maps
for (const [name, schema] of Object.entries(AllBrandedSchemas)) {
  log.info(`dimainTypesUtils: Schema ${name}:`, {
    has_def: !!(schema as any)._def,
    meta_in_def: (schema as any)._def?.meta,
    direct_meta: (schema as any)._meta,
  });
  const meta = (schema as any).__brandMeta;

  if (meta?.alias) {
    schemaByAlias.set(meta.alias, schema);
    metaByAlias.set(meta.alias, meta);
  }
}

/**
 * Retrieves schema metadata by its alias identifier.
 *
 * Uses the pre-initialized lookup map for O(1) access to metadata
 * containing alias, tableName, and dbSchema information.
 *
 * @param alias - The schema alias (e.g., "pd", "w", "ord")
 * @returns The schema metadata object, or undefined if not found
 *
 * @example
 * ```typescript
 * const meta = getSchemaMetaByAlias("pd");
 * // Returns: { alias: "pd", tableName: "product_definitions", dbSchema: "dbo" }
 * ```
 */
export function getSchemaMetaByAlias(alias: string): SchemaMeta | undefined {
  return metaByAlias.get(alias);
}

/**
 * Retrieves a branded Zod schema by its alias identifier.
 *
 * Uses the pre-initialized lookup map for O(1) schema access.
 * Useful for dynamic schema resolution in query building.
 *
 * @param alias - The schema alias (e.g., "pd", "w", "ord")
 * @returns The Zod schema object, or undefined if not found
 *
 * @example
 * ```typescript
 * const schema = getSchemaByAlias("pd");
 * // Returns: ProductDefinitionSchema
 * ```
 */
export function getSchemaByAlias(alias: string): z.ZodObject<z.ZodRawShape> | undefined {
  return schemaByAlias.get(alias);
}

/**
 * Validates whether a table name exists in the branded schema registry.
 *
 * **Security Critical:** This function is used by the query endpoint to prevent
 * SQL injection by ensuring only whitelisted tables can be queried.
 *
 * Accepts both short form ("product_definitions") and fully qualified form
 * ("dbo.product_definitions") for flexible validation.
 *
 * @param tableName - Table name in either format: "tableName" or "schema.tableName"
 * @returns `true` if the table exists in any branded schema, `false` otherwise
 *
 * @example
 * ```typescript
 * isTableInBrandedSchemas("product_definitions");       // true
 * isTableInBrandedSchemas("dbo.product_definitions");   // true
 * isTableInBrandedSchemas("malicious_table"); // false
 * ```
 */
export function isTableInBrandedSchemas(tableName: string): boolean {
  // Check all metadata entries
  for (const meta of metaByAlias.values()) {
    const fullTableName = `${meta.dbSchema}.${meta.tableName}`;

    // Check both formats: "tableName" and "schema.tableName"
    if (tableName === meta.tableName || tableName === fullTableName) {
      return true;
    }
  }
  return false;
}

// ===== VALIDATION UTILS =====

export type ValidationResultFor<S extends z.ZodTypeAny> =
  | {
      isValid: true;
      errors: Record<string, never>;
      sanitized: z.output<S>;
    }
  | {
      isValid: false;
      errors: ValidationErrors;
      sanitized: undefined;
    };

/**
 * Validates data against a Zod schema and returns a structured validation result.
 *
 * This is a high-level validation wrapper that combines Zod's `safeParse` with
 * custom error formatting optimized for form validation and API responses.
 *
 * **Success case:**
 * - Returns `{ isValid: true, errors: {}, sanitized: <validated data> }`
 * - The `sanitized` data includes any Zod transformations/defaults applied
 *
 * **Failure case:**
 * - Returns `{ isValid: false, errors: { field: ["message"] }, sanitized: undefined }`
 * - Field errors are organized by field name for easy UI binding
 * - Global errors are stored under the `_root` key
 *
 * @template S - The Zod schema type
 * @param schema - Zod schema to validate against
 * @param data - Raw data to validate (can be any type)
 * @returns Structured validation result with type-safe error and data handling
 *
 * @example
 * ```typescript
 * const result = validateEntity(OrderSchema, rawData);
 * if (result.isValid) {
 *   // result.sanitized is fully typed as Order
 *   console.log(result.sanitized.order_id);
 * } else {
 *   // result.errors is Record<string, string[]>
 *   console.log(result.errors.order_date); // ["Invalid date format"]
 * }
 * ```
 */
export function validateEntity<S extends z.ZodTypeAny>(schema: S, data: unknown): ValidationResultFor<S> {
  const res = schema.safeParse(data);
  const validationResult = toValidationResult(res);
  log.debug(`Validated through ${schema.description}`, validationResult);
  return validationResult;
}

/**
 * Converts a Zod parse result into a standardized validation result format.
 *
 * This low-level utility transforms Zod's native result format into our
 * application's validation result structure with typed error handling.
 *
 * The function guarantees mutually exclusive states via discriminated union:
 * - When `isValid: true`, `errors` is an empty object and `sanitized` contains data
 * - When `isValid: false`, `errors` contains messages and `sanitized` is undefined
 *
 * @template S - The Zod schema type
 * @param zodParseResult - Raw result from `schema.safeParse()`
 * @returns Structured validation result with discriminated union type safety
 *
 * @see {@link zodToValidationErrors} for error formatting details
 */
export function toValidationResult<S extends z.ZodTypeAny>(zodParseResult: z.ZodSafeParseResult<z.output<S>>): ValidationResultFor<S> {
  if (zodParseResult.success) {
    return {
      isValid: true,
      errors: {} as Record<string, never>,
      sanitized: zodParseResult.data,
    };
  }
  const errors = zodToValidationErrors(zodParseResult.error);
  return {
    isValid: false,
    errors,
    sanitized: undefined,
  };
}

/**
 * Converts a Zod error into a field-indexed error record optimized for forms and APIs.
 *
 * This function flattens Zod's nested error structure into a simple key-value map
 * where each field name maps to an array of error messages.
 *
 * **Output format:**
 * ```typescript
 * {
 *   order_date: ["Required", "Must be a valid date"],
 *   total_amount: ["Must be positive"],
 *   _root: ["Global validation failed"] // non-field-specific errors
 * }
 * ```
 *
 * **Key behaviors:**
 * - Only includes fields that have actual error messages (empty arrays are omitted)
 * - Global/form-level errors are stored under the special `_root` key
 * - Field names match the original data structure for easy UI binding
 *
 * @param error - ZodError from a failed validation. If undefined, return empty record.
 * @returns Record mapping field names to error message arrays
 *
 * @example
 * ```typescript
 * const result = OrderSchema.safeParse(invalidData);
 * if (!result.success) {
 *   const errors = toErrorRecord(result.error);
 *   // Use in form: <input error={errors.order_date?.[0]} />
 * }
 * ```
 */
export function zodToValidationErrors(error: z.ZodError): ValidationErrors {
  const { fieldErrors, formErrors } = z.flattenError(error);

  // Ensure we only keep fields that actually have messages
  const errors: Record<string, string[]> = {};
  for (const [key, arr] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
    if (arr && arr.length) errors[key] = arr;
  }

  // Global errors (not tied to a specific field) are stored under "_root"
  if (formErrors.length) errors._root = formErrors;

  return errors;
}

/**
 * Converts a Zod error into a tree structure with nested error objects.
 *
 * This function transforms Zod's `treeifyError()` output into our ValidationErrorTree format.
 * - Zod's `errors` arrays → our `errors` (only if non-empty)
 * - Zod's `properties` → direct fields
 * - Zod's `items` (arrays) → numeric string keys ("0", "1", ...)
 *
 * Empty `errors` arrays are omitted for cleaner JSON.stringify() output.
 *
 * @param error - ZodError from a failed validation
 * @returns Tree structure with errors arrays at each level (only when present)
 *
 * @example
 * ```typescript
 * const result = OrderSchema.safeParse(invalidData);
 * if (!result.success) {
 *   const tree = zodToValidationErrorTree(result.error);
 *   // Access: tree.shipping_address?.city?.errors
 *   console.log(JSON.stringify(tree, null, 2)); // Clean output, no empty errors arrays
 * }
 * ```
 */
export function zodToValidationErrorTree(error: z.ZodError): ValidationErrorTree {
  const zodTree = z.treeifyError(error);

  function convertNode(node: unknown): ValidationErrorTree {
    if (!node || typeof node !== 'object') return {};

    const result: ValidationErrorTree = {};

    // errors only if non-empty
    if ('errors' in node && Array.isArray(node.errors) && node.errors.length > 0) {
      result.errors = node.errors as string[];
    }

    // Zod's "properties" → direct fields
    if ('properties' in node && node.properties && typeof node.properties === 'object') {
      for (const [key, value] of Object.entries(node.properties)) {
        result[key] = convertNode(value);
      }
    }

    // Zod's "items" (Array) → numeric string keys
    if ('items' in node && Array.isArray(node.items)) {
      for (let i = 0; i < node.items.length; i++) {
        result[i.toString()] = convertNode(node.items[i]);
      }
    }

    return result;
  }

  return convertNode(zodTree);
}

/**
 * Safely parses only the first `n` elements of an array against a given Zod schema.
 *
 * This function is useful when working with very large arrays where validating
 * every element would be too expensive. Instead, it validates only a prefix of
 * the array (first `n` elements) for structural correctness. If all of those
 * elements pass validation, the entire array is considered valid. The return
 * value is fully compatible with Zod's `safeParse`, i.e. it returns an object
 * of type `SafeParseReturnType<unknown, T[]>`.
 *
 * Performance considerations:
 * - Does not copy or slice the input array.
 * - Stops after `n` iterations or the end of the array (whichever comes first).
 * - Uses plain `for` loops and index access for minimal overhead.
 *
 * @template - The Zod schema type for each array element.
 *
 * @param  - The Zod schema to validate each array element against.
 * @param  - The input value to validate. Must be an array.
 * @param n - Maximum number of elements to validate from the start of the array.
 *
 * @returns A Zod `SafeParseReturnType`:

 *
 * @example
 * const CustomerSchema = z.object({
 *   id: z.string(),
 *   name: z.string(),
 * });
 *
 * const customers = [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }];
 *
 * const result = safeParseFirstN(CustomerSchema, customers, 1);
 *
 */
export function safeParseFirstN<T extends z.ZodTypeAny>(
  elementSchema: T,
  data: unknown,
  n: number
): ReturnType<z.ZodArray<T>['safeParse']> {
  const arraySchema = z.array(elementSchema);
  
  if (data === undefined || data === null || !Array.isArray(data)) {
    return arraySchema.safeParse(data);
  }

  const issues: z.ZodError['issues'] = [];
  const parsed: Array<z.infer<T>> = [];
  const len = data.length;
  const limit = n < len ? n : len;

  for (let i = 0; i < limit; i++) {
    const result = elementSchema.safeParse(data[i]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          ...issue,
          path: [i, ...issue.path],
        });
      }
    } else {
      parsed.push(result.data);
    }
  }

  if (issues.length > 0) {
    const failResult = arraySchema.safeParse([]);
    if (!failResult.success) {
      failResult.error.issues = issues;
      return failResult;
    }
  }

  return { success: true, data: parsed };
}