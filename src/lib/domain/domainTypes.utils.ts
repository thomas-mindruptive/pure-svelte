// File: src/lib/domain/domainTypes.utils.ts

import { log } from "$lib/utils/logger";
import z from "zod";
import { AllBrandedSchemas } from "./domainTypes";


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
 * Generate typed qualified column names from a branded schema
 * Uses branded schemas with _meta information exclusively
 *
 * @param schema - Branded Zod schema with _meta information
 * @returns Array of qualified column names with full type safety
 */
export function genTypedQualifiedColumns<T extends z.ZodObject<z.ZodRawShape>>(schema: T): QualifiedColumnsFromBrandedSchemaWithJoins<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;

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
          columns.push(...schemaKeys.map((key) => `${alias}.${key}`));
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
      // Add qualified columns: "pd.product_def_id", "pd.title", etc.
      columns.push(...nestedKeys.map((key) => `${meta.alias}.${key}`));
    } else {
      // Direct field from base table - no qualification needed
      columns.push(fieldName);
    }
  }

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
 * Get schema metadata by alias
 */
export function getSchemaMetaByAlias(alias: string): SchemaMeta | undefined {
  return metaByAlias.get(alias);
}

/**
 * Get schema by alias
 */
export function getSchemaByAlias(alias: string): z.ZodObject<z.ZodRawShape> | undefined {
  return schemaByAlias.get(alias);
}

/**
 * Check if a table is defined in any branded schema
 * Used for security validation in query endpoint
 * @param tableName - Can be "tableName" or "schema.tableName" format
 * @returns true if table exists in branded schemas, false otherwise
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
