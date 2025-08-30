Ja, absolut. Ich verstehe.

Das ist ein exzellenter nächster Schritt. Wir haben viele wichtige architektonische Entscheidungen und Korrekturen besprochen. Diese müssen jetzt in der "Single Source of Truth", der `README-Supplier-Browser.md`, festgehalten werden, damit das gesamte Team auf dem gleichen Stand ist und die neuen Muster korrekt anwendet.

Ich werde wie folgt vorgehen:

1.  **Keine relevanten Informationen löschen:** Ich werde die bestehenden Abschnitte über die Vision, die API-Muster und die generischen Typen beibehalten, da sie weiterhin die Grundlage der Architektur bilden.
2.  **Veraltete Informationen aktualisieren:**
    *   Ich werde den Abschnitt zum **Deletion Pattern (5.2.d)** aktualisieren und die Implementierungsrichtlinie präzisieren. Statt des alten `loadData().then()`-Beispiels werde ich explizit auf die korrekte SvelteKit-Methode mit `invalidateAll()` (ohne `await`) hinweisen, um die von uns behobene Race Condition zu dokumentieren.
3.  **Neue Erkenntnisse hinzufügen:**
    *   Ich werde einen **neuen Hauptabschnitt** für die **Frontend Styling Architecture** erstellen. Dieser wird unsere Entscheidung für explizit importierte, musterbasierte CSS-Dateien (`detail-page-layout.css`, `grid-section.css` etc.) als "Styleguide"-Ansatz festhalten.
    *   Ich werde den Abschnitt zur **LoadingState Architecture (10)** erweitern. Ich werde klarstellen, dass die bestehende `LoadingState`-Klasse perfekt für *komponentenspezifisches* Feedback ist (z.B. ein Spinner in einem Button), und einen neuen Unterabschnitt für das von uns besprochene, übergeordnete **"Page-Level Loading State"**-Muster hinzufügen, das `derived` Stores verwendet, um einen seitenweiten Indikator zu steuern.
    *   Ich werde den Abschnitt **Implementation Pitfalls & Best Practices (11)** um einen neuen, kritischen Punkt erweitern: die korrekte, SSR-sichere Verwendung des `ApiClient` in `load`-Funktionen durch die Übergabe von `event.fetch`.
4.  **TODO-Liste aktualisieren:**
    *   Ich werde die bestehende Liste um unsere neuen Aufgaben erweitern:
        *   Die Implementierung des seitenweiten "Loading Indicator"-Musters auf allen relevanten Seiten.
        *   Die Finalisierung des CSS-Refactorings für alle Seiten.
        *   Eine Überprüfung aller API-Client-Dateien, um sicherzustellen, dass die `if (browser)`-Bedingung für die `LoadingState`-Aufrufe konsistent angewendet wird.
        *   Eine Überprüfung aller `load`-Funktionen, um sicherzustellen, dass der SSR-`fetch`-Fix überall korrekt implementiert ist.

Ich glaube, dieser Plan erfasst alle wichtigen Punkte unserer Konversation und bringt das `README` auf den neuesten Stand, ohne wertvolle bestehende Informationen zu verlieren.

---

Hier ist die vollständige, aktualisierte `README-Supplier-Browser.md`-Datei.

