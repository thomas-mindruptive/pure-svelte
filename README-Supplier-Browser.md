# Architectural Specification & Developer Guide: SupplierBrowser

This document serves as the **single source of truth** for the project's architecture. All development **must** adhere to the patterns and principles defined herein.

## 1. The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### 1.1. The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Real Objects** (master data) and **Assignments** (relationship data) is critical.

- **Level 1: Suppliers (Real Object)**
  - **Entity**: `dbo.wholesalers`
  - **Purpose**: The root of the hierarchy. Manages the master data of supplier entities.
  - **API Pattern**: Standard REST (`GET [id]`, `POST /new`, `PUT [id]`, `DELETE [id]`).

- **Level 2: Categories (Assignment)**
  - **Entity**: `dbo.wholesaler_categories`
  - **Purpose**: Manages the **n:m relationship** between a selected Supplier and a global `ProductCategory`. This level does not edit the categories themselves, but rather the *link* between a supplier and a category.
  - **API Pattern**: Dedicated n:m assignment endpoints (`POST` and `DELETE` on `/api/supplier-categories`).

- **Level 3: Offerings (Real Object)**
  - **Entity**: `dbo.wholesaler_item_offerings`
  - **Purpose**: Manages the master data of products offered by the selected Supplier *within* the selected Category.
  - **API Pattern**: Standard REST.

- **Level 4: Attributes (Assignment)**
  - **Entity**: `dbo.wholesaler_offering_attributes`
  - **Purpose**: Manages the **n:m relationship** between a selected Offering and a global `Attribute`, storing the specific `value` for that link.
  - **API Pattern**: Dedicated n:m assignment endpoints.

- **Level 5: Links (Real Object)**
  - **Entity**: `dbo.wholesaler_offering_links`
  - **Purpose**: Manages URL links that are directly associated with a selected Offering.
  - **API Pattern**: Standard REST.

### 1.2. The User Experience: A URL-Driven Single-Page Application

The entire application exists on a single route (`/supplierbrowser`) and creates a seamless, app-like experience.

- **URL-Driven State**: The UI is a direct, reactive reflection of the URL's search parameters (`level`, `supplierId`, `categoryId`, `offeringId`). We use Svelte 5 Runes (`$derived`) to listen to URL changes. This eliminates complex client-side state management.
- **Hierarchical Sidebar**: A persistent sidebar (`HierarchySidebar.svelte`) is the main navigation. Its levels are dynamically enabled or disabled based on the current selections in the URL, creating a guided, foolproof workflow for the user.
- **Dynamic Content Pane**: The main content area renders different grids and forms based on the current `level` in the URL, providing the correct context and actions for the user's position in the hierarchy.

---

## 2. The Architecture Deep Dive: From Type to Server

This section details the four pillars of our technical architecture.

### Pillar I: The Foundation - Generic API Types (`lib/api/types/common.ts`)

This file is the **heart of our type safety**. It defines the generic building blocks ("envelopes") for ALL API communication.

- **Universal Response Envelope**: Every API response is either an `ApiSuccessResponse<TData>` or an `ApiErrorResponse`.
- **Generic Request Envelopes**: `common.ts` defines the wrappers for our request bodies: `QueryRequest<T>`, `PredefinedQueryRequest`, `CreateRequest<T>`, and `UpdateRequest<TId, TData>`.
- **Generic Operation Patterns**: It defines the full response unions for complex operations, like `DeleteApiResponse<T, D>`, and the type guards to handle them (`isDeleteConflict`).

### Pillar II: The Language - The Split Query Grammar (`lib/clientAndBack/queryGrammar.ts`)

This file defines the "language" for all queries by providing **two distinct, purpose-built payload types**:

- **`QueryPayload<T>` (Strictly Generic):** It is strictly typed to `keyof T`, providing **compile-time safety** against typos and invalid fields (e.g., `QueryPayload<Wholesaler>` will not allow `select: ['color']`).

