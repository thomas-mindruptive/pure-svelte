// File: src/lib/test/schemaMetaTest.ts
// Test ob sich Types aus Zod Schema Meta ableiten lassen

import { z } from 'zod';

// ===== SCHRITT 1: TEST-SCHEMA MIT META =====

const TestSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.enum(["active", "inactive"]).optional()
}).meta({
  alias: "t",
  tableName: "test_table",
  dbSchema: "dbo"
});

const TestJoinSchema = TestSchema.extend({
  category: z.object({
    category_id: z.number(),
    category_name: z.string()
  }).meta({
    alias: "c",
    tableName: "categories", 
    dbSchema: "dbo"
  })
});

// ===== SCHRITT 2: TYPE-UTILITIES FÜR META-EXTRACTION (CORRECTED) =====

/**
 * PROBLEM: TypeScript kann nicht auf ._def.meta zur Compile-Zeit zugreifen
 * WORKAROUND: Verwende as const assertions für Meta-Informationen
 */

// ===== APPROACH 1: INTERSECTION TYPES MIT META-BRAND =====

/**
 * Helper type for schemas with compile-time meta information
 */
type WithMeta<T, M> = T & { readonly _meta: M };

/**
 * Schema mit Meta-Brand - Compile-Time und Runtime Meta
 */
type TestSchemaMeta = {
  readonly alias: "t";
  readonly tableName: "test_table";
  readonly dbSchema: "dbo";
};

const TestSchemaBase = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.enum(["active", "inactive"]).optional()
});

// Approach 1a: Intersection mit Meta-Brand
const TestSchemaWithBrand = TestSchemaBase.meta({
  alias: "t",
  tableName: "test_table",
  dbSchema: "dbo"
}) as WithMeta<typeof TestSchemaBase, TestSchemaMeta>;

// Approach 1b: Helper Function für Schema-Creation
function createSchemaWithMeta<
  T extends z.ZodObject<any>,
  M extends { alias: string; tableName: string; dbSchema: string }
>(schema: T, meta: M): WithMeta<T, M> {
  return schema.meta(meta) as WithMeta<T, M>;
}

const TestSchemaWithHelper = createSchemaWithMeta(TestSchemaBase, {
  alias: "t",
  tableName: "test_table", 
  dbSchema: "dbo"
} as const);

// ===== TYPE EXTRACTION MIT INTERSECTION TYPES =====

/**
 * Extract meta information from branded schema
 */
type ExtractSchemaMeta<T> = T extends { readonly _meta: infer M } ? M : never;

/**
 * Get alias from branded schema
 */
type GetSchemaAlias<T> = ExtractSchemaMeta<T> extends { alias: infer A } ? A : never;

/**
 * Get table name from branded schema  
 */
type GetSchemaTableName<T> = ExtractSchemaMeta<T> extends { tableName: infer T } ? T : never;

/**
 * Extract column names from schema (not meta, but the actual data fields)
 */
type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;

// ===== SCHRITT 3: COMPILE-TESTS MIT INTERSECTION TYPES =====

// Test Meta-Extraction mit Branded Schema
type TestMetaFromBrand = ExtractSchemaMeta<typeof TestSchemaWithBrand>;
// Should be: { readonly alias: "t"; readonly tableName: "test_table"; readonly dbSchema: "dbo" }

type TestAliasFromBrand = GetSchemaAlias<typeof TestSchemaWithBrand>;
// Should be: "t" 

type TestTableNameFromBrand = GetSchemaTableName<typeof TestSchemaWithBrand>;
// Should be: "test_table"

// Test mit Helper Function
type TestAliasFromHelper = GetSchemaAlias<typeof TestSchemaWithHelper>;
// Should be: "t"

// ===== SCHRITT 4: QUALIFIED COLUMNS MIT INTERSECTION TYPES =====

/**
 * Generate qualified columns using intersection type meta
 */
type QualifiedColumnsFromBrandedSchema<T extends z.ZodObject<any> & { _meta: any }> = 
  GetSchemaAlias<T> extends string 
    ? ExtractSchemaKeys<T> | `${GetSchemaAlias<T>}.${ExtractSchemaKeys<T>}`
    : ExtractSchemaKeys<T>;

// Test Branded Schema  
type TestQualifiedColumnsFromBrand = QualifiedColumnsFromBrandedSchema<typeof TestSchemaWithBrand>;
// Should be: "id" | "name" | "status" | "t.id" | "t.name" | "t.status"

// ===== JOIN SCENARIO MIT INTERSECTION TYPES =====

type CategorySchemaMeta = {
  readonly alias: "c";
  readonly tableName: "categories";
  readonly dbSchema: "dbo";
};

const CategorySchemaBase = z.object({
  category_id: z.number().int().positive(),
  category_name: z.string()
});

const CategorySchema = createSchemaWithMeta(CategorySchemaBase, {
  alias: "c",
  tableName: "categories",
  dbSchema: "dbo"
} as const);

const TestJoinSchemaWithBrands = TestSchemaWithHelper.extend({
  category: CategorySchema
});

/**
 * Generate qualified columns for schema with branded nested objects  
 */
type QualifiedColumnsFromBrandedSchemaWithJoins<T extends z.ZodObject<any>> = 
  T extends z.ZodObject<infer Shape>
    ? {
        [K in keyof Shape]: Shape[K] extends z.ZodObject<any> & { _meta: any }
          ? GetSchemaAlias<Shape[K]> extends string
            ? `${GetSchemaAlias<Shape[K]>}.${ExtractSchemaKeys<Shape[K]>}`
            : never
          : K extends string 
            ? K
            : never;
      }[keyof Shape]
    : never;

// Test JOIN Schema mit Brands
type TestJoinQualifiedColumnsFromBrands = QualifiedColumnsFromBrandedSchemaWithJoins<typeof TestJoinSchemaWithBrands>;
// Should include: "id" | "name" | "status" | "c.category_id" | "c.category_name"

// ===== SCHRITT 5: RUNTIME VALIDATION =====

/**
 * Runtime function to extract meta - for verification
 */
function getSchemaMeta<T extends z.ZodObject<any>>(schema: T): ExtractSchemaMeta<T> {
  return (schema as any)._def.meta;
}

// Test Runtime
const testMeta = getSchemaMeta(TestSchema);
console.log('Runtime Meta:', testMeta);
// Should log: { alias: "t", tableName: "test_table", dbSchema: "dbo" }

