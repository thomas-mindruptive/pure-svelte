# SupplierBrowser - 5-Level Hierarchical Data Management

**5-stufige URL-driven Navigation** für Supplier/Wholesaler-Datenmanagement mit End-to-End Type Safety.

## Business Context

**Problem**: Tausende Lieferanten mit Kategorien, Produktangeboten, Attributen und Links verwalten.
**Lösung**: 5-Level Navigation: Supplier → Category → Offering → Attributes/Links. URL-getrieben für Bookmarking.
**Domain**: B2B-Beschaffung, Wholesale-Management, Produktkataloge

## System Architecture

### Database Schema (MSSQL)
```sql
dbo.wholesalers              -- Supplier-Stammdaten
dbo.product_categories       -- Produktkategorien (global)  
dbo.wholesaler_categories    -- n:m Supplier-Category Assignment
dbo.wholesaler_item_offerings -- Produktangebote pro Supplier+Category
dbo.wholesaler_offering_attributes -- Key-Value Attribute pro Offering
dbo.wholesaler_offering_links     -- URLs/Links pro Offering
```

### Hierarchische Navigation
1. **Suppliers** (Wholesalers) - Hauptlieferanten
2. **Categories** - Produktkategorien pro Supplier  
3. **Offerings** - Produktangebote pro Category
4. **Attributes** - Produkteigenschaften pro Offering
5. **Links** - Externe Referenzen pro Offering

**URL-driven State**: Alle Parameter in URL (level, supplierId, categoryId, etc.)

## Implementation Status

### ✅ Level 1-2 (API Integrated)
- **Complete API Integration** - No mock data, all real DB calls
- **HierarchySidebar.svelte** - Navigation mit counts & disabled states  
- **SupplierGrid/Form.svelte** - CRUD operations, validation, responsive design
- **CategoryGrid.svelte** - Category assignments per supplier
- **CategoryAssignment.svelte** - n:m relationship management
- **API Client System** - Type-safe clients in `$lib/api/client/`
- **API Types System** - Shared request/response types in `$lib/api/types/`
- **Suppliers API** - `/api/suppliers/[id]` GET/POST/PUT/DELETE complete
- **Categories API** - `/api/categories` & `/api/supplier-categories` complete
- **loadSupplierCategories()** - Loads supplier's categories with offering counts

### 🔄 Level 3-5 (Planned)
- **OfferingForm.svelte** - ⏱️ TODO
- **Offerings API** - ⏱️ TODO (`/api/offerings/[id]`)
- **AttributeGrid/Form.svelte** - ⏱️ Stubs vorhanden, Forms TODO  
- **LinkGrid/Form.svelte** - ⏱️ Stubs vorhanden, Forms TODO
- **APIs für Attributes/Links** - ⏱️ Komplett TODO

## Core Architecture Patterns

### 1. QueryBuilder Security Pattern
```typescript
// Client sendet Query OHNE 'from' (optional) - Server setzt Table
const query: QueryPayload = {
  select: ["name", "region", "status"],
  where: { op: LogicalOperator.AND, conditions: [...] }
  // ⚠️ KEIN 'from' field - Server sets for security
};

// Server fügt Security hinzu:
const securePayload: QueryPayload = {
  ...clientPayload,
  from: 'dbo.wholesalers', // ✅ Route = Table binding
  where: { /* supplier ID filter + client conditions */ }
};
```

### 2. Type-Safe API Clients
```typescript
// Usage
import { loadSuppliers, updateSupplier, loadSupplierCategories } from '$lib/api/client/supplier';

const suppliers = await loadSuppliers({
  select: ['name', 'region', 'status'],
  where: { 
    op: LogicalOperator.AND, 
    conditions: [{ key: 'status', op: ComparisonOperator.EQUALS, val: 'active' }] 
  }
});

// Load supplier's categories with offering counts
const categories = await loadSupplierCategories(supplierId);
```

### 3. JOIN View Pattern
```typescript
// queryConfig.ts - Predefined JOIN configurations
'supplier_categories': {
  from: 'dbo.wholesalers w',
  joins: [
    { type: JoinType.INNER, table: 'dbo.wholesaler_categories', alias: 'wc' },
    { type: JoinType.INNER, table: 'dbo.product_categories', alias: 'pc' },
    { type: JoinType.LEFT, table: '(SELECT ... COUNT(*) as offering_count ...)', alias: 'oc' }
  ],
  exampleQuery: {
    select: ['w.name AS supplier_name', 'pc.name AS category_name', 'oc.offering_count']
  }
}
```

### 4. URL-Driven State (Svelte 5 Runes)
```typescript
const currentLevel = $derived(($page.url.searchParams.get('level') as Level) || 'wholesalers');
const selectedSupplierId = $derived(Number($page.url.searchParams.get('supplierId')) || null);

function updateURL(params: { level?: Level; supplierId?: number }) {
  goto(`?${new URLSearchParams(params).toString()}`);
}
```

## Tech Stack & Key Decisions

- **SvelteKit** mit Svelte 5 + Runes
- **TypeScript** strict mode
- **MSSQL** mit connection pooling
- **Shared queryConfig** in `$lib/clientAndBack/queryConfig.ts` (client + server access)
- **End-to-End Types** zwischen Client/Server APIs

### Why QueryBuilder Pattern?
Flexible queries ohne hard-coded SQL, Security durch server-side table binding.

### Why URL-driven State?  
Bookmarkable, shareable application state ohne complex state management.

## Key File Locations

### API Layer  
- `$lib/api/client/` - Client-side API functions (supplier.ts, category.ts)
- `$lib/api/types/` - Shared API type definitions
- `$lib/clientAndBack/queryConfig.ts` - Security whitelists + JOIN configurations