### Pillar III: The Contract - The Self-Validating Query Config (`lib/clientAndBack/queryConfig.ts`)

This file is the central "contract" that validates itself against our domain models at compile time.

- **`BaseTableConfig` Type**: Strictly maps a table name (e.g., `'dbo.wholesalers'`) to an array of keys of its domain type (`(keyof Wholesaler)[]`). **This makes it impossible to add a misspelled column like `'wholesaler_idxxxxx'` without a TypeScript error.**
- **`PredefinedQueryConfig` Type**: Strictly maps a named query (e.g., `supplier_categories`) to an array of valid, auto-generated JOIN columns. **This makes it impossible to add an invalid JOIN column like `'woa.fake_column'` without a TypeScript error.**

### Pillar IV: The API Lifecycle - Endpoints & Patterns

This table summarizes the final implementation for all CRUD operations, reflecting the "Real Object vs. Assignment" logic.

| Operation | Method & URL | Request Body Type | Implementation Status |
| :--- | :--- | :--- | :--- |
| **Query List** | `POST /api/suppliers` | `QueryRequest<T>` | ✅ Implemented |
| **Query List** | `POST /api/categories` | `QueryRequest<T>` | ✅ Implemented |
| **Query List** | `POST /api/offerings` | `QueryRequest<T>` | ✅ Implemented |
| **Query List** | `POST /api/attributes` | `QueryRequest<T>` | ❌ Pending |
| **Read Single** | `GET /api/suppliers/[id]` | *(none)* | ✅ Implemented |
| **Read Single** | `GET /api/offerings/[id]` | *(none)* | ❌ Pending |
| **Read Single** | `GET /api/attributes/[id]` | *(none)* | ❌ Pending |
| **Create** | `POST /api/suppliers/new` | `CreateRequest<T>` | ✅ Implemented |
| **Create** | `POST /api/offerings/new` | `CreateRequest<T>` | ❌ Pending |
| **Create** | `POST /api/attributes/new` | `CreateRequest<T>` | ❌ Pending |
| **Update** | `PUT /api/suppliers/[id]` | `UpdateRequest<TId, TData>`| ✅ Implemented |
| **Update** | `PUT /api/offerings/[id]` | `UpdateRequest<TId, TData>`| ❌ Pending |
| **Update** | `PUT /api/attributes/[id]` | `UpdateRequest<TId, TData>`| ❌ Pending |
| **Delete Single**| `DELETE /api/suppliers/[id]` | *(none)* | ✅ Implemented |
| **Delete Single**| `DELETE /api/offerings/[id]` | *(none)* | ❌ Pending |
| **Delete Single**| `DELETE /api/attributes/[id]` | *(none)* | ❌ Pending |
| **Add n:m** | `POST /api/supplier-categories`| `AssignmentRequest` | ✅ Implemented |
| **Remove n:m** | `DELETE /api/supplier-categories`| `RemoveAssignmentRequest`| ✅ Implemented |
| **Add n:m** | `POST /api/offering-attributes`| `AssignmentRequest` | ❌ Pending |
| **Remove n:m** | `DELETE /api/offering-attributes`| `RemoveAssignmentRequest`| ❌ Pending |
| **Complex JOINs**| `POST /api/query` | `PredefinedQueryRequest` | ✅ Implemented |

## Client API Architecture - FINAL IMPLEMENTATION

All API calls go through dedicated client modules in `lib/api/client/`, following strict architectural patterns.

### Composition-Prinzip mit Cascade-Delete

**Super WICHTIG Grundprinzip**: Die API-Client-Struktur folgt dem Composition-Pattern: Jede Hauptentität verwaltet ihre eigenen Daten und alle direkten Kompositionsbeziehungen. Sie erzeugt auch die die jeweiligen "zu N" - "Objekte": Echte Objekte oder Zuordnungen. 

