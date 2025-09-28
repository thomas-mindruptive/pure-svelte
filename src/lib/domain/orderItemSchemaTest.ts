// File: src/lib/test/orderItemSchemaTest.ts
// Test OrderItem_ProdDef_Category_Schema mit dem neuen Intersection Type Approach

import { z } from 'zod';

// ===== INTERSECTION TYPE UTILITIES (aus vorherigem Test) =====

type WithMeta<T, M> = T & { readonly _meta: M };

function createSchemaWithMeta<
  T extends z.ZodObject<any>,
  M extends { alias: string; tableName: string; dbSchema: string }
>(schema: T, meta: M): WithMeta<T, M> {
  return schema.meta(meta) as WithMeta<T, M>;
}

type ExtractSchemaMeta<T> = T extends { readonly _meta: infer M } ? M : never;
type GetSchemaAlias<T> = ExtractSchemaMeta<T> extends { alias: infer A } ? A : never;
type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;

// ===== BRANDED VERSIONS DER ECHTEN SCHEMAS =====

// OrderItem Schema (Base Table)
const OrderItemSchemaBase = z.object({
  order_item_id: z.number().int().positive(),
  order_id: z.number().int().positive(),
  offering_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive().default(1),
  unit_price: z.number().multipleOf(0.01),
  line_total: z.number().multipleOf(0.01).nullable().optional(),
  item_notes: z.string().max(500).nullable().optional(),
  created_at: z.string().optional(),
});

const OrderItemSchema = createSchemaWithMeta(OrderItemSchemaBase, {
  alias: "ori",
  tableName: "order_items", 
  dbSchema: "dbo"
} as const);

// ProductDefinition Schema  
const ProductDefinitionSchemaBase = z.object({
  product_def_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  title: z.string().max(200),
  description: z.string().max(1000).nullable().optional(),
  material_id: z.number().int().positive().nullable().optional(),
  form_id: z.number().int().positive().nullable().optional(),
  created_at: z.string().optional(),
});

const ProductDefinitionSchema = createSchemaWithMeta(ProductDefinitionSchemaBase, {
  alias: "pd",
  tableName: "product_definitions",
  dbSchema: "dbo"
} as const);

// ProductCategory Schema
const ProductCategorySchemaBase = z.object({
  category_id: z.number().int().positive(),
  name: z.string().max(200),
  description: z.string().max(500).nullable().optional(),
});

const ProductCategorySchema = createSchemaWithMeta(ProductCategorySchemaBase, {
  alias: "pc",
  tableName: "product_categories",
  dbSchema: "dbo"
} as const);

// ===== ORDERITEM MIT JOINS - BRANDED VERSION =====

const OrderItem_ProdDef_Category_Schema = OrderItemSchema.extend({
  product_def: ProductDefinitionSchema,
  category: ProductCategorySchema
});

// ===== TYPE DEFINITIONS FÜR QUALIFIED COLUMNS =====

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

// ===== TESTS =====

// Test: Aliases werden korrekt extrahiert
type OrderItemAlias = GetSchemaAlias<typeof OrderItemSchema>; 
// Should be: "ori"

type ProductDefAlias = GetSchemaAlias<typeof ProductDefinitionSchema>;
// Should be: "pd"  

type CategoryAlias = GetSchemaAlias<typeof ProductCategorySchema>;
// Should be: "pc"

// Test: Schema Keys werden korrekt extrahiert
type OrderItemKeys = ExtractSchemaKeys<typeof OrderItemSchema>;
// Should be: "order_item_id" | "order_id" | "offering_id" | "quantity" | "unit_price" | "line_total" | "item_notes" | "created_at"

type ProductDefKeys = ExtractSchemaKeys<typeof ProductDefinitionSchema>;
// Should be: "product_def_id" | "category_id" | "title" | "description" | "material_id" | "form_id" | "created_at"

type CategoryKeys = ExtractSchemaKeys<typeof ProductCategorySchema>;
// Should be: "category_id" | "name" | "description"

// ===== HAUPTTEST: QUALIFIED COLUMNS =====

type OrderItemQualifiedColumns = QualifiedColumnsFromBrandedSchemaWithJoins<typeof OrderItem_ProdDef_Category_Schema>;

/**
 * Expected Result:
 * - Base OrderItem fields: "order_item_id" | "order_id" | "offering_id" | "quantity" | "unit_price" | "line_total" | "item_notes" | "created_at"
 * - ProductDef qualified: "pd.product_def_id" | "pd.category_id" | "pd.title" | "pd.description" | "pd.material_id" | "pd.form_id" | "pd.created_at"  
 * - Category qualified: "pc.category_id" | "pc.name" | "pc.description"
 */

// ===== RUNTIME FUNCTION TEST =====

/**
 * Mock der genTypedQualifiedColumns function mit branded schema support
 */
function genTypedQualifiedColumnsTest<T extends z.ZodObject<any>>(
  schema: T
): QualifiedColumnsFromBrandedSchemaWithJoins<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject && '_meta' in zodType) {
      // Branded nested schema
      const meta = (zodType as any)._meta;
      const alias = meta.alias;
      const nestedKeys = zodType.keyof().options;
      
      columns.push(...nestedKeys.map((key: string) => `${alias}.${key}`));
    } else {
      // Direct field from base table
      columns.push(fieldName);
    }
  }

  return columns as QualifiedColumnsFromBrandedSchemaWithJoins<T>[];
}

// Test Runtime Function
const testColumns = genTypedQualifiedColumnsTest(OrderItem_ProdDef_Category_Schema);

// ===== EXPORTS =====
export {
  OrderItem_ProdDef_Category_Schema,
  type OrderItemQualifiedColumns,
  type QualifiedColumnsFromBrandedSchemaWithJoins,
  genTypedQualifiedColumnsTest,
  testColumns
};