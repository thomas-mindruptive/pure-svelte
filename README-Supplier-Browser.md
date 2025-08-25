# SupplierBrowser - Hierarchical Data Management System

Ein **5-Ebenen hierarchisches Navigationssystem** für Supplier/Wholesaler-Datenmanagement mit URL-driven State und End-to-End Type Safety.

## 🎯 Business Context

**Problem**: Unternehmen müssen Tausende von Lieferanten (Wholesalers) verwalten, deren Produktkategorien, spezifische Angebote, Attribute und externe Links. Traditionelle Listen-UI skaliert nicht für hierarchische Datenstrukturen.

**Lösung**: 5-stufige Navigation ermöglicht Drill-Down von Supplier → Category → Offering → Attributes/Links. URL-getrieben für Bookmarking und Sharing.

**Domain**: B2B-Beschaffung, Wholesale-Management, Produktkataloge

## 🏗️ System Architecture

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

### ✅ Level 1-2 (Production Ready)
- **HierarchySidebar.svelte** - Navigation mit counts & disabled states
- **SupplierGrid/Form.svelte** - CRUD operations, validation, responsive design
- **CategoryGrid.svelte** - Category assignments per supplier  
- **CategoryAssignment.svelte** - n:m relationship management mit Mock-API
- **API Types** - Complete type safety für Supplier & Category domains
- **QueryBuilder** - Client-flexible, server-secure SQL generation
- **Suppliers API** - `/api/suppliers/[id]` GET/POST/PUT/DELETE vollständig

### 🔄 Level 3 (In Progress)  
- **OfferingGrid.svelte** - ✅ Stub mit Mock-Daten
- **OfferingForm.svelte** - ❌ TODO
- **Offerings API** - ❌ TODO (`/api/offerings/[id]`)

### ⏳ Level 4-5 (Planned)
- **AttributeGrid/Form.svelte** - ❌ Stubs vorhanden, Forms TODO  
- **LinkGrid/Form.svelte** - ❌ Stubs vorhanden, Forms TODO
- **Toggle zwischen Attributes/Links** - ❌ UI-Logic TODO
- **APIs für Attributes/Links** - ❌ Komplett TODO

## 🧪 Development Strategy: Mock-First

### Current State
- **Mock-Daten in** `/src/routes/supplierbrowser/mockData.ts` 
- **Mock-State ist reaktiv** mit `$state()` für UI-Development
- **CategoryAssignment** verwendet Mock-API mit setTimeout() für Async-Verhalten

### Production Transition Pattern
```typescript
// Mock (Development)
let mockData = $state({ suppliers: [...] });

// Production (später)
let suppliers = $state<Supplier[]>([]);
onMount(async () => {
  const response = await fetch('/api/suppliers');
  suppliers = await response.json();
});
```

### Mock-Daten Struktur
- **3 Suppliers** mit unterschiedlichen Regionen/Status
- **6 Categories** global verfügbar  
- **Assigned Categories** pro Supplier mit `offering_count`
- **Mock Offerings** für Supplier+Category Kombinationen

## 🎯 Core Technologies

### Framework & Language  
- **SvelteKit** mit Svelte 5 + Runes
- **TypeScript** mit strict compiler options
- **MSSQL** Database mit connection pooling

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
  // ❌ KEIN 'from' field!
};

// Server fügt Security hinzu in /api/suppliers/[id]/+server.ts:
const securePayload: QueryPayload = {
  ...clientPayload,
  from: 'dbo.wholesalers', // ✅ Route = Table binding
  where: { /* supplier ID filter + client conditions */ }
};
```

### 3. Component Wrapper Pattern
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

### 4. End-to-End Type Safety
```typescript
// Shared types in /lib/api/types/supplier.ts
export interface UpdateSupplierRequest {
  name?: string;
  status?: 'active' | 'inactive';
}

// Client (type-safe)
const data: UpdateSupplierRequest = { name: "New Name" };
const response: UpdateSupplierResponse = await fetch('/api/suppliers/123', {
  method: 'PUT',
  body: JSON.stringify(data satisfies UpdateSupplierRequest)
}).then(r => r.json());

