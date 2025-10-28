# Branded Schema Architecture for Type-Safe SQL Queries

## Overview

This system implements type-safe SQL query generation using Zod schemas enhanced with compile-time and runtime meta information. Each schema carries metadata about its database alias, table name, and schema, enabling automatic generation of qualified column names for JOIN queries.

## Core Architecture

### Branded Schemas with Meta Information

Schemas are created with embedded metadata using a custom approach that ensures both compile-time type safety and runtime accessibility:

```typescript
type WithMeta<T, M> = T & { readonly _meta: M };

function createSchemaWithMeta<
  T extends z.ZodObject<any>,
  M extends { alias: string; tableName: string; dbSchema: string }
>(schema: T, meta: M): WithMeta<T, M> {
  // Store metadata directly on the schema for runtime access
  (schema as any).__brandMeta = meta;
  // Call Zod's meta() for potential future compatibility
  const schemaWithMeta = schema.meta(meta);
  return schemaWithMeta as WithMeta<T, M>;
}
```

**Important Note**: We store metadata in `__brandMeta` rather than relying on Zod's `.meta()` method. Zod's `.meta()` is designed for JSON Schema generation and adds schemas to `z.globalRegistry`, but doesn't persist runtime-accessible metadata on the schema objects themselves. Our `__brandMeta` approach ensures metadata survives module export/import and is available at runtime.

**Important Note**: When you create new schemas, e.g. with `MySchema.omit(...)`, always make sure to call `copyMetaFrom(MySchema, SchemaWithOmit)`.<br>
Reason: Schema operations create copies WITHOUT the metadata. 

### Schema Definition Pattern

```typescript
const WholesalerSchema = createSchemaWithMeta(
  z.object({
    wholesaler_id: z.number().int().positive(),
    name: z.string().max(200),
    status: z.string().max(200).nullable().optional(),
    // ... additional fields
  }), 
  {
    alias: "w",
    tableName: "wholesalers", 
    dbSchema: "dbo"
  } as const
);
```

**CRITICAL:** When creating derived schemas (e.g., with `.extend()`, `.omit()`, `.pick()`), always copy metadata:
```typescript
const ExtendedSchema = BaseSchema.extend({ newField: z.string() });
copyMetaFrom(BaseSchema, ExtendedSchema); // REQUIRED - metadata is lost otherwise
```
Without `copyMetaFrom()`, the derived schema will lack `__brandMeta` and fail in `genTypedQualifiedColumns()`.

## Type System

### Meta Information Extraction

```typescript
// Extract meta information from branded schema
type ExtractSchemaMeta<T> = T extends { readonly _meta: infer M } ? M : never;

// Get specific meta properties
type GetSchemaAlias<T> = ExtractSchemaMeta<T> extends { alias: infer A } ? A : never;
type GetSchemaTableName<T> = ExtractSchemaMeta<T> extends { tableName: infer T } ? T : never;
type GetSchemaDbSchema<T> = ExtractSchemaMeta<T> extends { dbSchema: infer D } ? D : never;

// Get full table name
type GetFullTableName<T> = ExtractSchemaMeta<T> extends { dbSchema: infer D; tableName: infer T } 
  ? `${D & string}.${T & string}` 
  : never;
```

### Schema Key Extraction

```typescript
// Extract column names from schema (data fields only, not Zod internals)
type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;
```

### Qualified Column Generation

```typescript
// For single branded schema
type QualifiedColumnsFromBrandedSchema<T extends z.ZodObject<any> & { _meta: any }> = 
  GetSchemaAlias<T> extends string 
    ? ExtractSchemaKeys<T> | `${GetSchemaAlias<T>}.${ExtractSchemaKeys<T>}`
    : ExtractSchemaKeys<T>;

// For JOIN scenarios with nested branded schemas
type QualifiedColumnsFromBrandedSchemaWithJoins<T extends z.ZodObject<any>> = 
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
```

### Global Type Definitions

```typescript
// All branded schemas collection
export const AllBrandedSchemas = {
  WholesalerSchema,
  ProductCategorySchema,
  ProductDefinitionSchema,
  WholesalerItemOfferingSchema,
  AttributeSchema,
  WholesalerOfferingLinkSchema,
  WholesalerCategorySchema,
  WholesalerOfferingAttributeSchema,
  OrderSchema,
  OrderItemSchema,
  MaterialSchema,
  FormSchema
} as const;

// Extract qualified columns from all branded schemas
type GetQualifiedColumnsFromSchema<S> = S extends z.ZodObject<any> & { _meta: { alias: infer A extends string } }
  ? `${A}.${ExtractSchemaKeys<S>}`
  : never;

export type AllQualifiedColumns = {
  [K in keyof typeof AllBrandedSchemas]: GetQualifiedColumnsFromSchema<(typeof AllBrandedSchemas)[K]>
}[keyof typeof AllBrandedSchemas];

export type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

// Generate other global types from branded schemas
export type AliasKeys = {
  [K in keyof typeof AllBrandedSchemas]: GetSchemaAlias<(typeof AllBrandedSchemas)[K]>
}[keyof typeof AllBrandedSchemas];

export type DbTableNames = {
  [K in keyof typeof AllBrandedSchemas]: GetFullTableName<(typeof AllBrandedSchemas)[K]>
}[keyof typeof AllBrandedSchemas];

export type ValidFromClause = {
  [K in keyof typeof AllBrandedSchemas]: {
    table: GetFullTableName<(typeof AllBrandedSchemas)[K]>;
    alias: GetSchemaAlias<(typeof AllBrandedSchemas)[K]>;
  };
}[keyof typeof AllBrandedSchemas];
```

