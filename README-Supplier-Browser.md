# SupplierBrowser - Hierarchical Data Management System

Ein **5-Ebenen hierarchisches Navigationssystem** für Supplier/Wholesaler-Datenmanagement mit URL-driven State und End-to-End Type Safety.

## 🎯 Business Context

**Problem**: Unternehmen müssen Tausende von Lieferanten (Wholesalers) verwalten, deren Produktkategorien, spezifische Angebote, Attribute und externe Links. Traditionelle Listen-UI skaliert nicht für hierarchische Datenstrukturen.

**Lösung**: 5-stufige Navigation ermöglicht Drill-Down von Supplier → Category → Offering → Attributes/Links. URL-getrieben für Bookmarking und Sharing.

**Domain**: B2B-Beschaffung, Wholesale-Management, Produktkataloge

## 🗗️ System Architecture

### Database Schema (MSSQL)
```sql
-- Core Tables (vereinfacht)
dbo.wholesalers              -- Supplier-Stammdaten
dbo.product_categories       -- Produktkategorien (global)
dbo.wholesaler_categories    -- n:m Supplier-Category Assignment
dbo.wholesaler_item_offerings -- Produktangebote pro Supplier+Category
dbo.wholesaler_offering_attributes -- Key-Value Attribute pro Offering  
dbo.wholesaler_offering_links     -- URLs/Links pro Offering
```

### Domain Entities (siehe `/src/lib/domain/types.ts`)
- **Wholesaler** - Lieferant mit `dropship: boolean`, Region, Status
- **ProductCategory** - Globale Kategorien wie "Laptops", "Smartphones" 
- **WholesalerCategory** - Assignment mit Comment und Link pro Supplier
- **WholesalerItemOffering** - Konkretes Produkt mit Price, Size, Currency
- **WholesalerOfferingAttribute** - z.B. "RAM: 16GB", "Color: Red"
- **WholesalerOfferingLink** - Externe URLs wie Produktseiten, Datenblätter

### Hierarchische Ebenen
1. **Suppliers** (Wholesalers) - Hauptlieferanten
2. **Categories** - Produktkategorien pro Supplier  
3. **Offerings** - Produktangebote pro Category
4. **Attributes** - Produkteigenschaften pro Offering
5. **Links** - Externe Referenzen pro Offering

### Navigation Pattern
- **URL-driven State**: Alle Parameter in URL (level, supplierId, categoryId, etc.)
- **Sidebar Navigation**: Dynamische disabled states basierend auf Selection
- **Breadcrumb Logic**: Ebene 4-5 sind umschaltbar (Attributes ↔ Links)

## 📊 Implementation Status

### ✅ Level 1-2 (API Integration In Progress)
- **HierarchySidebar.svelte** - Navigation mit counts & disabled states
- **SupplierGrid/Form.svelte** - CRUD operations, validation, responsive design
- **CategoryGrid.svelte** - Category assignments per supplier  
- **CategoryAssignment.svelte** - n:m relationship management
- **API Client Structure** - Type-safe client functions in `$lib/api/client/`
- **API Types System** - Shared request/response types in `$lib/api/types/`
- **Suppliers API** - `/api/suppliers/[id]` GET/POST/PUT/DELETE vollständig
- **Categories API** - `/api/categories` & `/api/supplier-categories` vollständig

### 🔄 Current Focus: API Integration
- **API Client Common** - `$lib/api/client/common.ts` ✅ Ready
- **Supplier API Client** - `$lib/api/client/supplier.ts` 🔄 In Progress
- **Category API Client** - `$lib/api/client/category.ts` ⏳ Next
- **Page Integration** - Replace mockData with API calls ⏳ Planned

### Test level 1-2
Test supplier browser level 1-2 mit echten DB-daten - ⌛ TODO

### 🔄 Level 3 (Planned After API Integration)  
- **OfferingForm.svelte** - ⌛ TODO
- **Offerings API** - ⌛ TODO (`/api/offerings/[id]`)

