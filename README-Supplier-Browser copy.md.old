Verstanden. Hier ist die vollständige, aktualisierte `README-Supplier-Browser.md`-Datei als Markdown-Codeblock.

Sie enthält alle besprochenen Änderungen:
*   Der Implementierungsstatus für die Kategorie-Master-Daten ist aktualisiert.
*   Das Lösch-Muster wurde um die wichtige Unterscheidung zwischen Master-Daten und Zuweisungen ergänzt.
*   Ein neuer Abschnitt (6) beschreibt die architektonischen Erkenntnisse zum Umgang mit ismorphem Code und dem aktuellen, minimalen Logger.
*   Ein neuer Abschnitt (11) dokumentiert die Best Practice für den Umgang mit dem `Response Body` im `ApiClient`.
*   Die TODO-Liste ist auf dem neuesten Stand.
*   Die Nummerierung der Abschnitte wurde entsprechend angepasst.

---

# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

*Updated: 30. August 2025 - Architectural clarifications and implementation status update*

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
    -   **Conflict Path (`409 Conflict`)**: The API responds with dependency details.

3.  **Step 3: Specific, Consequence-Aware Confirmation (Warning)**
    -   **Trigger**: The `execute` function receives the `409 Conflict` response.
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
  loadData().then(() => {
    // Handle post-reload logic like navigation here
  });
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
        - `+page.ts`: [DELEGATOR] `import { load } from '$lib/pages/categories/categoryDetailPage.ts'`
        - `+page.svelte`: [RENDERER] `import CategoryDetailPage from '$lib/pages/categories/CategoryDetailPage.svelte'`
    - `suppliers/`
      - `[supplierId]/`
        - `categories/`
          - `[categoryId]/`
            - `+page.ts`: [DELEGATOR] `import { load } from '$lib/pages/categories/categoryDetailPage.ts'`
            - `+page.svelte`: [RENDERER] `import CategoryDetailPage from '$lib/pages/categories/CategoryDetailPage.svelte'`

**Benefits:**
- **DRY (Don't Repeat Yourself):** UI and data logic for a view like "Category Detail" exist only once.
- **n:m Routing:** Multiple, different URLs can all delegate to the same Page Module, rendering the same UI with different contexts.
- **Separation of Concerns:** Routes handle *what* to show, Pages handle *how* to show it.
- **Maintainability:** The architecture is predictable, scalable, and easy to navigate.

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
// → { id: 12, data: { offering_id: 12, url: "https://...", notes: "..." } }
```

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

During the integration of the API clients with Svelte 5 Runes, key architectural insights emerged that are relevant for all future implementations:

-   **Runes Compatibility:** Svelte 5 Runes (`$state`, `$derived`) function exclusively within `.svelte` files. The original `LoadingState` class in `lib/api/client/common.ts` had to be refactored from Runes to Svelte Stores to avoid "rune_outside_svelte" errors.

-   **Store-based `LoadingState` (Finalized):** The `LoadingState` class now uses `writable()` and `derived()` stores instead of Runes. This enables reactivity between TypeScript modules and Svelte components. The correct way to access the state is via `$loadingState.isLoadingStore` instead of the non-reactive getter `loadingState.isLoading`.

-   **"Null Initial State" Pattern:** For an optimal loading UX, the "null initial state" pattern was implemented. Data arrays now start as `null` (not `[]`), allowing grid components to distinguish between a "loading" state (`null` + `loading=true`) and a "no data" state (`[]` + `loading=false`). This prevents the brief "No data" flash on the initial load.

-   **Integration Pattern:** Frontend components combine the individual loading stores (e.g., `$supplierLoadingState`, `$categoryLoadingState`) using `$derived` to create a central, reactive `isLoading` state for global UI feedback. This ensures automatic reactivity to API operations. For example: `const isLoading = $derived($supplierLoadingState || $categoryLoadingState);`

This solution eliminates race conditions between component mounting and API initialization and provides a consistent loading UX across all hierarchy levels.

---

## 11. Implementation Pitfalls & Best Practices

### 11.1. ApiClient: Handling the Response Body

**Problem:** A `Response` body from a `fetch` call is a stream and can only be read **once**. Attempting to read it multiple times (e.g., by logging the full `response` object and then calling `await response.json()`) will result in a `Body is unusable: Body has already been read` error.

**Best Practice:** Always read the body exactly once and reuse the result. The most robust method is:

1.  Always read the body as text using `const responseText = await response.text()`.
2.  If needed, log the `responseText`.
3.  Use `JSON.parse(responseText)` inside a `try...catch` block to get the JSON object.

This not only prevents the error but also provides the raw server output for better debugging in case of invalid JSON.

---

# TODOS
* ~~`Create routes/api/categories[id]`~~ **DONE**
* Check if error handling in pages is correct, does not swallow or incorrectly rethrow wrong errors or hide server errors.
* Check if API typing is consistent on server and client and if the types in `lib/api/*` are used correctly.
* Check if it pays off: factor out style "form-section" to own css and name it "detail-form-section". (The form itself is in form.css)
  * Same for .page-content-wrapper or create wrapper and section components?