## Runtime Functions

### Generate Typed Qualified Columns

```typescript
export function genTypedQualifiedColumns<T extends z.ZodObject<any>>(
  schema: T
): QualifiedColumnsFromBrandedSchemaWithJoins<T>[] {
  const columns: string[] = [];
  const shape = schema.shape;

  for (const [fieldName, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodObject) {
      // Extract metadata from __brandMeta property
      const meta = (zodType as any).__brandMeta;
      
      if (!meta?.alias) {
        throw new Error(
          `Schema for nested field '${fieldName}' has no metadata. ` +
          `All nested schemas must be branded schemas created with createSchemaWithMeta.`
        );
      }
      
      const nestedKeys = zodType.keyof().options;
      // Add qualified columns: "pd.product_def_id", "pd.title", etc.
      columns.push(...nestedKeys.map((key: string) => `${meta.alias}.${key}`));
    } else {
      // Direct field from base table - no qualification needed
      columns.push(fieldName);
    }
  }

  return columns as QualifiedColumnsFromBrandedSchemaWithJoins<T>[];
}
```

### Lookup Maps Initialization

```typescript
// Lookup maps for efficient schema access by alias
export const schemaByAlias = new Map<string, z.ZodObject<any>>();
export const metaByAlias = new Map<string, SchemaMeta>();

// Initialize lookup maps using __brandMeta
for (const [name, schema] of Object.entries(AllBrandedSchemas)) {
  const meta = (schema as any).__brandMeta;
  
  if (meta?.alias) {
    schemaByAlias.set(meta.alias, schema);
    metaByAlias.set(meta.alias, meta);
  }
}
```

## Complete Workflow: Nested Schemas with JOIN Queries

### The Pattern (Recommended for all JOIN queries)

**When to use:** Whenever you need to query data from multiple joined tables (e.g., OrderItems with Product and Category data).

**Why nested schemas:** SQL returns FLAT recordsets with qualified columns like `ori.order_item_id`, `pd.title`, `pc.name`. We transform this into TypeScript objects with nested structure: `{ order_item_id, product_def: { title, ... }, category: { name, ... } }`.

### Step 1: Define Nested Schema

```typescript
// Extend base schema with nested branded schemas
export const OrderItem_ProdDef_Category_Schema = OrderItemSchema.extend({
  product_def: ProductDefinitionSchema,  // Branded schema with _meta
  category: ProductCategorySchema        // Branded schema with _meta
});
copyMetaFrom(OrderItemSchema, OrderItem_ProdDef_Category_Schema); // CRITICAL - preserves metadata!
```

### Step 2: Generate Qualified SQL Columns

```typescript
// CRITICAL: For JOIN queries, ALWAYS use qualifyAllColsFully = true
const cols = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema, true);

// WHY true is required:
// ❌ Without true: ["order_item_id", "product_def_id", "category_id", "product_def_id", "category_id", ...]
//    → DUPLICATE column names! (product_def_id appears in both order_items and product_definitions)
//    → SQL returns ambiguous results, transformToNestedObjects fails
//
// ✅ With true: ["ori.order_item_id", "ori.product_def_id", "pd.product_def_id", "ori.category_id", "pc.category_id", ...]
//    → Every column is UNIQUE and can be mapped to correct nested object
```

### Step 3: Execute Query

```typescript
const request: PredefinedQueryRequest<OrderItem_ProdDef_Category> = {
  namedQuery: "order->order_items->product_def->category",
  payload: {
    select: cols,  // Qualified columns from step 2
    where: { key: "ori.order_item_id", whereCondOp: "=", val: orderItemId }
  }
};

const responseData = await client.apiFetch<QueryResponseData<OrderItem_ProdDef_Category>>(
  "/api/query",
  { method: "POST", body: createJsonBody(request) }
);

// responseData.results is FLAT with qualified keys:
// [{ "ori.order_item_id": 1, "ori.quantity": 5, "pd.title": "Foo", "pc.name": "Bar" }]
```

### Step 4: Transform Flat to Nested

```typescript
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";

const nestedObjects = transformToNestedObjects(
  responseData.results as Record<string, unknown>[],
  OrderItem_ProdDef_Category_Schema
);

// ✅ Result is NESTED TypeScript objects with correct types:
// [{
//   order_item_id: 1,
//   quantity: 5,
//   product_def: { product_def_id: 10, title: "Foo", ... },
//   category: { category_id: 3, name: "Bar", ... }
// }]
```

## Legacy Pattern: Flat Schemas (Deprecated)

**Avoid:** Creating flat schemas with aliased fields. This duplicates field definitions and loses type safety.