### ⏳ Level 4-5 (Planned)
- **AttributeGrid/Form.svelte** - ⌛ Stubs vorhanden, Forms TODO  
- **LinkGrid/Form.svelte** - ⌛ Stubs vorhanden, Forms TODO
- **Toggle zwischen Attributes/Links** - ⌛ UI-Logic TODO
- **APIs für Attributes/Links** - ⌛ Komplett TODO

### Production Transition Pattern (Updated)
```typescript
// OLD: Mock (Development)
let mockData = $state({ suppliers: [...] });

// NEW: API Integration (Current)
import { loadSuppliers, updateSupplier } from '$lib/api/client/supplier';

let suppliers = $state<Supplier[]>([]);
let loading = $state(false);

// Reactive API loading
$effect(async () => {
  loading = true;
  try {
    suppliers = await loadSuppliers({
      select: ['name', 'region', 'status', 'dropship'],
      orderBy: [{ key: 'name', direction: 'asc' }]
    });
  } catch (error) {
    console.error('Failed to load suppliers:', error);
  } finally {
    loading = false;
  }
});
```

### Mock-Daten Struktur (Being Replaced)
- **3 Suppliers** mit unterschiedlichen Regionen/Status
- **6 Categories** global verfügbar  
- **Assigned Categories** pro Supplier mit `offering_count`
- **Mock Offerings** für Supplier+Category Kombinationen

## 🎯 Core Technologies

### Framework & Language  
- **SvelteKit** mit Svelte 5 + Runes
- **TypeScript** mit strict compiler options
- **MSSQL** Database mit connection pooling

### API Architecture (NEW)
- **Type-Safe API Clients** in `$lib/api/client/`
- **Shared API Types** in `$lib/api/types/`
- **Client-Server Type Consistency** end-to-end
- **Structured Error Handling** mit ApiError class
- **Loading State Management** mit LoadingState class
- **Retry Logic** für failed requests

## 🔧 Core Implementation Patterns

### 1. URL-Driven State (Svelte 5 Runes)
```typescript
// In +page.svelte - State aus URL ableiten
const currentLevel = $derived(($page.url.searchParams.get('level') as Level) || 'wholesalers');
const selectedSupplierId = $derived(Number($page.url.searchParams.get('supplierId')) || null);

// Navigation triggert URL updates statt lokalen State
function updateURL(params: { level?: Level; supplierId?: number }) {
  goto(`?${new URLSearchParams(params).toString()}`);
}
```

### 2. QueryBuilder Security Pattern
```typescript
// Client sendet Query OHNE 'from' - Server setzt Table für Security
const clientPayload: SupplierQueryRequest = {
  select: ["name", "region", "status"],
  where: { op: LogicalOperator.AND, conditions: [...] }
  // ⌛ KEIN 'from' field!
};

// Server fügt Security hinzu in /api/suppliers/[id]/+server.ts:
const securePayload: QueryPayload = {
  ...clientPayload,
  from: 'dbo.wholesalers', // ✅ Route = Table binding
  where: { /* supplier ID filter + client conditions */ }
};
```

### 3. API Client Pattern (NEW)
```typescript
// Type-safe API client usage
import { loadSuppliers, updateSupplier } from '$lib/api/client/supplier';
import { assignCategory } from '$lib/api/client/category';

// Load suppliers with flexible query
const suppliers = await loadSuppliers({
  select: ['name', 'region', 'status'],
  where: { 
    op: LogicalOperator.AND, 
    conditions: [{ key: 'status', op: ComparisonOperator.EQUALS, val: 'active' }] 
  },
  limit: 50
});

// Update supplier with validation
try {
  const updated = await updateSupplier(123, { name: 'New Name', status: 'active' });
  console.log('Updated:', updated.supplier.name);
} catch (error) {
  if (error.errors?.name) {
    console.error('Name validation failed:', error.errors.name);
  }
}
```

### 4. Component Wrapper Pattern
Alle Domain-Components sind dünne Wrapper um generische Basis-Components:

