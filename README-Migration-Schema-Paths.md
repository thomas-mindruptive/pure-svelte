# Schema-Path Migration Guide: From DB-Aliases to Unified Object Notation

## Executive Summary

The codebase currently has an **impedance mismatch** between three different path notations:
1. **DB-Aliases** (`"pd.title"`, `"w.name"`) - Used in SQL queries and sorting
2. **Schema-Paths** (`"product_def.title"`, `"wholesaler.name"`) - Natural object structure
3. **Tuple-Paths** (`["product_def", "title"]`) - Used by pathUtils for type-safe access

This document outlines the migration strategy to unify these notations, improving developer experience and type safety while maintaining backward compatibility.

---

## The Problem: Mixed Notations Everywhere

### Current State Analysis

```typescript
// Grid Column Definition - INCONSISTENT
const columns: ColumnDef[] = [
  {
    key: "pd.title",                        // ❌ DB-Alias
    accessor: (o) => o.product_def.title,   // ❌ Schema-Path
    sortable: true,
  },
  {
    key: "w.name",                          // ❌ DB-Alias
    accessor: (o) => o.wholesaler.name,     // ❌ Schema-Path
    sortable: true,
  },
];
```

### Where This Inconsistency Exists

| Component Layer | Current Notation | Example |
|-----------------|------------------|---------|
| **Grid Column Keys** | DB-Aliases | `"pd.title"`, `"wio.price"` |
| **Grid Accessors** | Schema-Paths | `offering.product_def.title` |
| **QueryBuilder** | DB-Aliases | `WHERE pd.title = @p1` |
| **API Client** | DB-Aliases | `sort: [{ key: "pd.title" }]` |
| **FormShell** | Tuple-Paths | `pathUtils.get(data, ["product_def", "title"])` |

### The Architectural Challenge

The QueryBuilder and SQL layer MUST use DB-aliases for performance:
```sql
SELECT pd.title, w.name, wio.price
FROM dbo.wholesaler_item_offerings wio
INNER JOIN dbo.product_definitions pd ON ...
INNER JOIN dbo.wholesalers w ON ...
ORDER BY pd.title ASC  -- Must be DB-alias!
```

But the UI layer naturally works with JavaScript objects:
```typescript
const title = offering.product_def.title;  // Natural object access
```

---

## Migration Strategy: Hybrid Approach with Progressive Enhancement

### Phase 1: Foundation (No Breaking Changes)

#### 1.1 Extend Type System

Create parallel type definitions that support both notations:

```typescript
// domainTypes.utils.ts - NEW ADDITIONS

/**
 * String representation of schema paths
 * "product_def.title" | "wholesaler.name" | "price"
 */
export type SchemaStringPath<T> = /* ... implementation ... */;

/**
 * Convert between notations
 */
export function schemaPathToDbPath<T extends z.ZodObject<z.ZodRawShape>>(
  path: string | NonEmptyPath<z.infer<T>>,
  schema: T,
  context?: { hasJoins: boolean }
): string {
  // "product_def.title" → "pd.title"
  // ["product_def", "title"] → "pd.title"
  // "price" → "wio.price" (if hasJoins)
}

export function stringPathToTuple<T>(path: string): NonEmptyPath<T> {
  // "product_def.title" → ["product_def", "title"]
}
```

#### 1.2 Enhance ColumnDef Type

Support both flat and nested data structures:

```typescript
// Datagrid.types.ts - EXTENDED

export type ColumnDef<S extends z.ZodObject<any>> =
  // Flat structure with DB-alias (legacy/existing)
  | {
      key: QualifiedColumnsFromBrandedSchemaWithJoins<S>;
      header: string;
      accessor?: ((row: any) => unknown) | null;
      sortable?: boolean;
      flat: true;  // NEW: Explicit flat flag
    }
  // Nested structure with Schema-path (new)
  | {
      key: SchemaStringPath<S>;
      header: string;
      accessor?: ((row: z.infer<S>) => unknown) | null;
      sortable?: boolean;
      flat?: false;  // Default: nested
    }
  // Computed columns
  | {
      key: "<computed>";
      header: string;
      accessor: (row: any) => unknown;
      sortable: false;
    };
```

### Phase 2: Smart Data Grid (Backward Compatible)

#### 2.1 Intelligent getValue with Auto-Detection

```typescript
// Datagrid.svelte - ENHANCED

import * as pathUtils from "$lib/utils/pathUtils";
import { stringPathToTuple, schemaPathToDbPath } from "$lib/domain/domainTypes.utils";

function getCellValue(row: any, column: ColumnDef<any>) {
  // 1. Computed columns
  if (column.key === "<computed>") {
    return column.accessor!(row);
  }

  // 2. Custom accessor provided
  if (column.accessor) {
    return column.accessor(row);
  }

  // 3. Auto-detection based on structure
  if (column.flat || isDbAlias(column.key)) {
    // Flat structure: row["pd.title"]
    return row[column.key] ?? "—";
  } else {
    // Nested structure: pathUtils.get(row, ["product_def", "title"])
    const tuplePath = stringPathToTuple(column.key);
    try {
      return pathUtils.get(row, tuplePath) ?? "—";
    } catch {
      // Fallback: Maybe it's actually flat?
      return row[column.key] ?? "—";
    }
  }
}

function isDbAlias(key: string): boolean {
  // DB aliases typically have short prefixes
  return /^[a-z]{1,4}\./i.test(key);
}
```