// Server (same types)
const request: UpdateSupplierRequest = await event.request.json();
return json({ success: true } satisfies UpdateSupplierResponse);
```
- **QueryBuilder Pattern**: Client definiert Query, Server setzt Security (siehe `src/lib/server/queryBuilder.ts`)
- **Domain Validation**: Type-safe validation per entity (siehe `src/lib/server/validation/domainValidator.ts`)
- **Error Mapping**: MSSQL Constraints → HTTP Status (siehe `src/lib/server/errors/mssqlErrorMapper.ts`)
- **End-to-End Types**: Shared API types zwischen Client/Server (siehe `src/lib/api/types/`)

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
Navigate to `/supplierbrowser` für die Test-Umgebung mit Mock-Daten.

### Database Setup
MSSQL connection config in `src/lib/server/db.ts`.

### API Testing
- Supplier APIs verfügbar unter `/api/suppliers/[id]`
- Category Assignment API unter `/api/supplier-categories` (Server TODO)

## 📁 Key File Locations

### Components
- `/src/lib/components/domain/suppliers/` - Supplier-specific UI
- `/src/lib/components/domain/categories/` - Category management UI  
- `/src/lib/components/client/` - Reusable UI components (Datagrid, etc.)
- `/src/lib/components/browser/` - Navigation components

### API & Types
- `/src/lib/api/types/` - End-to-End API type definitions
- `/src/routes/api/suppliers/` - Supplier REST endpoints
- `/src/lib/server/` - Server utilities (QueryBuilder, validation, errors)

### Domain Logic  
- `/src/lib/domain/types.ts` - Domain entity definitions
- `/src/lib/server/supplierQueryConfig.ts` - Security whitelists für QueryBuilder

### Test Environment
- `/src/routes/supplierbrowser/` - Test page mit Mock-Daten
- `/src/routes/supplierbrowser/mockData.ts` - Development data

## 🎛️ Configuration

### ESLint Standards
Strikte TypeScript compliance ohne "unexpected any" - siehe `eslint.config.js`.

### CSS Design System  
- `src/lib/components/styles/` - Modulare CSS (grid.css, form.css, sidebar.css)
- Konsistente Farbvariablen: `--color-primary: #4f46e5`

## 🚨 Current Issues & Troubleshooting

### Known Issues
1. **Category Assignment API Missing** - `/api/supplier-categories` Server implementation TODO
2. **File Naming** - `server.ts` should be `+server.ts` (SvelteKit convention)
3. **Mock Data $state** - Works in development, production needs API integration
4. **FormShell + $state Problem** - `structuredClone()` can't clone $state proxies

### Critical Fixes Needed
```typescript
// ❌ Problem: FormShell crashes with $state proxies
<SupplierForm initial={selectedSupplier} /> // selectedSupplier ist $state proxy

// ✅ Fix: Entproxy beim Prop passing  
<SupplierForm initial={selectedSupplier ? {...selectedSupplier} : undefined} />
```

### Common Development Issues

**"getId threw" Error in Datagrid:**
- Check dass alle Rows eine gültige ID haben
- SupplierGrid erwartet `wholesaler_id`, nicht `id`

**"Column not in allowed list" bei QueryBuilder:**
- Check `supplierQueryConfig.allowedTables` in `/lib/server/supplierQueryConfig.ts`
- Neue Columns müssen in whitelist eingetragen werden

**TypeScript "unexpected any" Errors:**
- Projekt hat strikte ESLint rules
- Alle Types müssen explizit sein, kein `any` erlaubt
- Use type assertions: `as Supplier` statt `any`

**Svelte 5 Reactivity Issues:**
```typescript
// ❌ Svelte 4 syntax - funktioniert nicht
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

### Why QueryBuilder Pattern?
Eliminates hard-coded SQL while maintaining security. Client requests flexible queries, server enforces table binding and access controls.

### Why URL-driven State?  
Makes application state bookmarkable, shareable, and robust. No complex state management needed.

### Why End-to-End Types?
Eliminates runtime type errors between client and server. API changes break at compile time, not runtime.

### Why Mock Data $state?
Enables reactive UI development without backend dependencies. Production will use API calls with same component interfaces.

## 📋 Development Guidelines & Code Conventions

### Svelte 5 + Runes Patterns
```typescript
// ❌ Svelte 4 - Alt
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