```typescript
// SupplierGrid.svelte wraps Datagrid.svelte
<Datagrid
  {rows}           // Wholesaler[]
  {columns}        // ColumnDef<Wholesaler>[]
  {getId}          // (row) => row.wholesaler_id
  {deleteStrategy} // { execute: (ids) => Promise<void> }
  {rowActionStrategy} // { click: (row) => navigate() }
/>
```

### 5. End-to-End Type Safety (Enhanced)
```typescript
// Shared types in $lib/api/types/supplier.ts
export interface UpdateSupplierRequest {
  name?: string;
  status?: 'active' | 'inactive';
}

// Client (type-safe via API client)
import { updateSupplier } from '$lib/api/client/supplier';
const result = await updateSupplier(123, { name: "New Name" });

// Server (same types)
const request: UpdateSupplierRequest = await event.request.json();
return json({ success: true } satisfies UpdateSupplierResponse);
```

- **QueryBuilder Pattern**: Client definiert Query, Server setzt Security (siehe `src/lib/server/queryBuilder.ts`)
- **Domain Validation**: Type-safe validation per entity (siehe `src/lib/server/validation/domainValidator.ts`)
- **Error Mapping**: MSSQL Constraints → HTTP Status (siehe `src/lib/server/errors/mssqlErrorMapper.ts`)
- **End-to-End Types**: Shared API types zwischen Client/Server (siehe `$lib/api/types/`)

### UI Components
- **Datagrid.svelte** - Generic enterprise-grade grid mit delete workflows
- **FormShell.svelte** - Reusable form wrapper mit validation
- **HierarchySidebar.svelte** - Navigation mit dynamic states

## 🚀 Quick Start

### Development Environment
```bash
npm install
npm run dev
```
Navigate to `/supplierbrowser` für die Test-Umgebung mit Mock-Daten (being transitioned to API calls).

### Database Setup
MSSQL connection config in `src/lib/server/db.ts`.

### API Testing
- Supplier APIs verfügbar unter `/api/suppliers/[id]`
- Category Assignment API unter `/api/supplier-categories`
- Category List API unter `/api/categories`

## 🔍 Key File Locations (Updated)

### API Layer (NEW)
- `$lib/api/types/` - Shared API type definitions (client + server)
  - `common.ts` - BaseApiResponse, HTTP_STATUS, type guards
  - `supplier.ts` - Supplier request/response types  
  - `category.ts` - Category operation types
- `$lib/api/client/` - Client-side API functions (browser only)
  - `common.ts` - apiFetch wrapper, LoadingState, retry logic
  - `supplier.ts` - Type-safe supplier API functions
  - `category.ts` - Type-safe category API functions

### Components
- `/src/lib/components/domain/suppliers/` - Supplier-specific UI
- `/src/lib/components/domain/categories/` - Category management UI  
- `/src/lib/components/client/` - Reusable UI components (Datagrid, etc.)
- `/src/lib/components/browser/` - Navigation components

### Server Layer
- `/src/routes/api/suppliers/` - Supplier REST endpoints
- `/src/routes/api/categories/` - Category REST endpoints
- `/src/routes/api/supplier-categories/` - Category assignment endpoints
- `/src/lib/server/` - Server utilities (QueryBuilder, validation, errors)

### Domain Logic  
- `/src/lib/domain/types.ts` - Domain entity definitions
- `/src/lib/server/supplierQueryConfig.ts` - Security whitelists für QueryBuilder

### Test Environment
- `/src/routes/supplierbrowser/` - Test page (transitioning from mock to API)
- `/src/routes/supplierbrowser/mockData.ts` - Development data (being phased out)

## 🎛️ Configuration

### ESLint Standards
Strikte TypeScript compliance ohne "unexpected any" - siehe `eslint.config.js`.

### CSS Design System  
- `src/lib/components/styles/` - Modulare CSS (grid.css, form.css, sidebar.css)
- Konsistente Farbvariablen: `--color-primary: #4f46e5`

## 🚨 Current Issues & Troubleshooting