#### 2.2 Smart Sorting Conversion

```typescript
// Datagrid.svelte - handleSort

function handleSort(column: ColumnDef<typeof Schema>) {
  if (!column.sortable || column.key === "<computed>") return;

  let dbPath: string;

  if (column.flat || isDbAlias(column.key)) {
    // Already a DB-alias
    dbPath = column.key;
  } else {
    // Convert Schema-path → DB-path
    const tuplePath = stringPathToTuple<Schema>(column.key);
    dbPath = schemaPathToDbPath(tuplePath, Schema, { hasJoins: true });
  }

  // Send DB-path to backend
  onSort?.([{ key: dbPath, direction: sortDirection }]);
}
```

### Phase 3: Grid-by-Grid Migration

#### 3.1 Migration Pattern for Individual Grids

**Before (Mixed Notations):**
```typescript
// OfferingGrid.svelte - BEFORE
const columns: ColumnDef[] = [
  {
    key: "pd.title",                              // DB-Alias
    header: "Product",
    accessor: (o) => o.product_def.title || "—",  // Schema-Path
    sortable: true,
  },
];
```

**After (Unified Schema-Paths):**
```typescript
// OfferingGrid.svelte - AFTER
const columns: ColumnDef[] = [
  {
    key: "product_def.title",    // ✅ Schema-Path
    header: "Product",
    sortable: true,
    // accessor auto-generated via pathUtils!
  },
];
```

**For Flat Data (Keep As-Is):**
```typescript
// OfferingGridFlat.svelte - NO CHANGES NEEDED
const columns: ColumnDef[] = [
  {
    key: "pd.title",             // DB-Alias
    header: "Product",
    flat: true,                  // ✅ Explicit flag
    sortable: true,
  },
];
```

### Phase 4: API Layer (Optional Future Enhancement)

#### 4.1 Schema-Aware QueryPayload

```typescript
// schemaQueryGrammar.ts - NEW FILE

export interface SchemaQueryPayload<T> {
  select: SchemaPath<T>[];           // ["product_def.title", "price"]
  where?: SchemaWhereCondition<T>;   // { key: "price", op: ">", val: 10 }
  orderBy?: SchemaSortDescriptor<T>[];  // { key: "product_def.title", direction: "asc" }
  // ... rest
}

// Conversion at API boundary
export function convertSchemaPayloadToDbPayload<T>(
  payload: SchemaQueryPayload<T>,
  schema: T
): QueryPayload<any> {
  // Convert all schema-paths to DB-aliases
}
```

---

## Migration Checklist

### Immediate Actions (No Breaking Changes)

- [ ] Add `SchemaStringPath` type to `domainTypes.utils.ts`
- [ ] Add path conversion functions (`schemaPathToDbPath`, `stringPathToTuple`)
- [ ] Extend `ColumnDef` type with `flat` flag
- [ ] Update `Datagrid.svelte` with smart `getCellValue`
- [ ] Update `Datagrid.svelte` with smart `handleSort`
- [ ] Test with one existing flat grid (should work unchanged)
- [ ] Test with one new nested grid using schema-paths

### Progressive Migration (Per Grid)

For each grid component:

1. **Analyze Current State:**
   - [ ] Does it receive flat or nested data?
   - [ ] Are there custom accessors that must be preserved?
   - [ ] Is it used in multiple contexts?

2. **Choose Migration Strategy:**

   **Option A: Keep Flat (Simple)**
   - [ ] Add `flat: true` flag to columns
   - [ ] Keep DB-aliases in keys
   - [ ] No other changes needed

   **Option B: Migrate to Schema-Paths (Recommended for nested data)**
   - [ ] Change keys from DB-aliases to schema-paths
   - [ ] Remove redundant accessors (auto-generated via pathUtils)
   - [ ] Keep custom accessors only where formatting is needed
   - [ ] Test sorting still works

3. **Verify:**
   - [ ] Data displays correctly
   - [ ] Sorting sends correct DB-aliases to backend
   - [ ] No TypeScript errors
   - [ ] Performance unchanged

### Long-term Improvements (Future)

- [ ] Implement `SchemaQueryPayload` for full abstraction
- [ ] Update QueryBuilder to accept schema-paths optionally
- [ ] Create migration tool to auto-convert column definitions
- [ ] Document best practices for new grids

---

## Examples and Patterns

### Pattern 1: Simple Flat Grid (No Changes)