### Server Layer
- `/src/routes/api/suppliers/` - Supplier REST endpoints
- `/src/routes/api/categories/` - Category REST endpoints  
- `/src/routes/api/supplier-categories/` - Category assignment endpoints

### Components
- `/src/lib/components/domain/suppliers/` - Supplier-specific UI
- `/src/lib/components/domain/categories/` - Category management UI
- `/src/lib/components/client/` - Reusable UI (Datagrid, FormShell)
- `/src/lib/components/browser/` - Navigation components

### Test Environment
- `/src/routes/supplierbrowser/` - Main test page (API integrated)

## Current Development Priorities

### 🔥 P1 - High (Final Integration)
1. **Page Integration Complete** - Replace remaining mock usage in components
2. **Error Boundaries** - Graceful error handling in UI
3. **Loading State Integration** - Connect LoadingState with UI components

### 🎯 P2 - Medium (Level 3 Prep)
1. **OfferingForm.svelte** - Wrapper für WholesalerItemOffering
2. **Offering API Types** - Following supplier.ts pattern
3. **Offering API Client & Endpoints** - Full CRUD

### 🌟 P3 - Future
1. **Level 4-5** - Attributes/Links management
2. **Performance** - Virtual scrolling für große Datasets
3. **Bulk Operations** - Multiple selection mit bulk delete

## Development Guidelines

### Svelte 5 + Runes
```typescript
// ✅ Svelte 5
let data = $state([...]);
const filtered = $derived(data.filter(...));

// Props destructuring  
const { rows = [], onRowClick } = $props<{
  rows?: Supplier[];
  onRowClick?: (supplier: Supplier) => void;
}>();
```

### API Client Patterns
```typescript
// ✅ QueryBuilder usage
const query: QueryPayload = {
  select: ['name', 'status'],
  // from is optional - server sets it
  where: { op: LogicalOperator.AND, conditions: [...] }
};

// ✅ Error handling
try {
  const data = await loadSuppliers(query);
} catch (error) {
  console.error('Failed:', getErrorMessage(error));
}
```

# Type Safety Lessons Learned

## Critical Bug: Missing Type Enforcement in API Endpoints

### The Problem
Despite having comprehensive type definitions in `$lib/api/types/`, **ALL** server endpoints were written without type enforcement, leading to runtime bugs that TypeScript couldn't catch.

### Root Cause Analysis

**Defined Types vs Implementation Gap:**
```typescript
// ✅ Types were correctly defined
interface SupplierQueryResponse {
  results: Partial<Wholesaler>[];
  meta: QueryResultMeta;
}

// ❌ Server ignored the types
export const POST: RequestHandler = async () => {
  return json({
    suppliers: results  // Wrong field name!
  });
};

// ❌ Client trusted the types blindly
const response = await fetch(...) as SupplierQueryResponse;
const suppliers = response.results; // Runtime error: undefined
```

### Systematic Issues Found

1. **`/api/suppliers/+server.ts`** - Returned `suppliers` instead of `results`
2. **`/api/suppliers/[id]/+server.ts`** - No type enforcement
3. **`/api/categories/+server.ts`** - No type enforcement  
4. **`/api/supplier-categories/+server.ts`** - No type enforcement

### The Fix: Mandatory Type Enforcement

**Before (Wrong):**
```typescript
export const POST: RequestHandler = async () => {
  return json({
    suppliers: results,  // No compile-time validation
    meta: { /* ... */ }
  });
};
```

**After (Correct):**
```typescript
import type { SupplierQueryResponse } from '$lib/api/types/supplier';

export const POST: RequestHandler = async () => {
  // ✅ TypeScript now ENFORCES the correct structure
  const response: SupplierQueryResponse = {
    results: results,  // Must match interface
    meta: { /* ... */ }
  };
  
  return json(response); // Compile-time guaranteed correct
};
```

### Why TypeScript Didn't Catch This

1. **Runtime vs Compile-Time Gap**: TypeScript can't validate what the server actually returns at runtime
2. **Type Assertions**: Using `as` bypasses compile-time checking
3. **Missing Enforcement**: Server responses weren't typed to their interfaces

### Mandatory Rules Going Forward

#### Rule 1: Always Import Response Types
```typescript
// ✅ REQUIRED for every API endpoint
import type { 
  SupplierQueryResponse,
  UpdateSupplierResponse 
} from '$lib/api/types/supplier';
```

#### Rule 2: Type All Responses
```typescript
// ✅ REQUIRED pattern for all endpoints
const response: ExpectedResponseType = {
  // TypeScript will enforce structure
};
return json(response);
```

#### Rule 3: Never Direct json() Returns
```typescript
// ❌ FORBIDDEN - bypasses type checking
return json({ someField: data });

// ✅ REQUIRED - type-enforced
const response: ResponseType = { someField: data };
return json(response);
```

### Type Safety Checklist

**Before merging any API endpoint:**

- [ ] Imports correct response type from `$lib/api/types/`
- [ ] Declares response variable with explicit type
- [ ] Uses `json(response)` not `json({ ... })`
- [ ] TypeScript compiles without errors
- [ ] Client and server use identical type definitions

### Architecture Benefits

With proper type enforcement:

1. **Compile-Time Safety**: Interface mismatches caught during development
2. **Refactor Safety**: Type changes automatically propagate
3. **Documentation**: Types serve as executable contracts
4. **Runtime Consistency**: Server responses guaranteed to match client expectations

### Performance Note

Type enforcement has **zero runtime cost** - it's purely compile-time validation that prevents entire classes of bugs from reaching production.

**Current Status: ~95% Level 1-2 Complete, 10% Level 3-5**  
**Target: Production-ready 5-level hierarchical data management system**