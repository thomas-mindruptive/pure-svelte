// File: src/lib/domain/domainTypes.utils.ts

import { log } from "$lib/utils/logger";
import z from "zod";
import { AllBrandedSchemas } from "./domainTypes";
import type { ValidationErrors, ValidationErrorTree } from "$lib/components/validation/validation.types";
import type { GetSchemaAlias } from "./domainTypes";
import type { Transaction } from "mssql";

// ===== TYPE DEFINITIONS FOR BRANDED SCHEMAS =====

type SchemaMeta = { alias: string; tableName: string; dbSchema: string };
type BrandedSchema = z.ZodObject<z.ZodRawShape> & { readonly __brandMeta: SchemaMeta };
type BrandedSchemaWithDef = z.ZodObject<z.ZodRawShape> & { _def?: { meta?: SchemaMeta } };

// ===== TYPE UTILITIES FOR BRANDED SCHEMAS =====

/**
 * Extract meta information from branded schema
 */
export type ExtractSchemaMeta<T> = T extends { readonly __brandMeta: infer M } ? M : never;

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
 * This is the main type used by genTypedQualifiedColumns.
 */
export type QualifiedColumnsFromBrandedSchemaWithJoins<T extends z.ZodObject<z.ZodRawShape>> =
  T extends z.ZodObject<infer Shape>
    ? {
        [K in keyof Shape]: // --- Part 1: Handles nested BrandedSchemas (for JOINs) ---
        Shape[K] extends BrandedSchema
          ? GetSchemaAlias<Shape[K]> extends string
            ? // Results in e.g., "pd.title"
              `${GetSchemaAlias<Shape[K]>}.${Extract<keyof z.infer<Shape[K]>, string>}`
            : never
          : // --- Part 2: Handles direct properties of the base schema (T) ---
            K extends string
            ? // Checks if the base schema (T) itself has an alias thanks to copyMetaFrom's return type
              GetSchemaAlias<T> extends string
              ? // If yes, allow BOTH the unqualified key (e.g., "sub_seller")
                // AND the qualified key (e.g., "wio.sub_seller")
                K | `${GetSchemaAlias<T>}.${K & string}`
              : // If no, only allow the unqualified key
                K
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

/**
 * Validation function for entity.
 * Validates entity and potential dependencies.
 * E.g., used as optional param to "validateAndUpdateEntity" and "validateAndUpdateEntity"
 */
export type EntityValidationFunc<T> = (entity: T, transaction: Transaction) => Promise<ValidationResultFor<z.ZodAny>>;

// ===== UTIL FUNCTIONS =====

/**
 * Generates a type-safe array of qualified column names from a branded Zod schema.
 */
export function genTypedQualifiedColumns<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  qualifyAllColsFully = false,
): QualifiedColumnsFromBrandedSchemaWithJoins<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;
  const baseMeta = (schema as any).__brandMeta;
  const baseAlias = baseMeta?.alias;

  if (qualifyAllColsFully && !baseAlias) {
    throw new Error(
      `qualifyAllColsFully=true requires base schema to have metadata with alias. ` +
        `Use copyMetaFrom() after .extend() to preserve metadata from the base schema.`,
    );
  }

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject) {
      const brandedZodType = zodType as BrandedSchemaWithDef;
      const meta = (brandedZodType as any).__brandMeta;

      if (!meta?.alias) {
        const schemaKeys = zodType.keyof().options as readonly string[];

        log.debug(`Trying to match schema for field '${fieldName}' with keys:`, schemaKeys);
        log.debug(
          "Available schemas in map:",
          Array.from(schemaByAlias.entries()).map(([alias, s]) => ({
            alias,
            keys: s.keyof().options,
          })),
        );

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
      columns.push(...nestedKeys.map((key) => `${meta.alias}.${key} AS '${meta.alias}.${key}'`));
    } else {
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
 */
export const schemaByAlias = new Map<string, z.ZodObject<z.ZodRawShape>>();
export const metaByAlias = new Map<string, SchemaMeta>();

// Initialize lookup maps
for (const [name, schema] of Object.entries(AllBrandedSchemas)) {
  log.info(`dimainTypesUtils: Schema ${name}:`, {
    has_def: !!(schema as any)._def,
    meta_in_def: (schema as any)._def?.meta,
    direct_meta: (schema as any).__brandMeta,
  });
  const meta = (schema as any).__brandMeta;

  if (meta?.alias) {
    schemaByAlias.set(meta.alias, schema);
    metaByAlias.set(meta.alias, meta);
  }
}

/**
 * Retrieves schema metadata by its alias identifier.
 */
export function getSchemaMetaByAlias(alias: string): SchemaMeta | undefined {
  return metaByAlias.get(alias);
}

/**
 * Retrieves a branded Zod schema by its alias identifier.
 */
export function getSchemaByAlias(alias: string): z.ZodObject<z.ZodRawShape> | undefined {
  return schemaByAlias.get(alias);
}

/**
 * Validates whether a table name exists in the branded schema registry.
 */
export function isTableInBrandedSchemas(tableName: string): boolean {
  for (const meta of metaByAlias.values()) {
    const fullTableName = `${meta.dbSchema}.${meta.tableName}`;
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
 */
export function validateEntityBySchema<S extends z.ZodTypeAny>(schema: S, data: unknown): ValidationResultFor<S> {
  const res = schema.safeParse(data);
  const validationResult = toValidationResult(res);
  log.debug(`Validated through ${schema.description}`, validationResult);
  return validationResult;
}

/**
 * Converts a Zod parse result into a standardized validation result format.
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
 */
export function zodToValidationErrors(error: z.ZodError): ValidationErrors {
  const { fieldErrors, formErrors } = z.flattenError(error);

  const errors: Record<string, string[]> = {};
  for (const [key, arr] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
    if (arr && arr.length) errors[key] = arr;
  }

  if (formErrors.length) errors._root = formErrors;

  return errors;
}

/**
 * Converts a Zod error into a tree structure with nested error objects.
 */
export function zodToValidationErrorTree(error: z.ZodError): ValidationErrorTree {
  const zodTree = z.treeifyError(error);

  function convertNode(node: unknown): ValidationErrorTree {
    if (!node || typeof node !== "object") return {};

    const result: ValidationErrorTree = {};

    if ("errors" in node && Array.isArray(node.errors) && node.errors.length > 0) {
      result.errors = node.errors as string[];
    }

    if ("properties" in node && node.properties && typeof node.properties === "object") {
      for (const [key, value] of Object.entries(node.properties)) {
        result[key] = convertNode(value);
      }
    }

    if ("items" in node && Array.isArray(node.items)) {
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
 */
export function safeParseFirstN<T extends z.ZodTypeAny>(
  elementSchema: T,
  data: unknown,
  n: number,
): ReturnType<z.ZodArray<T>["safeParse"]> {
  const arraySchema = z.array(elementSchema);

  if (data === undefined || data === null || !Array.isArray(data)) {
    return arraySchema.safeParse(data);
  }

  const issues: z.ZodError["issues"] = [];
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