* **category.ts (Kompositions-Manager)** ✅
  * Category Master-Data CRUD (allgemeine Stammdatenverwaltung aller Kategorien)
  * Category->Offering relationship: 
    * `loadOfferingsForCategory()`
    * Offering CRUD (dbo.wholesaler_item_offerings), e.g. "createOffering()", "deleteOffering()"
  * Verwaltet Category-Offering Kompositionsbeziehungen

* **offering.ts (Kompositions-Manager)** ✅
  * Offering-Attribute Assignment CRUD (dbo.wholesaler_offering_attributes)
  * Links CRUD (dbo.wholesaler_offering_links)
  * Verwaltet alle direkten Offering-Kompositionen

* **attribute.ts (Master-Data)** ✅
  * Attribute Master-Data CRUD (dbo.attributes)
  * Reine Stammdaten-Verwaltung ohne Kompositionsbeziehungen
  * Utility functions: `searchAttributes()`, `isAttributeNameAvailable()`

### Cascade-Delete-Methodik (IMPLEMENTED)

**Kompositionshierarchie:**
```
Supplier (Root)
  ├─ WholesalerCategories (Composition) 
  │   └─ Offerings (Managed by Category logic)
  │       ├─ OfferingAttributes (Composition)
  │       └─ OfferingLinks (Composition)
```

**Delete-Logik:**
* Supplier löschen: Prüft WholesalerCategories → Cascade zu Offerings → Cascade zu Attributes/Links
* Category-Assignment löschen: Prüft abhängige Offerings → Cascade zu deren Attributes/Links
* Offering löschen: Triggert Delete in offering.ts für Attributes und Links

### LoadingState Pattern (IMPLEMENTED)

Jede Client-Datei implementiert ein einheitliches LoadingState-System:

```typescript
export const supplierLoadingState = new LoadingState();

// Usage:
const operationId = `loadSupplier-${supplierId}`;
supplierLoadingState.start(operationId);
try {
    // API call
} finally {
    supplierLoadingState.finish(operationId);
}
```

**Features:**
- Spezifische Operation-IDs für granulare Loading-States
- Subscriber Pattern für UI-Updates
- Automatic cleanup nach Operation-Ende

### Error Handling Pattern (IMPLEMENTED)

Alle API-Calls verwenden einheitliche Error-Behandlung:

```typescript
import { apiFetch, apiFetchUnion, getErrorMessage } from './common';

// Standard API calls (throw on error):
const data = await apiFetch<SuccessType>('/api/endpoint', options, { context: operationId });

// Union responses (return error objects):
const result = await apiFetchUnion<UnionType>('/api/endpoint', options, { context: operationId });
if (!result.success && 'cascade_available' in result) {
    // Handle dependency conflicts
}
```

### Structured Logging Pattern (IMPLEMENTED)

Alle Operationen verwenden strukturiertes Logging mit context:

```typescript
log.info(`[${operationId}] Successfully loaded suppliers.`, { 
    count: suppliers.length,
    hasFilter: !!query.where
});

log.error(`[${operationId}] Failed to load suppliers.`, { 
    error: getErrorMessage(err),
    query 
});
```

## Code Quality Standards (IMPLEMENTED)

### TypeScript/ESLint Configuration
```javascript
// eslint.config.js - Enforced Rules
'@typescript-eslint/no-explicit-any': 'warn',
'@typescript-eslint/consistent-type-imports': 'warn', 
'@typescript-eslint/no-unused-vars': 'warn',
```

### Type-Safe API Calls (IMPLEMENTED)
```typescript
export async function loadSuppliers(query: Partial<QueryPayload<Wholesaler>> = {}): Promise<Wholesaler[]> {
    const operationId = 'loadSuppliers';
    supplierLoadingState.start(operationId);
    try {
        const fullQuery: QueryPayload<Wholesaler> = { ...DEFAULT_SUPPLIER_QUERY, ...query };

        const responseData = await apiFetch<QueryResponseData<Wholesaler>>(
            '/api/suppliers',
            { method: 'POST', body: createQueryBody(fullQuery) },
            { context: operationId }
        );
        
        return responseData.results as Wholesaler[];
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        supplierLoadingState.finish(operationId);
    }
}
```