### Known Issues
1. **API Integration In Progress** - Some components still use mockData
2. **FormShell + $state Problem** - `structuredClone()` can't clone $state proxies

### Critical Fixes Needed
```typescript
// ⌛ Problem: FormShell crashes with $state proxies
<SupplierForm initial={selectedSupplier} /> // selectedSupplier ist $state proxy

// ✅ Fix: Entproxy beim Prop passing  
<SupplierForm initial={selectedSupplier ? {...selectedSupplier} : undefined} />
```

### Common Development Issues

**"getId threw" Error in Datagrid:**
- Check dass alle Rows eine gültige ID haben
- SupplierGrid erwartet `wholesaler_id`, nicht `id`

**API Client Errors:**
- Check network tab für actual HTTP errors
- Use `getErrorMessage(error)` für user-friendly messages
- Check loading states mit `supplierLoadingState.isLoading`

**"Column not in allowed list" bei QueryBuilder:**
- Check `supplierQueryConfig.allowedTables` in `/lib/server/supplierQueryConfig.ts`
- Neue Columns müssen in whitelist eingetragen werden

**TypeScript "unexpected any" Errors:**
- Projekt hat strikte ESLint rules
- Alle Types müssen explizit sein, kein `any` erlaubt
- Use type assertions: `as Supplier` statt `any`

**Svelte 5 Reactivity Issues:**
```typescript
// ⌛ Svelte 4 syntax - funktioniert nicht
let data = [...];
$: filteredData = data.filter(...);

// ✅ Svelte 5 syntax
let data = $state([...]);
const filteredData = $derived(data.filter(...));
```

### Database Connection Issues
- Check `src/lib/server/db.ts` für MSSQL connection config
- Default: `localhost`, DB: `pureenergyworks`, User: `sa`
- Bei Connection-Fehlern: Server fails to start (intended behavior)

## 🔧 Technical Decisions

### Why API Client Layer?
Eliminates duplicate fetch logic across components and provides consistent error handling. Type-safe integration between UI and server APIs.

### Why QueryBuilder Pattern?
Eliminates hard-coded SQL while maintaining security. Client requests flexible queries, server enforces table binding and access controls.

### Why URL-driven State?  
Makes application state bookmarkable, shareable, and robust. No complex state management needed.

### Why End-to-End Types?
Eliminates runtime type errors between client and server. API changes break at compile time, not runtime.

## 📋 Development Guidelines & Code Conventions

### Svelte 5 + Runes Patterns
```typescript
// ⌛ Svelte 4 - Alt
export let count = 0;
$: doubled = count * 2;

// ✅ Svelte 5 - Neu  
let count = $state(0);
const doubled = $derived(count * 2);

// Props destructuring
const { rows = [], onRowClick } = $props<{
  rows?: Supplier[];
  onRowClick?: (supplier: Supplier) => void;
}>();
```