```typescript
// ❌ LEGACY - Do not use for new code
export const OrderItem_Flat_Schema = z.object({
  order_item_id: z.number(),
  product_def_title: z.string(),  // Duplicates ProductDefinitionSchema.title
  category_name: z.string()        // Duplicates ProductCategorySchema.name
});
```

Use nested schemas with `transformToNestedObjects` instead.

## Best Practice: defaultOrderBy in API Functions

When implementing sortable queries with optional user-provided sorting, avoid duplicate ORDER BY columns:

```typescript
async function loadItems(
  itemId: number,
  where?: WhereConditionGroup<Item> | null,
  orderBy?: SortDescriptor<Item>[] | null
): Promise<Item[]> {
  // ✅ CORRECT: Use user orderBy OR default (mutually exclusive)
  const completeOrderBy: SortDescriptor<Item>[] =
    orderBy && orderBy.length > 0
      ? orderBy
      : [{ key: "item.created_at", direction: "desc" }];

  const request: PredefinedQueryRequest<Item> = {
    namedQuery: "items_query",
    payload: {
      where: { key: "item.parent_id", whereCondOp: "=", val: itemId },
      orderBy: completeOrderBy
    }
  };
  // ...
}
```

**Anti-Pattern** (creates SQL errors with duplicate columns):
```typescript
// ❌ WRONG - Always appends default, even if user already sorted by that column
const defaultOrderBy = [{ key: "item.created_at", direction: "desc" }];
const completeOrderBy = [];
if (orderBy) completeOrderBy.push(...orderBy);
completeOrderBy.push(...defaultOrderBy); // BUG: Creates duplicate if orderBy contains same key!

// Example: If user sorts by "item.created_at" ascending:
// Result: ORDER BY item.created_at ASC, item.created_at DESC  ❌
// SQL Server error: "ORDER BY items must be unique"
```

**Reference Implementations:**
- `src/lib/api/client/supplier.ts` (`loadCategoriesForSupplier`, `loadOrdersForSupplier`)
- `src/lib/api/client/order.ts` (`loadOrderItemsForOrder`)

## Architecture Benefits

1. **Single Source of Truth**: Schema definition includes all metadata - no separate registry needed
2. **Compile-Time Type Safety**: TypeScript validates column names at compile time
3. **Runtime Compatibility**: Uses Zod's `.meta()` for runtime validation
4. **JOIN Support**: Automatic qualified column generation for complex queries
5. **No Manual Maintenance**: Column lists are derived from schemas
6. **Self-Contained**: Each schema carries its own database metadata

## Technical Implementation

### Metadata Storage Strategy

Our implementation uses a custom metadata storage approach:

1. **`__brandMeta` Property**: Runtime metadata is stored directly on schema objects as `__brandMeta`
2. **Export/Import Safe**: This property survives module export/import cycles
3. **Zod Compatibility**: We still call Zod's `.meta()` for potential future compatibility, but don't rely on it

### Why Not Use Zod's `.meta()`?

Zod's `.meta()` method (as of v4) is designed for JSON Schema generation and registry purposes. It:
- Adds schemas to `z.globalRegistry` when an `id` is provided
- Is primarily for schema documentation and JSON Schema export
- Does not persist metadata on the schema object itself for runtime access
- Does not survive module export/import cycles

Our `__brandMeta` approach ensures reliable runtime access to metadata across the entire application.

### Schema Registry Replacement

The branded schemas completely replace the need for a separate table registry. All necessary information is embedded directly in the schemas:

```typescript
// Before: Separate registry needed
const TableRegistry = {
  wholesalers: { schema: WholesalerSchema, alias: "w", ... }
}

// Now: Self-contained branded schemas with __brandMeta
const WholesalerSchema = createSchemaWithMeta(
  z.object({ ... }),
  { alias: "w", tableName: "wholesalers", dbSchema: "dbo" }
);
// Metadata accessible via: (WholesalerSchema as any).__brandMeta
```

## File Structure

- `domainTypes.ts`: All schema definitions with `createSchemaWithMeta`
- `domainTypes.utils.ts`: Type utilities and runtime functions
- `queryGrammar.ts`: Query DSL types using the generated column types
- `queryBuilder.ts`: SQL generation using schema metadata

## Testing

```typescript
// Type safety test
const testColumns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
// Should compile without errors and provide IntelliSense for available columns

// Runtime metadata access
const wholesalerMeta = (WholesalerSchema as any)._def.meta;
console.log(wholesalerMeta); // { alias: "w", tableName: "wholesalers", dbSchema: "dbo" }

// Query building test
const queryPayload: QueryPayload<Wholesaler> = {
  select: ["wholesaler_id", "name", "w.status"],
  from: { table: "dbo.wholesalers", alias: "w" }
};
```

## TypeScript Constraints

Some TypeScript limitations when working with collections of branded schemas require workarounds:

- Mapped types over schema collections need helper types like `GetQualifiedColumnsFromSchema`
- Distributive conditional types require careful constraint management
- The `extends z.ZodObject<any> & { _meta: any }` pattern ensures type safety while maintaining flexibility