```typescript
// Data structure: Flat with DB-aliases as keys
const data = [
  {
    "offering_id": 123,
    "pd.title": "Rose Quartz",
    "w.name": "Crystal Supplier",
    "price": 12.99
  }
];

// Grid definition: Keep as-is with flat flag
const columns: ColumnDef[] = [
  { key: "pd.title", header: "Product", flat: true, sortable: true },
  { key: "w.name", header: "Supplier", flat: true, sortable: true },
  { key: "price", header: "Price", flat: true, sortable: true },
];
```

### Pattern 2: Nested Object Grid (Recommended Migration)

```typescript
// Data structure: Nested objects
const data = [
  {
    offering_id: 123,
    price: 12.99,
    product_def: {
      product_def_id: 456,
      title: "Rose Quartz"
    },
    wholesaler: {
      wholesaler_id: 789,
      name: "Crystal Supplier"
    }
  }
];

// Grid definition: Use schema-paths
const columns: ColumnDef[] = [
  {
    key: "product_def.title",   // Schema-path
    header: "Product",
    sortable: true,
    // No accessor needed - auto-generated!
  },
  {
    key: "wholesaler.name",      // Schema-path
    header: "Supplier",
    sortable: true
  },
  {
    key: "price",                // Direct field
    header: "Price",
    sortable: true,
    // Custom formatting only when needed
    accessor: (o) => o.price ? `$${o.price.toFixed(2)}` : "—"
  },
];
```

### Pattern 3: Mixed Context Grid

```typescript
// Grid that works with both flat AND nested data
const columns: ColumnDef[] = [
  {
    key: "product_def.title",
    header: "Product",
    sortable: true,
    // Universal accessor that handles both
    accessor: (row) => {
      // Try nested first
      if (row.product_def?.title) return row.product_def.title;
      // Fall back to flat
      if (row["pd.title"]) return row["pd.title"];
      return "—";
    }
  },
];
```

---

## Benefits of This Migration

### Immediate Benefits (Phase 1-2)
- ✅ **No breaking changes** - Existing code continues to work
- ✅ **Type safety** - Schema-paths are validated by TypeScript
- ✅ **Less boilerplate** - Auto-generated accessors via pathUtils
- ✅ **Clearer intent** - `flat: true` makes data structure explicit

### Long-term Benefits (Phase 3-4)
- ✅ **Unified mental model** - Think in object notation everywhere
- ✅ **Better IntelliSense** - Auto-completion for schema-paths
- ✅ **Easier refactoring** - Schema changes propagate automatically
- ✅ **Framework alignment** - Aligns with Svelte's reactive object model

### Developer Experience Improvements
- ✅ **One notation in UI code** - Schema-paths everywhere in components
- ✅ **Automatic conversion** - Framework handles DB-alias conversion
- ✅ **Progressive migration** - Migrate grids one at a time
- ✅ **Backward compatible** - Old grids keep working

---

## Technical Considerations

### Performance
- Path resolution via `pathUtils.get()` has minimal overhead
- Conversion happens only during sorting (user interaction)
- No impact on initial render performance

### Type Safety
- Schema-paths are fully type-checked at compile time
- Invalid paths cause TypeScript errors, not runtime errors
- Refactoring tools work correctly with schema-paths

### Testing Strategy
1. **Unit tests** for conversion functions
2. **Integration tests** for mixed grids
3. **Regression tests** for existing flat grids
4. **E2E tests** for sorting functionality

---

## Decision Matrix

| Scenario | Recommendation | Reasoning |
|----------|---------------|-----------|
| **New grid with nested data** | Use schema-paths | Clean, type-safe, future-proof |
| **New grid with flat data** | Use DB-aliases with `flat: true` | Matches data structure |
| **Existing grid working well** | Add `flat: true`, no other changes | If it ain't broke... |
| **Existing grid with issues** | Migrate to schema-paths | Fix issues during migration |
| **High-traffic grid** | Keep current implementation | Minimize risk |
| **Internal admin grid** | Migrate to schema-paths | Good testing ground |

---

## FAQ

**Q: Will this break existing grids?**
A: No. The migration is fully backward compatible. Existing grids continue to work unchanged.

**Q: Do I have to migrate all grids at once?**
A: No. Migration is progressive. Migrate one grid at a time as needed.

**Q: What about performance?**
A: Negligible impact. Path resolution is fast, and conversion only happens during user interactions.

**Q: Can I use both notations in the same grid?**
A: Yes, but not recommended. Choose one notation per grid for consistency.

**Q: What if my data structure changes between flat and nested?**
A: Use explicit accessors that handle both cases (see Pattern 3).

---

## Conclusion

This migration strategy provides a path to cleaner, more maintainable code while preserving backward compatibility. The hybrid approach allows teams to migrate progressively, reducing risk and allowing for learning along the way.

The end goal is a codebase where:
- **UI components** think in schema-paths (natural object notation)
- **SQL layer** uses DB-aliases (performance optimized)
- **Conversion happens automatically** at the boundaries

This separation of concerns leads to better developer experience, fewer bugs, and easier maintenance.