### Component Architecture Rules
1. **Pages orchestrieren nur** - keine Business Logic in +page.svelte
2. **Domain Components = Thin Wrappers** - SupplierGrid wraps Datagrid
3. **Reusable Components in /client/** - Datagrid, FormShell, etc.
4. **CSS modular** - component.css für jede Komponente

### API Client Patterns (NEW)
```typescript
// ✅ Use type-safe API clients
import { loadSuppliers } from '$lib/api/client/supplier';

// ✅ Handle errors gracefully
try {
  const suppliers = await loadSuppliers(query);
} catch (error) {
  console.error('Failed:', getErrorMessage(error));
}

// ✅ Manage loading states
supplierLoadingState.start('loadSuppliers');
try {
  const data = await loadSuppliers(query);
} finally {
  supplierLoadingState.finish('loadSuppliers');
}
```

### TypeScript Standards (ESLint enforced)
```typescript
// ✅ Explicit types, kein 'any'
const data: Wholesaler = { name: "Supplier", dropship: false };

// ✅ const für unveränderliche Werte
const API_BASE = '/api/suppliers' as const;

// ✅ Enum statt magic strings
enum LogicalOperator { AND = 'AND', OR = 'OR' }
```

### API Endpoint Patterns
```typescript
// Alle APIs folgen diesem Pattern:
export const POST: RequestHandler = async (event) => {
  try {
    // 1. Parse & validate input
    const requestData = await event.request.json();
    const validation = validateDomainEntity(requestData, { mode: 'create' });
    
    // 2. Business logic
    const result = await someBusinessOperation(validation.sanitized);
    
    // 3. Typed response
    return json({ success: true, data: result } satisfies SomeResponse);
  } catch (err) {
    // 4. MSSQL error mapping
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    throw error(status, message);
  }
};
```

## 💤 User Workflows (Examples)

### Workflow 1: Neuen Supplier mit Categories erstellen (API-enabled)
1. `/supplierbrowser` → Suppliers Grid → "Add Supplier" 
2. Navigiert zu Level 2 → SupplierForm (create mode) + leeres CategoryGrid
3. User füllt Name, Region, Dropship aus → "Save Supplier"
4. API Call: `POST /api/suppliers` → Creates new supplier
5. Form wird zu edit mode → CategoryAssignment wird verfügbar
6. User klickt "Assign Category" → API Call: `POST /api/categories` loads options
7. User wählt Category → API Call: `POST /api/supplier-categories` 
8. **Status**: ✅ Ready for API integration

### Workflow 2: Supplier bearbeiten und Category hinzufügen (API-enabled)
1. Suppliers Grid → User klickt Supplier row
2. Navigiert zu Level 2 → API Call: `POST /api/suppliers/[id]` loads data
3. User ändert Region → API Call: `PUT /api/suppliers/[id]` saves changes
4. User assigned neue Category → API Call: `POST /api/supplier-categories`
5. **Status**: ✅ Ready for API integration

### Workflow 3: Category → Offerings → Attributes (Future)
1. Level 2 CategoryGrid → User klickt Category row
2. Navigiert zu Level 3 → API Call: `POST /api/offerings` für diese Category  
3. User klickt Offering → Navigiert zu Level 4 mit OfferingForm
4. Sidebar Toggle "Attributes" → AttributeGrid sichtbar
5. User klickt Attribute → Level 5 AttributeForm
6. **Status**: ⌛ Level 3-5 APIs noch TODO

## 📈 Current Development Priorities

### 🔥 P1 - High (API Integration Completion)
1. **Supplier API Client** - Complete `$lib/api/client/supplier.ts`
2. **Category API Client** - Complete `$lib/api/client/category.ts`  
3. **Page Integration** - Replace mockData with API calls in `/supplierbrowser`
4. **Loading States** - Integrate LoadingState with UI components

### 🎯 P2 - Medium (Level 3 preparation)
1. **OfferingForm.svelte** - Wrapper um FormShell für WholesalerItemOffering
2. **Offering API Types** - `$lib/api/types/offering.ts` nach supplier.ts Pattern  
3. **Offering API Client** - `$lib/api/client/offering.ts`
4. **Offering CRUD API** - `/api/offerings/[id]` GET/POST/PUT/DELETE

### 🌟 P3 - Nice to Have  
1. **Error Boundaries** - Graceful error handling in UI
2. **Performance** - Virtual scrolling für große Datasets
3. **Bulk Operations** - Multiple selection mit bulk delete
4. **Optimistic Updates** - UI updates before API confirmation

## 📄 Immediate Next Steps für neue AI

1. **Complete Supplier API Client** - Finish `loadSuppliers()`, `updateSupplier()`, `deleteSupplier()` functions
2. **Create Category API Client** - Copy supplier.ts pattern für category operations
3. **Integrate API clients** - Replace mockData in `/supplierbrowser/+page.svelte`
4. **Test API Integration** - Verify all CRUD operations work end-to-end

---

**Current Progress: ~95% Level 1-2 (API Integration In Progress), 10% Level 3-5**  
**Target: Production-ready 5-level hierarchical data management system with full API integration**