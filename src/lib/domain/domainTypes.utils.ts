// File: src/lib/domain/domainTypes.utils.ts (UPDATED for Branded Schemas)

import { AliasedTableRegistry } from "$lib/backendQueries/tableRegistry";
import { log } from "$lib/utils/logger";
import z from "zod";
import { type AllBrandedSchemas, OrderItem_ProdDef_Category_Schema } from "./domainTypes";

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
export type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;

/**
 * Generate qualified columns for a single branded schema
 */
export type QualifiedColumnsFromBrandedSchema<T extends z.ZodObject<any> & { _meta: any }> =
  GetSchemaAlias<T> extends string ? ExtractSchemaKeys<T> | `${GetSchemaAlias<T>}.${ExtractSchemaKeys<T>}` : ExtractSchemaKeys<T>;

/**
 * Generate qualified columns for schema with branded nested objects (JOIN scenario)
 * This is the main type used by genTypedQualifiedColumns
 */
export type QualifiedColumnsFromBrandedSchemaWithJoins<T extends z.ZodObject<any>> =
  T extends z.ZodObject<infer Shape>
    ? {
        [K in keyof Shape]: Shape[K] extends z.ZodObject<any> & { _meta: any }
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
type GetQualifiedColumnsFromSchema<S> = S extends z.ZodObject<any> & { _meta: { alias: infer A extends string } }
  ? `${A}.${ExtractSchemaKeys<S>}`
  : never;

// Apply to all schemas
export type AllQualifiedColumns = {
  [K in keyof typeof AllBrandedSchemas]: GetQualifiedColumnsFromSchema<(typeof AllBrandedSchemas)[K]>
}[keyof typeof AllBrandedSchemas];

export type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

export type AliasKeys = GetSchemaAlias<(typeof AllBrandedSchemas)[keyof typeof AllBrandedSchemas]>;

export type DbTableNames = GetFullTableName<(typeof AllBrandedSchemas)[keyof typeof AllBrandedSchemas]>;


// ===== UTIL FUNCTIONS =====/ 

/**
 * UPDATED: Generate typed qualified column names from a branded schema
 *
 * This function now works with branded schemas that have _meta information
 * instead of relying on AliasedTableRegistry lookup.
 *
 * @param schema - Branded Zod schema with _meta information
 * @returns Array of qualified column names with full type safety
 */
export function genTypedQualifiedColumns<T extends z.ZodObject<any>>(schema: T): QualifiedColumnsFromBrandedSchemaWithJoins<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject) {
      // Check if this is a branded schema with _meta
      if ("_meta" in zodType) {
        // Extract alias from meta information
        const meta = (zodType as any)._meta;
        const alias = meta.alias;
        const nestedKeys = zodType.keyof().options;

        // Add qualified columns for joined table: "pd.product_def_id", "pd.title", etc.
        columns.push(...nestedKeys.map((key: string) => `${alias}.${key}`));
      } else {
        // Fallback: This schema doesn't have meta - try old AliasedTableRegistry lookup
        log.warn(`Schema for field '${fieldName}' has no _meta information. Falling back to AliasedTableRegistry lookup.`);

        const aliasEntry = Object.entries(AliasedTableRegistry).find(([, config]) => config.schema === zodType);
        if (aliasEntry) {
          const [alias] = aliasEntry;
          const nestedKeys = zodType.keyof().options;
          columns.push(...nestedKeys.map((key: string) => `${alias}.${key}`));
        } else {
          throw new Error(
            `Schema for nested field '${fieldName}' not found in AliasedTableRegistry and has no _meta. ` +
              `Available aliases: ${Object.keys(AliasedTableRegistry).join(", ")}`,
          );
        }
      }
    } else {
      // This is a direct field from the base table - no alias qualification needed
      columns.push(fieldName);
    }
  }

  return columns as QualifiedColumnsFromBrandedSchemaWithJoins<T>[];
}

// ===== TEST THE NEW FUNCTION =====

// Test with the branded OrderItem_ProdDef_Category_Schema
const testColumns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
console.log("Generated columns:", testColumns);

// The return type should now be properly typed:
// ("order_item_id" | "order_id" | "offering_id" | "quantity" | "unit_price" | "line_total" | "item_notes" | "created_at" | "pd.product_def_id" | "pd.category_id" | "pd.title" | "pd.description" | "pd.material_id" | "pd.form_id" | "pd.created_at" | "pc.category_id" | "pc.name" | "pc.description")[]

// ===== UTILS (unchanged) =====

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

export function validateEntity<S extends z.ZodTypeAny>(schema: S, data: unknown): ValidationResultFor<S> {
  const res = schema.safeParse(data);
  const validationResult = toValidationResult(res);
  log.debug(`Validated through ${schema.description}`, validationResult);
  return validationResult;
}

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