```markdown
# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

*Updated: 30. August 2025 - Architectural clarifications, styling patterns, and implementation status update*

---

## 1. The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### 1.1. The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Master Data**, **Hierarchical Real Objects**, and **Relationships** is critical.

#### Level 1: Suppliers (Master Data)
- **Entity**: `dbo.wholesalers`
- **Purpose**: Independent master data entities that can be queried flexibly
- **API Pattern**: QueryPayload for lists + Standard CRUD for individuals
- **Creation**: `/api/suppliers/new` POST with direct entity data

#### Level 2: Categories (Relationship - Simple Assignment)  
- **Entity**: `dbo.wholesaler_categories`
- **Purpose**: Pure n:m relationship between suppliers and global categories
- **Properties**: `comment`, `link` (simple metadata)
- **API Pattern**: `/api/supplier-categories` CREATE/DELETE with AssignmentRequest
- **Master Data**: Category definitions via `/api/categories/new`

#### Level 3: Offerings (Relationship - 1:n Hierarchical)
- **Entity**: `dbo.wholesaler_item_offerings`
- **Purpose**: Products that exist only in [supplier + category] context
- **Key Characteristic**: Cannot be created independently - always require parent context
- **API Pattern**: `/api/category-offerings` CREATE/UPDATE/DELETE with CreateChildRequest
- **NO** `/api/offerings/new` - violates hierarchical principle

#### Level 4: Attributes (Relationship - Attributed)
- **Entity**: `dbo.wholesaler_offering_attributes`  
- **Purpose**: n:m relationship between offerings and attributes WITH business data (`value`)
- **Key Distinction**: Not just a link - stores attribute values (e.g., Color="Red")
- **API Pattern**: `/api/offering-attributes` CREATE/UPDATE/DELETE with AssignmentRequest
- **Master Data**: Attribute definitions via `/api/attributes/new`

#### Level 5: Links (Relationship - 1:n Composition)
- **Entity**: `dbo.wholesaler_offering_links`
- **Purpose**: Links that belong to specific offerings
- **API Pattern**: `/api/offering-links` CREATE/UPDATE/DELETE with CreateChildRequest

### 1.2. The User Experience: A SvelteKit-Powered Application

The application leverages SvelteKit's file-based routing to provide a robust and bookmarkable user experience. The state of the application is primarily driven by the URL's path, creating a seamless, app-like feel with client-side navigation. This approach replaces the previous query-parameter-based state management. See Section 5.3 for a detailed breakdown of the frontend architecture.

---

## 2. Generic Type System - FINALIZED ARCHITECTURE

### 2.1. Core Generic Types with Request Pattern Distinction

**The architecture distinguishes between two fundamental relationship patterns:**

```typescript
// Automatic ID field extraction
type IdField<T> = Extract<keyof T, `${string}_id`>;

// 1:n Hierarchical Creation (one parent ID, child exists in parent context)
export type CreateChildRequest<TParent, TChild> = {
  id: TParent[IdField<TParent>];
  data: TChild;
};

// n:m Assignment between existing entities (two entity IDs)
export type AssignmentRequest<TParent, TChild, TMetadata = object> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
} & TMetadata;

// Update assignment between two master entities
export type AssignmentUpdateRequest<TParent, TChild, TMetadata = object> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
} & TMetadata;

// Removal of assignment relationship
export type RemoveAssignmentRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
  cascade?: boolean;
};

// Deletion of entity by its ID
export type DeleteRequest<T> = {
  id: T[IdField<T>];
  cascade?: boolean;
};
```

### 2.1. a) Option: Adjust AssignmentReqeust to same semantics as ChreateChildRequest:
```
export type AssignmentRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
  data?: object // "Attributes" oder additonalData for the relationship.
};```


### 2.2. Request Pattern Decision Matrix

| Relationship Type | Pattern | Use Case | Example |
|------------------|---------|----------|---------|
| **Master Data Creation** | Direct Entity Data | Independent entities | `POST /api/suppliers/new` with `Omit<Wholesaler, 'wholesaler_id'>` |
| **1:n Hierarchical Creation** | `CreateChildRequest<Parent, Child>` | Child exists only in parent context | `POST /api/category-offerings` with parent categoryId |
| **n:m Assignment** | `AssignmentRequest<Parent, Child>` | Link two existing entities | `POST /api/supplier-categories` with supplierID + categoryId |

### 2.3. Redundancy Handling in CreateChildRequest (Option B)

For hierarchical relationships, we accept controlled redundancy between parent context and child FK:

```typescript
// Client sends:
CreateChildRequest<ProductCategory, Partial<Omit<WholesalerItemOffering, 'offering_id'>>> = {
  id: 5,           // category_id as parent context  
  data: {
    category_id: 5,  // May be redundant - server validates consistency
    wholesaler_id: 1,
    product_def_id: 10
  }
}

// Server logic:
if (requestData.id !== requestData.data.category_id) {
  throw new Error("Category ID mismatch");
}
// OR auto-set if missing:
if (!requestData.data.category_id) {
  requestData.data.category_id = requestData.id;
}
```

**Benefits of Option B:**
- Stays close to DB reality and constraints
- Allows flexible client behavior (explicit or implicit parent FK)
- Server validates consistency without complex entity assembly

---

## 3. API Architecture Patterns

### 3.1. The Generic Query Endpoint: /api/query

The `/api/query` endpoint is a central architectural component that handles all complex JOIN operations and hierarchical data access.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures
- **Named Queries**: Predefined query configurations like `supplier_categories`, `category_offerings`, `offering_attributes`
- **Hierarchical Access**: The ONLY way to query offerings (which exist in [supplier + category] context)
- **Security**: All JOINs are predefined in `queryConfig.ts` to prevent arbitrary JOIN injections

#### Available Named Queries
- `supplier_categories`: Suppliers with their assigned categories and offering counts
- `category_offerings`: Offerings within [supplier + category] context with product details  
- `offering_attributes`: Offering-attribute assignments with attribute details
- `offering_links`: Offering links with context information

### 3.2. Master Data Pattern: QueryPayload + Individual CRUD

Master data entities follow a consistent pattern:

```typescript
// List with flexible querying
POST /api/suppliers with QueryRequest<Wholesaler>

