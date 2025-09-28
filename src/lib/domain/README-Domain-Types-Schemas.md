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

## Usage Examples

### Define JOIN Schema with Nested Branded Schemas

```typescript
export const OrderItem_ProdDef_Category_Schema = OrderItemSchema.extend({
  product_def: ProductDefinitionSchema,  // Branded schema with _meta
  category: ProductCategorySchema        // Branded schema with _meta
});
```

### Generate Type-Safe Columns

```typescript
// Automatically generates correctly typed qualified columns
const columns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
// Type: ("order_item_id" | "quantity" | "pd.product_def_id" | "pd.title" | "pc.category_id" | "pc.name" | ...)[]
```

### Use in Query Builder

```typescript
const query: QueryPayload<OrderItem_ProdDef_Category> = {
  select: genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema),
  from: { table: "dbo.order_items", alias: "ori" },
  joins: [
    {
      type: JoinType.INNER,
      table: "dbo.product_definitions",
      alias: "pd",
      on: { /* ... */ }
    }
  ]
};
```

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