### Delete Workflow Pattern
**Alle Delete-Operationen folgen diesem 3-Stufen-Pattern:**
1. **Normal Delete** - Erste Anfrage ohne cascade
2. **Dependency Check** - Bei Abhängigkeiten → 409 Conflict mit Details  
3. **Cascade Delete** - User bestätigt → Delete mit `?cascade=true`

### Form Integration Pattern
```typescript
// Alle Forms wrappen FormShell:
<FormShell
  entity="Wholesaler"
  {initial}
  validate={validateWholesaler} 
  submit={submitWholesaler}
>
  {#snippet fields({ get, set, errors })}
    <input value={get('name')} oninput={e => set('name', e.target.value)} />
    {#if errors.name}<div class="error">{errors.name[0]}</div>{/if}
  {/snippet}
</FormShell>
```

## 👤 User Workflows (Examples)

### Workflow 1: Neuen Supplier mit Categories erstellen
1. `/supplierbrowser` → Suppliers Grid → "Add Supplier" 
2. Navigiert zu Level 2 → SupplierForm (create mode) + leeres CategoryGrid
3. User füllt Name, Region, Dropship aus → "Save Supplier"
4. Form wird zu edit mode → CategoryAssignment wird verfügbar
5. User klickt "Assign Category" → Dropdown mit verfügbaren Categories
6. User wählt Category → Bleibt auf Level 2, CategoryGrid updated reaktiv
7. **Status**: ✅ Funktioniert mit Mock-Daten

### Workflow 2: Supplier bearbeiten und Category hinzufügen  
1. Suppliers Grid → User klickt Supplier row
2. Navigiert zu Level 2 mit SupplierForm (edit mode)
3. User ändert Region → Speichert
4. User assigned neue Category via CategoryAssignment
5. **Status**: ✅ Funktioniert mit Mock-Daten

### Workflow 3: Category → Offerings → Attributes (TODO)
1. Level 2 CategoryGrid → User klickt Category row
2. Navigiert zu Level 3 → OfferingGrid für diese Category  
3. User klickt Offering → Navigiert zu Level 4 mit OfferingForm
4. Sidebar Toggle "Attributes" → AttributeGrid sichtbar
5. User klickt Attribute → Level 5 AttributeForm
6. **Status**: ❌ Level 3-5 nur Stubs, Forms fehlen

## 📈 Current Development Priorities

### 🚨 P0 - Critical (Blockiert weitere Entwicklung)
1. **Category Assignment API Server** - `/api/supplier-categories` POST/DELETE
2. **File Naming Fix** - Rename `server.ts` zu `+server.ts` 

### 🔥 P1 - High (Level 3 completion)
1. **OfferingForm.svelte** - Wrapper um FormShell für WholesalerItemOffering
2. **Offering API Types** - `/lib/api/types/offering.ts` nach supplier.ts Pattern  
3. **Offering CRUD API** - `/api/offerings/[id]` GET/POST/PUT/DELETE
4. **Mock Data Extension** - Mehr WholesalerItemOffering test data

### 🎯 P2 - Medium (Level 4-5 planning)
1. **AttributeForm/LinkForm** - Detail forms für Level 5
2. **Level 4 Mode Toggle** - UI für Attributes ↔ Links switching
3. **Attribute/Link APIs** - `/api/attributes/[id]` und `/api/links/[id]`
4. **Navigation Level 4-5** - offeringId parameter handling

### 🌟 P3 - Nice to Have  
1. **Loading States** - Skeleton UI für alle Grids
2. **Error Boundaries** - Graceful error handling in UI
3. **Performance** - Virtual scrolling für große Datasets
4. **Bulk Operations** - Multiple selection mit bulk delete

## 🔄 Immediate Next Steps für neue AI

1. **Fix Category Assignment API** - Server implementation in `/src/routes/api/supplier-categories/+server.ts`
2. **Test existing Suppliers API** - Verify GET/POST/PUT/DELETE mit Postman
3. **Plan OfferingForm** - Copy SupplierForm.svelte pattern für WholesalerItemOffering  
4. **Extend Mock Data** - Add more test data für Level 3 testing

---

**Current Progress: ~90% Level 1-2, 10% Level 3-5**  
**Target: Production-ready 5-level hierarchical data management system**