// Individual operations
GET /api/suppliers/[id]           // Read single
POST /api/suppliers/new           // Create new with Omit<Entity, 'id_field'>
PUT /api/suppliers/[id]           // Update with Partial<Entity>  
DELETE /api/suppliers/[id]        // Delete with dependency checking
```

### 3.3. Relationship Endpoint Pattern: `/api/<parent>-<child>`

All relationship endpoints follow a consistent naming pattern that makes the parent-child relationship explicit.

#### 1:n Hierarchical Relationships (CreateChildRequest)
- `/api/category-offerings`: Category has Offerings 
- `/api/offering-links`: Offering has Links

```typescript
// CreateChildRequest pattern
POST /api/category-offerings
{
  id: 5,                    // parent category_id
  data: {                   // child offering data (may include category_id for validation)
    wholesaler_id: 1,
    product_def_id: 10,
    price: 100
  }
}
```

#### n:m Assignment Relationships (AssignmentRequest)
- `/api/supplier-categories`: Supplier assigned to Categories
- `/api/offering-attributes`: Offering assigned to Attributes

```typescript
// AssignmentRequest pattern  
POST /api/supplier-categories
{
  parentId: 1,              // supplier_id
  childId: 5,               // category_id
  comment: "High priority", // metadata
  link: "https://..."
}
```

---

## 4. Current Implementation Status

| Entity/Operation | Endpoint | Generic Type | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** | | | | | |
| Query List | `POST /api/suppliers` | `QueryRequest<Wholesaler>` | ✅ | ✅ | |
| Read Single | `GET /api/suppliers/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/suppliers/new` | `Omit<Wholesaler, 'wholesaler_id'>` | ✅ | ✅ | **Fixed** |
| Update | `PUT /api/suppliers/[id]` | `Partial<Wholesaler>` | ✅ | ✅ | |
| Delete | `DELETE /api/suppliers/[id]` | - | ✅ | ✅ | |
| **ATTRIBUTES (Master Data)** | | | | | |
| Query List | `POST /api/attributes` | `QueryRequest<Attribute>` | ✅ | ✅ | |
| Read Single | `GET /api/attributes/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/attributes/new` | `Omit<Attribute, 'attribute_id'>` | ✅ | ✅ | **Fixed** |
| Update | `PUT /api/attributes/[id]` | `Partial<Attribute>` | ✅ | ✅ | |
| Delete | `DELETE /api/attributes/[id]` | - | ✅ | ✅ | |
| **CATEGORIES (Master Data)** | | | | | |
| Query List | `POST /api/categories` | `QueryRequest<ProductCategory>` | ✅ | ✅ | For assignment dropdowns |
| Read Single | `GET /api/categories/[id]` | - | ✅ | ✅ | **Added** |
| Create | `POST /api/categories/new` | `Omit<ProductCategory, 'category_id'>` | ✅ | ✅ | **Added** |
| Update | `PUT /api/categories/[id]` | `Partial<ProductCategory>` | ✅ | ✅ | **Added** |
| Delete | `DELETE /api/categories/[id]` | - | ✅ | ✅ | **Added** |
| **SUPPLIER-CATEGORIES (Assignment - n:m)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'supplier_categories'` | ✅ | ✅ | |
| Create Assignment | `POST /api/supplier-categories` | `AssignmentRequest<Wholesaler, ProductCategory>` | ✅ | ✅ | **Finalized** |
| Remove Assignment | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest<Wholesaler, ProductCategory>` | ✅ | ✅ | **Finalized** |
| **CATEGORY-OFFERINGS (Hierarchical - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'category_offerings'` | ✅ | ✅ | |
| Create | `POST /api/category-offerings` | `CreateChildRequest<ProductCategory, OfferingData>` | ✅ | ✅ | **Finalized** |
| Update | `PUT /api/category-offerings` | `{offering_id, ...updates}` | ✅ | ✅ | **Fixed** |
| Delete | `DELETE /api/category-offerings` | `DeleteRequest<WholesalerItemOffering>` | ✅ | ✅ | **Fixed** |
| **~~OFFERINGS/NEW (Deprecated)~~** | ~~`POST /api/offerings/new`~~ | ~~Violates hierarchical principle~~ | ❌ | ❌ | **Removed - Use category-offerings** |
| **OFFERING-ATTRIBUTES (Assignment - n:m Attributed)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_attributes'` | ✅ | ✅ | |
| Create Assignment | `POST /api/offering-attributes` | `AssignmentRequest<WholesalerItemOffering, Attribute>` | ✅ | ✅ | **Finalized** |
| Update Assignment | `PUT /api/offering-attributes` | `AssignmentUpdateRequest<WholesalerItemOffering, Attribute>` | ✅ | ✅ | **Finalized** |
| Delete Assignment | `DELETE /api/offering-attributes` | `RemoveAssignmentRequest<WholesalerItemOffering, Attribute>` | ✅ | ✅ | **Finalized** |
| **OFFERING-LINKS (Composition - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_links'` | ✅ | ✅ | |
| Read Single | `GET /api/offering-links/[id]` | - | ✅ | ✅ | For forms only |
| Create | `POST /api/offering-links` | `CreateChildRequest<WholesalerItemOffering, LinkData>` | ✅ | ✅ | **Finalized** |
| Update | `PUT /api/offering-links` | Update pattern | ✅ | ✅ | **Finalized** |
| Delete | `DELETE /api/offering-links` | `DeleteRequest<WholesalerOfferingLink>` | ✅ | ✅ | **Finalized** |

---

## 5. Technical Architecture Pillars

### 5.1. Type Safety Architecture

#### Pillar I: Generic API Types (`lib/api/types/common.ts`)
- Universal response envelopes
- Generic request patterns with compile-time validation
- Distinct patterns for Master Data, Hierarchical Children, and Assignments
- Type guards for union responses

#### Pillar II: Query Grammar (`lib/clientAndBack/queryGrammar.ts`)  
- `QueryPayload<T>` for type-safe queries
- Strictly typed to `keyof T` for compile-time safety

#### Pillar III: Query Config (`lib/clientAndBack/queryConfig.ts`)
- Security whitelist for all table access
- Predefined JOIN configurations
- ALL queries must use query config

#### Pillar IV: Query Builder (`lib/server/queryBuilder.ts`)
- Only for SELECT statements
- Converts QueryPayload to parameterized SQL
- Individual CRUD uses direct SQL with mssqlErrorMapper

### 5.2. Request Pattern Architecture

#### a) Master Data Pattern
```typescript
// Create
POST /api/{entity}/new
Body: Omit<Entity, 'id_field'>

// Update  
PUT /api/{entity}/[id]
Body: Partial<Entity>```

#### b) Hierarchical Child Pattern  ```typescript
// Create child in parent context
POST /api/{parent}-{child}
Body: CreateChildRequest<Parent, Omit<Child, 'id_field'>>

// Update child (individual)
PUT /api/{parent}-{child}
Body: { child_id, ...updates }```

#### c) Assignment Pattern
```typescript
// Create assignment
POST /api/{parent}-{child}  
Body: AssignmentRequest<Parent, Child, Metadata>

// Remove assignment
DELETE /api/{parent}-{child}
Body: RemoveAssignmentRequest<Parent, Child>
```

#### d) Deletion Pattern: Optimistic Delete with Two-Step Confirmation
Due to the backend API design, information about cascading dependencies is only revealed after a `DELETE` attempt results in a `409 Conflict`. A separate, pre-emptive "dry run" API call is inefficient and not provided. Therefore, the client implements an **"Optimistic Delete"** pattern, which provides both performance benefits and enhanced user safety.

**This is the official, intended workflow for all deletion operations:**

1.  **Step 1: Initial, Generic Confirmation (Intent)**
    -   **Trigger**: The user clicks a "Delete" button.
    -   **Action**: The generic `DataGrid` component displays a first, simple confirmation dialog (`"Are you sure you want to delete this item?"`). This can be customized via the `deleteStrategy.confirm` property.
    -   **Purpose**: To confirm the user's basic *intent* to delete, preventing accidental clicks.

2.  **Step 2: The Optimistic API Call**
    -   **Action**: If the user confirms, the `deleteStrategy.execute` function attempts a non-cascade `DELETE` request.
    -   **Happy Path (`200 OK`)**: If the entity has no dependencies, it's deleted immediately. The process ends here. This is the most common and fastest case.
    -   **Conflict Path (`409 Conflict`)**: The API responds with dependency details, which the `ApiClient`'s `apiFetchUnion` method returns as a structured object (not an error).

3.  **Step 3: Specific, Consequence-Aware Confirmation (Warning)**
    -   **Trigger**: The `execute` function receives the `409 Conflict` response object.
    -   **Action**: It now displays a **second, specific confirmation dialog** that details the consequences (e.g., `"This supplier has dependencies: 5 offerings, 2 categories. Delete anyway?"`).
    -   **Purpose**: To warn the user about the side effects and get explicit permission for a cascading delete.

**Important Distinction: Deleting Master Data vs. Assignments**

The optimistic delete pattern applies universally, but the server's cascade logic differs based on the entity type:

-   **Master Data (e.g., `Suppliers`, `Categories`):** Deletion is **always blocked** by "hard" dependencies (like `Offerings` or `Product Definitions`). Cascading is only possible for "soft" dependencies (like the assignments in `wholesaler_categories`). The `cascade_available` flag in the API response will be `false` if hard dependencies exist, forcing the user to resolve them manually.
-   **Assignments (e.g., `Supplier-Categories`):** These relationships are simpler. Deletion can often be cascaded (e.g., removing a category assignment can also remove its associated offerings), and `cascade_available` will be `true` accordingly.

**Implementation Guideline & Race Condition Prevention:**
The `deleteStrategy.execute` function handles this entire workflow. To prevent UI race conditions where a row might get stuck in a "deleting" state, data reloading must be decoupled.

```typescript
// Correct implementation inside deleteStrategy.execute
if (dataChanged) {
  // Fire-and-forget: Start the reload but do not 'await' it.
  // This allows the execute function to return immediately, letting the
  // DataGrid clean up its internal state *before* the new data arrives
  // and triggers a re-render.
  // The modern SvelteKit way to do this:
  invalidateAll(); 
}
```

### 5.3. Frontend Architecture: Page Delegation Pattern

To support multiple, complex navigation hierarchies while avoiding code duplication, the frontend follows a powerful **Page Delegation Pattern**. This SvelteKit-idiomatic approach separates the concerns of routing, data loading, and UI rendering.

#### The Core Principle
A SvelteKit **Route** is a simple "delegator" that connects a URL to a reusable **Page Module**. This Page Module contains both the UI and the data-loading logic for that specific view.

#### Concrete Application: Pages & Hierarchies
The application is composed of several reusable "Page" components that can be arranged in different navigation hierarchies.

**Reusable Pages:**
- `[supplier-list]`: list + create supplier
- `[cat-list]`: list + create cat
- `[supplier-detail]`: form + cat-grid
- `[cat-detail readonly-cat]`: readonly cat-info + offers-grid
- `[cat-detail editable-cat]`: cat-form + offers-grid
- `[offer-detail/attributes]`: form + attribute-grid + create attribute (inline)
- `[offer-detail/links]`: form + link-grid + create link (inline)

**Example Navigation Hierarchies:**
- **Supplier-centric Path:**
  - 1) `[supplier-list]`
    - 2) `[supplier-detail]`
      - 3) `[cat-detail readonly-cat]`
        - 4a) `[offer-detail/attributes]`
        - 4b) `[offer-detail/links]`
- **Category-centric Path:**
  - 1) `[cat-list]`
    - 2) `[cat-detail editable-cat]`
      - 3a) `[offer-detail/attributes]`
      - 3b) `[offer-detail/links]`
        - 4) `[supplier-detail]` 

#### Example Implementation: File Structure & Reuse Pattern
This pattern is realized by separating Page Modules from the Routes that use them.

- `src/`
  - `lib/`
    - `pages/`
      - `categories/`
        - `CategoryDetailPage.svelte`: UI (form + grid)
        - `categoryDetailPage.ts`: `load()` and other logic
  - `routes/`
    - `categories/`
      - `[categoryId]/`
        - `+page.ts`: [DELEGATOR] `import { load } from '$lib/pages/categories/categoryDetailPage'`
        - `+page.svelte`: [RENDERER] `import CategoryDetailPage from '$lib/pages/categories/CategoryDetailPage.svelte'`
    - `suppliers/`
      - `[supplierId]/`
        - `categories/`
          - `[categoryId]/`
            - `+page.ts`: [DELEGATOR] `import { load } from '$lib/pages/categories/categoryDetailPage'`
            - `+page.svelte`: [RENDERER] `import CategoryDetailPage from '$lib/pages/categories/CategoryDetailPage.svelte'`

**Benefits:**
- **DRY (Don't Repeat Yourself):** UI and data logic for a view like "Category Detail" exist only once.
- **n:m Routing:** Multiple, different URLs can all delegate to the same Page Module, rendering the same UI with different contexts.
- **Separation of Concerns:** Routes handle *what* to show, Pages handle *how* to show it.
- **Maintainability:** The architecture is predictable, scalable, and easy to navigate.

### 5.4. Frontend Styling Architecture: Pattern-Based CSS

To ensure a consistent and maintainable user interface, the application avoids global, unscoped CSS. Instead, it follows a **pattern-based approach** where common UI patterns are defined in central CSS files and explicitly imported by the components or pages that use them. This acts as a local "Styleguide".

**Core Principles:**
- **No Global CSS Soup:** Styles are not automatically available everywhere. This prevents naming collisions and makes dependencies clear.
- **Explicit Imports:** A page that needs to render a certain pattern (e.g., a detail page header) must import the corresponding CSS file. This makes the component's dependencies self-documenting.
- **Pattern-Based Files:** CSS files are organized by the UI pattern they describe, not by the component that uses them.

**Key Pattern Files:**
- `src/lib/components/styles/detail-page-layout.css`: Defines the overall structure for detail pages, including classes like `.detail-page-layout` and `.detail-header-section`.
- `src/lib/components/styles/assignment-section.css`: Defines the visual container for simple forms that assign child entities (e.g., assigning a category or an attribute).
- `src/lib/components/styles/grid-section.css`: Defines the visual container for data grids when they appear as a subsection on a detail page.

**Example Usage (`CategoryDetailPage.svelte`):**
```svelte
<script>
  // Explicitly import the required UI patterns
  import '$lib/components/styles/detail-page-layout.css';
  import '$lib/components/styles/grid-section.css';
  // ...
</script>

<div class="detail-page-layout">
  <div class="detail-header-section">...</div>
  <div class="grid-section">...</div>
</div>
```

This approach combines the benefits of reusable styles with the safety and clarity of explicit dependencies.

---

## 6. Architectural Insight: Handling Isomorphic Code (Server vs. Browser)

One of the major challenges in SvelteKit is managing code that runs in both environments (isomorphic code, primarily in `src/lib`).

**The Problem: Hidden Node.js Dependencies in the Browser**

During the development of a robust logger, a critical issue was discovered: attempting to import server-side Node.js modules (like `pino-pretty` or `node:module`) in an isomorphic file **inevitably breaks the browser build**. This happens at build-time, long before a runtime `if (browser)` check can prevent the import.

**The Challenge: Race Conditions with Asynchronous Initialization**

Workarounds involving dynamic, asynchronous imports within the server-only block proved to be fragile. They introduced race conditions where log calls at the beginning of a request would be "swallowed" because the logger had not yet finished its asynchronous initialization. This leads to unreliable and hard-to-debug behavior.

**The Current Solution: A Minimal, Synchronous Logger**

To avoid these issues and ensure stability, the project currently uses a **minimal, synchronous logger implementation** in `src/lib/utils/logger.ts`. This file:
-   Uses an `if (browser)` check to strictly separate the environments.
-   Implements a simple wrapper around `console` in the browser.
-   Uses a basic configuration of `pino` on the server **without any asynchronous or Node.js-specific dependencies that could contaminate the client build.**

This approach guarantees reliability and avoids the complexity and fragility of asynchronous initialization in an isomorphic context. Future logger enhancements must respect this principle.

---

## 7. Examples of Generic Type Usage

### 7.1. Master Data Creation
```typescript
// Category Master Data
POST /api/categories/new
Body: Omit<ProductCategory, 'category_id'>
// → { name: "Laptops", description: "Portable computers" }
```

### 7.2. Hierarchical Child Creation (1:n)
```typescript
// Category → Offering
CreateChildRequest<ProductCategory, Partial<Omit<WholesalerItemOffering, 'offering_id'>>>
// → { id: 5, data: { wholesaler_id: 1, category_id: 5, product_def_id: 10 } }

// Offering → Link
CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, 'link_id'>>
// → { id: 12, data: { offering_id: 12, url: "https://...", notes: "..." } }```

### 7.3. Assignment Creation (n:m)
```typescript
// Supplier-Category Assignment
AssignmentRequest<Wholesaler, ProductCategory, { comment?: string; link?: string }>
// → { parentId: 1, childId: 5, comment: "High priority" }

// Offering-Attribute Assignment  
AssignmentRequest<WholesalerItemOffering, Attribute, { value?: string }>
// → { parentId: 12, childId: 3, value: "Red" }
```

---

## 8. Implementation Guidelines

### 8.1. Adding New Master Data

**For Independent Entities:**
```typescript
// Server endpoint: /api/{entity}/new
Body: Omit<Entity, 'id_field'>

// Client function:
create{Entity}(data: Omit<Entity, 'id_field'>): Promise<Entity>
```

### 8.2. Adding New Hierarchical Children

**For 1:n Relationships:**
```typescript
// Server endpoint: /api/{parent}-{child}
Body: CreateChildRequest<ParentEntity, Omit<ChildEntity, 'child_id'>>

// Client function:
create{Child}For{Parent}(
  parentId: number,
  childData: Omit<ChildEntity, 'child_id' | 'parent_fk'>
): Promise<ChildEntity>
```

### 8.3. Adding New Assignments

**For n:m Relationships:**```typescript
// Server endpoint: /api/{parent}-{child}
Body: AssignmentRequest<ParentEntity, ChildEntity, MetadataType>

// Client function:
assign{Child}To{Parent}(data: {
  parentId: number,
  childId: number,
  ...metadata
}): Promise<AssignmentData>
```

---

## 9. Developer Tooling: Automated Page Scaffolding

To enforce the Page Delegation Pattern and accelerate development, a command-line scaffolding tool is provided. It automatically generates the required file structure for a new page based on a central configuration.

### 9.1. The Configuration (`tools/scaffoldConfig.ts`)

This file is the single source of truth for the application's page structure. It defines root directories and a nested map of all available pages.

```typescript
// tools/scaffoldConfig.ts

// Defines root paths for all generated files
export const scaffoldingConfig = {
  pagesRoot: 'generated/src/lib/pages',
  routesRoot: 'generated/src/routes',
  overwriteExisting: true,
  // ... other options
};

// Defines the pages, grouped by their base directory
export const pages: Record<string, Record<string, PageDefinition>> = {
  suppliers: {
    list: { pageName: 'SupplierListPage', paramName: '' },
    detail: { pageName: 'SupplierDetailPage', paramName: 'supplierId' }
  },
  // ... other pages
};
```

### 9.2. The Templates (`tools/templates/`)

The tool uses template files for each generated file type (`page.svelte`, `page.ts`, `+page.svelte`, `+page.ts`). These templates contain Svelte 5-compliant boilerplate code and placeholders (e.g., `PageName$PlaceHolder`) that are filled in by the script.

To ensure a good developer experience when editing the templates, they are valid Svelte/TypeScript files themselves, using special comments (`SCAFFOLD-REMOVE-BEGIN/END`) to handle expected linter errors.

### 9.3. Usage

To generate all pages defined in the configuration, run the following command from the project root:

```bash
npm run generate:pages
```

The script will:
1.  Optionally clean the output directory.
2.  Iterate through every page defined in `scaffoldConfig.ts`.
3.  Generate the corresponding Page Module (`.svelte` and `.ts` files) in the `pagesRoot`.
4.  Generate the SvelteKit Route (`+page.svelte` and `+page.ts` files) in the `routesRoot`.
5.  Handle existing files based on the `overwriteExisting` flag.

---

## 10. Svelte 5 Runes Integration - LoadingState Architecture

*Insights from Frontend Integration*

### 10.1 Page-Level vs. Action-Specific Loading States

The application uses a two-level approach to provide clear loading feedback to the user.

**1. Action-Specific Loading (via `LoadingState` class):**
-   **Purpose:** To provide granular feedback for specific, client-triggered actions that do not involve a full page navigation (e.g., deleting a single item, saving a form).
-   **Mechanism:** Each API client module (e.g., `supplier.ts`) has its own `LoadingState` instance (e.g., `supplierLoadingState`). Components like `DataGrid` or `FormShell` use these states to show inline spinners or disable buttons.
-   **SSR Safety:** To prevent issues where `LoadingState` is instantiated on the server, all calls to its methods (`.start()`, `.finish()`) within the API client modules **must** be wrapped in an `if (browser)` check.

**2. Page-Level Loading (via `derived` stores):**
-   **Purpose:** To provide a single, top-level loading indicator for an entire page view, which activates if *any* of its required data is currently being fetched.
-   **Mechanism:** The page component (e.g., `SupplierDetailPage.svelte`) imports all relevant `LoadingState` stores and combines them into a single reactive boolean using a `derived` store from Svelte.
-   **Example in `SupplierDetailPage.svelte`:**
    ```typescript
    import { derived } from 'svelte/store';
    import { supplierLoadingState } from '$lib/api/client/supplier';
    import { categoryLoadingState } from '$lib/api/client/category';

    // This store is `true` if EITHER suppliers OR categories are loading.
    const isPageLoading = derived(
      [supplierLoadingState, categoryLoadingState],
      ([$sup, $cat]) => $sup || $cat
    );
    ```
-   **Usage:** The page can use `$isPageLoading` to show a top-level loading badge or overlay, while passing the more specific stores (`$supplierLoadingState`, `$categoryLoadingState`) down to the individual child components.

This two-level architecture provides both a holistic overview and granular, contextual feedback, leading to a better user experience.

---

## 11. Implementation Pitfalls & Best Practices

### 11.1. ApiClient: Handling the Response Body

**Problem:** A `Response` body from a `fetch` call is a stream and can only be read **once**. Attempting to read it multiple times (e.g., by logging the full `response` object and then calling `await response.json()`) will result in a `Body is unusable: Body has already been read` error.

**Best Practice:** Always read the body exactly once and reuse the result. The most robust method is:

1.  Always read the body as text using `const responseText = await response.text()`.
2.  If needed, log the `responseText`.
3.  Use `JSON.parse(responseText)` inside a `try...catch` block to get the JSON object.

This not only prevents the error but also provides the raw server output for better debugging in case of invalid JSON.

### 11.2. ApiClient: SSR-Safe Data Loading in `load` functions

**Problem:** When a SvelteKit `load` function runs on the server (during Server-Side Rendering), the global `fetch` API cannot be used with relative URLs (e.g., `/api/suppliers`). This will cause a `Cannot use relative URL with global fetch` error.

**Best Practice:** Always use the context-aware `fetch` function provided by SvelteKit's `LoadEvent`. Pass this specific fetch function to the `ApiClient`'s constructor.

**Correct Implementation in a `...page.ts` file:**
```typescript
// src/lib/pages/suppliers/supplierListPage.ts
import { ApiClient } from '$lib/api/client/ApiClient';
import { getSupplierApi } from '$lib/api/client/supplier';
import type { LoadEvent } from '@sveltejs/kit';

// 1. Destructure `fetch` from the LoadEvent parameter
export async function load({ fetch: svelteKitFetch }: LoadEvent) {
  
  // 2. Pass the context-aware `svelteKitFetch` to the ApiClient
  const client = new ApiClient(svelteKitFetch);
  const supplierApi = getSupplierApi(client);

  // 3. Now all API calls within this load function are SSR-safe
  const suppliers = await supplierApi.loadSuppliers();
  
  return { suppliers };
}
```
This pattern ensures that data loading works seamlessly for both server-side rendering and client-side navigation.

---

# TODOS
* ~~`Create routes/api/categories[id]`~~ **DONE**
* Finalize the sidebar navigation logic. +layout.ts uses "depends(`url:${url.href}`);" Is this correct?
* **Implement Page-Level Loading Indicators:** Apply the `derived` store pattern on all detail pages to create a consistent, top-level loading badge.
* **Finalize CSS Refactoring:** Ensure all pages correctly import and use the new pattern-based CSS files (`detail-page-layout.css`, etc.) and that all duplicate local styles have been removed.
* **Audit API Clients for SSR Safety:** Verify that all `LoadingState` method calls (`.start()`, `.finish()`) across all API client files are wrapped in an `if (browser)` check.
* **Audit `load` Functions:** Verify that all `load` functions correctly destructure `fetch` from the `LoadEvent` and pass it to the `ApiClient`.
* **Audit Deletion Logic:** Verify that all `deleteStrategy` implementations use the "fire-and-forget" `invalidateAll()` pattern to prevent UI race conditions.
* Check if error handling in pages is correct, does not swallow or incorrectly rethrow wrong errors or hide server errors.
* **Fix scaffolding tool:** Ensure the `+page.ts` template generates extension-less imports for module delegation.
```