## Server Implementation Patterns (PARTIALLY IMPLEMENTED)

### Generic Query Builder (IMPLEMENTED)
- **buildQuery()**: Sichere SQL-Generierung mit Parameter-Binding
- **executeQuery()**: MSSQL execution mit structured logging
- **supplierQueryConfig**: Compile-time validierte Whitelist

### Error Mapping (IMPLEMENTED)
- **mssqlErrorMapper**: MSSQL-spezifische Fehler zu HTTP-Status mapping
- **Constraint violation handling**: Unique, FK, Check constraints
- **User-friendly error messages**: Technische Fehler werden abstrahiert

### Domain Validation (IMPLEMENTED)
```typescript
import { validateWholesaler } from '$lib/server/validation/domainValidator';

const validation = validateWholesaler(requestData, { mode: 'create' });
if (!validation.isValid) {
    return json({ success: false, errors: validation.errors }, { status: 400 });
}
```

## Frontend Implementation (IMPLEMENTED)

### Svelte 5 Runes Architecture
- **$state**: Reactive local state management
- **$derived**: Computed properties from URL params and data
- **$effect**: Side-effects für data loading
- **URL-driven state**: Params als single source of truth

### Component Architecture
- **HierarchySidebar**: Navigation zwischen levels
- **FormShell**: Generische Form-Logik mit validation
- **DataGrid**: Reusable, type-safe grid mit delete-workflows
- **Domain-specific grids**: SupplierGrid, CategoryGrid, OfferingGrid

## Frontend Implementation (TODO)
- supplier-browser/+page.svelte anpassen: 
  - api/client/einbauen
  - Mockdaten entfernen
  - Falls notwendig: Ebenen dazufügen: Attributes und Links.

### Data Flow Pattern
```typescript
// URL State → Reactive Loading → Component Props
const selectedSupplierId = $derived(Number($page.url.searchParams.get("supplierId")) || null);

$effect(() => {
    if (selectedSupplierId) {
        loadSupplierData(selectedSupplierId);
        loadSupplierCategories(selectedSupplierId);
    }
});
```

---

## Next Steps: Completing the Architecture

Die Client-Architektur ist vollständig implementiert. Die fehlenden Komponenten sind Server-Endpunkte:

### Phase 3: Offering Composition Endpoints (MEDIUM PRIORITY)
- [ ] `routes/api/offering-attributes/[offeringId]/[attributeId]/+server.ts` - Individual assignment management
- [ ] `routes/api/offering-links/+server.ts` - Link management endpoints
- [ ] `routes/api/offering-links/[id]/+server.ts` - Individual link CRUD

## Architecture Validation Checklist

### Type Safety ✅
- [x] No `any` types in production code
- [x] Strict TypeScript configuration
- [x] Compile-time query validation
- [x] Generic API response types

### Security ✅
- [x] SQL injection prevention via parameterized queries
- [x] Column whitelist validation
- [x] Error message sanitization
- [x] No client-side table name control

### Performance ✅
- [x] LoadingState für UI feedback
- [x] Pagination support in queries
- [x] Efficient SQL generation
- [x] Structured logging für monitoring

### Maintainability ✅
- [x] Composition pattern für code organization
- [x] Reusable components (FormShell, DataGrid)
- [x] Centralized error handling
- [x] Consistent naming conventions

### User Experience ✅
- [x] URL-driven state für bookmarkable pages
- [x] Non-blocking confirmation dialogs
- [x] Real-time validation feedback
- [x] Consistent loading states

---

*This document reflects the current implementation state as of the latest update. All checkmarks indicate fully implemented and tested functionality.*