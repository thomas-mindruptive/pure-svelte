# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

*Updated: 1. September 2025 - Finalized the `QueryPayload` interface to use a structured `from` object, enhancing type safety. Clarified API client responsibilities for loading product definitions based on context (create vs. edit). Documented known issue in top-level navigation state.*

---

## The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Master Data**, **Hierarchical Real Objects**, and **Relationships** is critical.

#### Level 1: Suppliers (Master Data)
- **Entity**: `dbo.wholesalers`
- **Purpose**: Independent master data entities that can be queried flexibly.
- **API Pattern**: QueryPayload for lists + Standard CRUD for individuals.
- **Creation**: `/api/suppliers/new` POST with direct entity data.

#### Level 2: Categories (Relationship - Simple Assignment)  
- **Entity**: `dbo.wholesaler_categories`
- **Purpose**: Pure n:m relationship between suppliers and global categories.
- **Properties**: `comment`, `link` (simple metadata).
- **API Pattern**: `/api/supplier-categories` CREATE/DELETE with `AssignmentRequest`.
- **Master Data**: Category definitions via `/api/categories/new`.

#### Level 3: Offerings (Relationship - 1:n Hierarchical)
- **Entity**: `dbo.wholesaler_item_offerings`
- **Purpose**: Products that exist only in a [supplier + category] context.
- **Key Characteristic**: Cannot be created independently; always require parent context.
- **API Pattern**: `/api/category-offerings` CREATE/UPDATE/DELETE with `CreateChildRequest`.
- **NO** `/api/offerings/new` - violates hierarchical principle.
- **Master Data**: Product definitions via `/api/product-definitions/new`.

#### Level 4: Attributes (Relationship - Attributed)
- **Entity**: `dbo.wholesaler_offering_attributes`  
- **Purpose**: n:m relationship between offerings and attributes WITH business data (`value`).
- **Key Distinction**: Not just a link - stores attribute values (e.g., Color="Red").
- **API Pattern**: `/api/offering-attributes` CREATE/UPDATE/DELETE with `AssignmentRequest`.
- **Master Data**: Attribute definitions via `/api/attributes/new`.

#### Level 5: Links (Relationship - 1:n Composition)
- **Entity**: `dbo.wholesaler_offering_links`
- **Purpose**: Links that belong to specific offerings.
- **API Pattern**: `/api/offering-links` CREATE/UPDATE/DELETE with `CreateChildRequest`.

### The User Experience: A SvelteKit-Powered Application

The application leverages SvelteKit's file-based routing to provide a robust and bookmarkable user experience. The state of the application is primarily driven by the URL's path, creating a seamless, app-like feel with client-side navigation. This approach replaces the previous query-parameter-based state management. See the Frontend Architecture section for a detailed breakdown.

---

## Generic Type System - FINALIZED ARCHITECTURE

### Core Generic Types with Request Pattern Distinction

```typescript
// Automatic ID field extraction from entity types
type IdField<T> = Extract<keyof T, `${string}_id`>;

// CORRECTED: 1:n Hierarchical Creation (one parent ID, child exists in parent context)
export type CreateChildRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
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

// Deletion of an entity by its ID
export type DeleteRequest<T> = {
  id: T[IdField<T>];
  cascade?: boolean;
};
```

### Option: Adjust AssignmentRequest

This optional semantic adjustment remains for consideration in future API versions.

```typescript
export type AssignmentRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
  data?: object // "Attributes" or additionalData for the relationship.
};
```

### Request Pattern Decision Matrix

| Relationship Type | Pattern | Use Case | Example |
|---|---|---|---|
| **Master Data Creation** | Direct Entity Data | Independent entities | `POST /api/suppliers/new` with `Omit<Wholesaler, 'wholesaler_id'>` |
| **1:n Hierarchical Creation**| `CreateChildRequest<Parent, Child>` | Child exists only in parent context | `POST /api/category-offerings` |
| **n:m Assignment** | `AssignmentRequest<Parent, Child>` | Link two existing entities | `POST /api/supplier-categories` |
| **Generic Query** | **`QueryRequest<T>`** with **`from: { table, alias }`** | Flexible querying for lists or complex joins | `POST /api/query` |


### Redundancy Handling in `CreateChildRequest`

For hierarchical relationships, the API accepts controlled redundancy between the parent context and the child's foreign key in the request body.

```typescript
// Client sends a request to POST /api/category-offerings
// The parentId (5) is provided in the body for consistency.
CreateChildRequest<ProductCategory, Partial<Omit<WholesalerItemOffering, 'offering_id'>>> = {
  parentId: 5,           // Parent category_id context
  data: {
    category_id: 5,      // May be redundant - server validates consistency
    wholesaler_id: 1,
    product_def_id: 10
  }
}

// Server-side logic ensures consistency:
if (requestData.parentId !== requestData.data.category_id) {
  throw new Error("Parent ID mismatch");
}
```

---

## API Architecture Patterns

### The Generic Query Endpoint: `/api/query`

The `/api/query` endpoint is a central architectural component that handles all complex relational data access. **Update:** It now expects the `from` clause in a `QueryPayload` to be a structured object: `{ table: string, alias: string }`, which is validated on the server against a central `aliasedTablesConfig`.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures. The anti-join to find available products is a prime example of its power.
- **Named Queries**: Predefined query configurations like `supplier_categories`, `category_offerings`, etc.
- **Security**: All table and alias access is validated against a central `aliasedTablesConfig` on the server to prevent unauthorized data access.

### Master Data Pattern: QueryPayload + Individual CRUD

Master data entities follow a consistent pattern for API interactions. **Update:** List queries are now initiated by the client sending a complete `QueryPayload`, including the `from` object. The typed server endpoint (e.g., `/api/suppliers`) acts as a semantic gatekeeper that enforces the `from` clause.

```typescript
// List with flexible querying
// The client sends the full payload, e.g., from: { table: 'dbo.suppliers', alias: 'w' }
POST /api/suppliers with QueryRequest<Wholesaler>

// Individual operations
GET    /api/suppliers/[id]      // Read a single entity
POST   /api/suppliers/new       // Create a new entity
PUT    /api/suppliers/[id]      // Update an existing entity
DELETE /api/suppliers/[id]      // Delete an entity
```

### Relationship Endpoint Pattern: `/api/<parent>-<child>`

All relationship endpoints follow a consistent naming pattern that makes the parent-child relationship explicit.

#### 1:n Hierarchical Relationships (`CreateChildRequest`)
- `/api/category-offerings`: A Category has many Offerings.
- `/api/offering-links`: An Offering has many Links.

```typescript
// Example: Create an Offering for a Category
POST /api/category-offerings
{
  "parentId": 5,
  "data": {
    "wholesaler_id": 1,
    "product_def_id": 10,
    "price": 100
  }
}
```

#### n:m Assignment Relationships (`AssignmentRequest`)
- `/api/supplier-categories`: Assign a Supplier to a Category.
- `/api/offering-attributes`: Assign an Attribute to an Offering.

```typescript
// Example: Assign a Category to a Supplier
POST /api/supplier-categories
{
  "parentId": 1,
  "childId": 5,
  "comment": "High priority",
  "link": "https://..."
}
```

---

## Current Implementation Status

| Entity/Operation | Endpoint | Generic Type | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** | | | | | |
| Query List | `POST /api/suppliers` | `QueryRequest<Wholesaler>` | ✅ | ✅ | Client sends full `from` object. |
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
| **PRODUCT DEFINITIONS (Master Data)** | | | | | **Updated Section** |
| Query List | `POST /api/product-definitions` | `QueryRequest<ProductDefinition>` | ✅ | ✅ | API client implemented |
| Read Single | `GET /api/product-definitions/[id]` | - | ✅ | ✅ | API client implemented |
| Create | `POST /api/product-definitions/new` | `Omit<ProductDefinition, 'product_def_id'>` | ✅ | ✅ | API client implemented |
| Update | `PUT /api/product-definitions/[id]` | `Partial<ProductDefinition>` | ✅ | ✅ | API client implemented |
| Delete | `DELETE /api/product-definitions/[id]` | - | ✅ | ✅ | API client implemented |
| Query Available for New Offering | `POST /api/query` | `QueryPayload` with `LEFT JOIN` | ✅ | ✅ | **Functionality moved to `offering.ts` client.** |
| **SUPPLIER-CATEGORIES (Assignment - n:m)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'supplier_categories'` | ✅ | ✅ | |
| Create Assignment | `POST /api/supplier-categories` | `AssignmentRequest<Wholesaler, ProductCategory>` | ✅ | ✅ | **Finalized** |
| Remove Assignment | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest<Wholesaler, ProductCategory>` | ✅ | ✅ | **Finalized** |
| **CATEGORY-OFFERINGS (Hierarchical - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'category_offerings'` | ✅ | ✅ | **JOIN definition fixed.** |
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

## Architectural Decisions & Ongoing Work

### Architectural Enhancement: Supporting Complex Anti-Join Queries

A common requirement in the UI is to query for entities that are *available for assignment*. A prime example is populating the "Product" dropdown when creating a **new** `Offering`: it must show all `ProductDefinition`s in a category for which a specific supplier does **not** yet have an offering.

The most efficient way to achieve this is with a single SQL query using a `LEFT JOIN` where a dynamic parameter is part of the `ON` clause, combined with a `WHERE ... IS NULL` check (an "anti-join").

```sql
SELECT pd.*
FROM dbo.product_definitions pd
LEFT JOIN dbo.wholesaler_item_offerings wio
    ON pd.product_def_id = wio.product_def_id
    AND wio.wholesaler_id = @supplierId -- Dynamic parameter in ON clause
WHERE
    pd.category_id = @categoryId
    AND wio.offering_id IS NULL;
```

**The Architectural Challenge & Solution:**
Instead of creating a specialized, one-off API endpoint, we **leverage the flexibility of the generic query system**. The client-side API module (`offering.ts`) now constructs a full `QueryPayload` that perfectly describes this complex join. This payload is then sent to the generic `/api/query` endpoint, which validates it against the `aliasedTablesConfig` and builds the secure, parameterized SQL.

This enhancement makes our generic query system significantly more powerful, avoids API endpoint proliferation, and keeps complex business logic encapsulated in the client-side API module responsible for the context (`offering.ts`).

---

## Technical Architecture Pillars

### Type Safety Architecture
The project is built on four pillars of type safety that work together to ensure correctness from the database to the UI.
- **Pillar I: Generic API Types:** Universal request/response envelopes in `lib/api/types/common.ts`.
- **Pillar II: Query Grammar:** Type-safe query language in `lib/clientAndBack/queryGrammar.ts`, featuring a structured `from: { table, alias }` object.
- **Pillar III: Query Config:** A security whitelist for all table, alias, and column access, centered around a single source of truth: the `aliasedTablesConfig` object.
- **Pillar IV: Query Builder:** A server-side utility that converts the type-safe grammar into parameterized SQL.

### Request Pattern Architecture

#### Deletion Pattern: Optimistic Delete with Two-Step Confirmation
The client implements an **"Optimistic Delete"** pattern to provide a safe and informative user experience.

**Workflow:**
1.  **Step 1 (Intent):** The user clicks "Delete". A generic confirmation dialog appears.
2.  **Step 2 (API Call):** If confirmed, the client sends a **non-cascading** `DELETE` request.
    -   **Happy Path (`200 OK`):** The item is deleted. The process ends.
    -   **Conflict Path (`409 Conflict`):** The API responds with dependency details, including a crucial `cascade_available` flag.
3.  **Step 3 (Consequence-Aware Confirmation):**
    -   If the API returns `409 Conflict` and `cascade_available: true`, the UI displays a **second, specific dialog** detailing the consequences (e.g., `"This will also delete 5 offerings. Continue?"`).
    -   If the user confirms again, the client sends a second `DELETE` request, this time with the `cascade=true` parameter.

#### Important Distinction: Scope of Cascade
The two-step confirmation process is universal, but the **scope** of the cascade differs significantly.

*   **Deleting an Assignment (Narrow Cascade):**
    *   **Trigger:** Removing a single `Supplier-Category` link.
    *   **Impact:** The potential cascade is **narrowly scoped**, affecting only the `Offerings` (and their children) that exist within that *specific* supplier-category context. All other categories and offerings for that supplier remain untouched.
    *   **User Confirmation:** The dialog is targeted: `"This category assignment has 5 offerings. Delete the assignment AND these 5 offerings?"`

*   **Deleting Master Data (Wide Cascade):**
    *   **Trigger:** Deleting an entire `Supplier` record.
    *   **Impact:** The potential cascade is **wide and destructive**, affecting the entire data tree beneath that supplier: *all* of its category assignments, *all* of its offerings across all categories, and *all* attributes and links associated with those offerings.
    *   **User Confirmation:** The dialog reflects the massive scope: `"Delete supplier AND ALL related data (5 categories, 28 offerings)?"`

### Frontend Architecture: Page Delegation Pattern
To avoid code duplication, the frontend follows a powerful **Page Delegation Pattern**.
- A SvelteKit **Route** (`src/routes/...`) acts as a simple "delegator".
- It imports and renders a reusable **Page Module** (`src/lib/pages/...`).
- This allows multiple, different URLs to render the same UI with different data contexts, ensuring that UI and data-loading logic exist only once.

### Frontend Styling Architecture: Pattern-Based CSS
The application avoids global, unscoped CSS. Instead, it follows a **pattern-based approach** where common UI patterns are defined in central CSS files and explicitly imported by the components or pages that use them.
- **Key Files:** `detail-page-layout.css`, `assignment-section.css`, `form.css`.
- **Principle:** Components are self-documenting in their style dependencies, preventing CSS conflicts.

### Frontend Form Architecture: The "Dumb Shell / Smart Parent" Pattern
To create reusable yet fully type-safe forms, the project uses this robust pattern.

#### The "Dumb" State Manager: `FormShell.svelte`
- A generic component that knows nothing about specific data types like `Wholesaler`.
- It manages the core form mechanics: tracking data, "dirty" state, submission status, and orchestrating the `validate` and `submit` lifecycle via Svelte 5 callback props (`onSubmitted`, `onSubmitError`).
- **Update:** The `FormShell` is now enhanced with an `$effect` to robustly handle asynchronous changes to its `initial` prop, preventing state inconsistencies when a component is reused across navigations.

#### The "Smart" Parent: `SupplierForm.svelte`
- A specific component that knows everything about a `Wholesaler`.
- It defines a local type for its form data (e.g., `SupplierFormData`) which can include both domain fields and UI-specific fields.
- It provides the domain-specific `validate` and `submit` functions to the `FormShell`.
- It bridges the type gap between its specific world and the generic world of the `FormShell`.

#### **Business Logic Example: Offering Immutability**
A key architectural decision was made in the `OfferingForm`: The `ProductDefinition` of an existing offering cannot be changed. This is a business rule. The `OfferingForm` implements this by rendering a disabled `<select>` box or a simple `<span>` when in "edit" mode (i.e., when an `offering_id` is present), displaying the product name as plain text. This prevents invalid state changes and simplifies the backend logic.

#### The Key to Type Safety: A Controlled Bridge
This pattern works by using two explicit techniques in the "Smart Parent" to ensure end-to-end type safety:

1.  **Casting Props Down (`as any`):** The parent's strongly-typed functions are passed to the shell's weakly-typed props using an `as any` cast. This is a deliberate, localized signal to TypeScript that the developer guarantees type compatibility.
    ```svelte
    <FormShell validate={validateWholesaler as any} />
    ```

2.  **Casting Data Up (`{@const}`):** Inside the snippets, the weakly-typed `data` object from the shell is immediately cast to the parent's specific form data type. This restores full type safety, autocompletion, and compile-time checking within the template.
    ```svelte
    {#snippet fields({ data, get, set })}
      {@const form_data = data as SupplierFormData}
      <h1>{form_data.name}</h1>
    {/snippet}
    ```

### Frontend Navigation Architecture: Context Conservation
The application employs a **"Context Conservation"** pattern to create an intuitive and non-destructive hierarchical browsing experience. The primary UX goal is to ensure the user never feels "lost" after navigating. The application should always remember the deepest path the user has explored and reflect this state consistently across the `HierarchySidebar` and the `Breadcrumb` components.

#### Core Components:
1.  **Persistent State (`navigationState.ts`):** A Svelte store that "remembers" the IDs of the last visited path and synchronizes with `sessionStorage`.
2.  **The "Brain" (`(browser)/+layout.ts`):** The root `load` function acts as the central orchestrator. On every navigation, it:
    - Reads the current path from URL `params`.
    - Reads the "remembered" path from the `navigationState` store.
    - Reconciles these two paths to create a final, consistent UI path that preserves user context.
    - Determines the current `activeLevel` based on the URL.
    - Calls `buildBreadcrumb.ts`, passing it all necessary data to construct the final UI state for the `Breadcrumb` and `HierarchySidebar`.
3.  **The UI (`Breadcrumb.svelte`, `HierarchySidebar.svelte`):** These are "dumb" components that simply render the pre-calculated data provided by the `load` function.

The core principle is: **The application remembers the user's deepest path within a hierarchy and only prunes this path when the user explicitly changes context on a higher level.**

This principle translates into the following specific behaviors:

1.  **Drilling Down:** When a user navigates deeper into the hierarchy (e.g., from a Supplier to one of its Categories), the navigation path is extended. The sidebar expands, and the breadcrumb grows. This new, deeper path is saved as the "remembered" state.

2.  **Navigating Up (within the same context):** When a user navigates to a higher level *within the same remembered path* (e.g., by clicking a parent breadcrumb or a higher-level sidebar item), the main content area updates to show that level, but the **full remembered path remains visible and enabled**. The breadcrumbs are not shortened, and the lower levels in the sidebar remain enabled, allowing the user to immediately return to their deepest point of exploration without losing context.

3.  **Changing Context (the crucial rule):** When the user makes a choice that invalidates the remembered sub-path, the application prunes the state from that point downwards. All deeper levels in both the sidebar and the breadcrumbs are removed or disabled.

**Concrete Examples:**

*   **Scenario A: Changing a Category**
    *   **Current Path:** `Supplier A > Category X > Offering 123`
    *   **Action:** The user is on the "Supplier A" detail page and clicks on a different category, `Category Y`.
    *   **New State:** The remembered path is pruned below the category level. The new state becomes `Supplier A > Category Y`. The `Offering 123` part of the path is forgotten, and the "Offerings," "Attributes," and "Links" levels in the sidebar become disabled until a new offering is selected.

*   **Scenario B: Changing a Supplier**
    *   **Current Path:** `Supplier A > Category X > Offering 123`
    *   **Action:** The user navigates back to the main list and clicks on a different supplier, `Supplier B`.
    *   **New State:** The remembered path is pruned below the supplier level. The new state becomes `Supplier B`. Both `Category X` and `Offering 123` are forgotten. The sidebar resets, and only the "Categories" level for Supplier B becomes enabled.

This behavior is orchestrated by the root `(browser)/+layout.ts`, which reconciles the current URL with the state persisted in the `navigationState` store on every navigation.

#### **Known Issue: Top-Level Navigation Reset**
There is currently a known bug in the `(browser)/+layout.ts` reconciliation logic.
- **Behavior:** When navigating from a deep level (e.g., an Offering page) back to the top-level "Suppliers" list via the sidebar or breadcrumb, the `navigationState` is incorrectly cleared. This causes the breadcrumb to shrink and the deeper sidebar levels to become disabled, losing the user's context.
- **Correct Behavior:** When navigating to "Categories" (a mid-level), the deeper state (Offering, etc.) is correctly preserved. The issue is specific to returning to the absolute root of the navigation tree.
- **Status:** This is a high-priority issue to be fixed in the layout's `load` function.

---

## Architectural Insight: Handling Isomorphic Code

One of the major challenges in SvelteKit is managing code that runs in both environments (isomorphic code, primarily in `src/lib`).

**The Problem: Hidden Node.js Dependencies in the Browser**
Attempting to import server-side Node.js modules (like `pino-pretty`) in an isomorphic file **inevitably breaks the browser build**. This happens at build-time, long before a runtime `if (browser)` check can prevent the import.

**The Challenge: Race Conditions with Asynchronous Initialization**
Workarounds involving dynamic, asynchronous imports introduce race conditions where log calls can be "swallowed" because the logger has not yet finished its asynchronous initialization.

**The Current Solution: A Minimal, Synchronous Logger**
The project uses a **minimal, synchronous logger implementation** in `src/lib/utils/logger.ts` that uses a simple `if (browser)` check to strictly separate the environments without any problematic server-side imports. This guarantees reliability.

---

## Examples of Generic Type Usage

### Querying Master Data
```typescript
// In an API client (e.g., supplier.ts)
const query: QueryPayload<Wholesaler> = {
  from: { table: 'dbo.wholesalers', alias: 'w' },
  select: ['w.wholesaler_id', 'w.name'],
  where: { key: 'w.status', whereCondOp: ComparisonOperator.EQUALS, val: 'active' }
};
// Sent via POST /api/suppliers
```

### Hierarchical Child Creation (1:n)
```typescript
// Category → Offering
CreateChildRequest<ProductCategory, Partial<Omit<WholesalerItemOffering, 'offering_id'>>>
// → { parentId: 5, data: { wholesaler_id: 1, category_id: 5, product_def_id: 10 } }

// Offering → Link
CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, 'link_id'>>
// → { parentId: 12, data: { offering_id: 12, url: "https://...", notes: "..." } }
```

### Assignment Creation (n:m)
```typescript
// Supplier-Category Assignment
AssignmentRequest<Wholesaler, ProductCategory, { comment?: string; link?: string }>
// → { parentId: 1, childId: 5, comment: "High priority" }

// Offering-Attribute Assignment  
AssignmentRequest<WholesalerItemOffering, Attribute, { value?: string }>
// → { parentId: 12, childId: 3, value: "Red" }
```

---

## Implementation Guidelines

### Adding New Master Data

**For Independent Entities:**
```typescript
// Server endpoint: /api/{entity}/new
Body: Omit<Entity, 'id_field'>

// Client function:
create{Entity}(data: Omit<Entity, 'id_field'>): Promise<Entity>
```

### Adding New Hierarchical Children

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

### Adding New Assignments

**For n:m Relationships:**
```typescript
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

## Developer Tooling: Automated Page Scaffolding

To enforce the Page Delegation Pattern and accelerate development, a command-line scaffolding tool is provided. It automatically generates the required file structure for a new page based on a central configuration.

### The Configuration (`tools/scaffoldConfig.ts`)

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

### The Templates (`tools/templates/`)

The tool uses template files for each generated file type (`page.svelte`, `page.ts`, `+page.svelte`, `+page.ts`). These templates contain Svelte 5-compliant boilerplate code and placeholders (e.g., `PageName$PlaceHolder`) that are filled in by the script.

### Usage

To generate all pages defined in the configuration, run the following command from the project root:

```
npm run generate:pages
```

---

## Frontend API Client & State Management

### The ApiClient: An SSR-Safe Foundation
The cornerstone of frontend data fetching is the `ApiClient` class. A new instance is created for each data-loading context, passing in the context-aware `fetch` function provided by SvelteKit's `load` event. This ensures that API calls are SSR-safe.

```typescript
// Correct usage in any `+page.ts` or `+layout.ts`
export async function load({ fetch: svelteKitFetch }: LoadEvent) {
  const client = new ApiClient(svelteKitFetch);
  const supplierApi = getSupplierApi(client);
  const suppliers = await supplierApi.loadSuppliers();
}
```

### The LoadingState Architecture
The application uses a two-level approach to provide clear loading feedback.
- **Action-Specific Loading:** Each API client module (`supplier.ts`, etc.) exports its own `LoadingState` instance for granular feedback on specific actions (e.g., deleting, saving).
- **Page-Level Loading:** Page components import relevant `LoadingState` stores and combine them using a `derived` store to create a single, top-level loading indicator for the entire view.

---

## Understanding Svelte's Reactivity in the SupplierBrowser App

Svelte's core feature is its powerful and efficient reactivity system. In this application, it can be understood on three distinct levels:

1.  **Architectural Reactivity (`load` Function):** SvelteKit's `load` function is the highest level of reactivity, triggered by navigation. It re-runs automatically when its declared dependencies (like the URL) change, ensuring that page and layout components always receive fresh data props. This is the engine that drives the entire application's data flow between views.

2.  **Global Reactivity (Svelte Stores):** For state that needs to be shared across disconnected components or persist across navigations, the app uses Svelte Stores. The `navigationState.ts` store is a prime example, providing a reactive container for the "remembered" path that is accessible to the `load` function in any context.

3.  **Component-Level Reactivity (Svelte 5 Runes):** Runes (`$state`, `$props`, `$derived`) make reactivity explicit and granular inside components.
    - **`$props()`** makes component properties reactive. When a `load` function returns a new `data` object, the component automatically updates.
    - **`$state()`** creates locally-scoped, reactive variables (e.g., `submitting` in `FormShell`).
    - **`$derived()`** creates a value that is automatically recalculated whenever its dependencies change, forming the backbone of reactive UI logic.

---

## Implementation Pitfalls & Best Practices

### ApiClient: Handling the Response Body
**Problem:** A `Response` body from a `fetch` call is a stream and can only be read **once**.
**Best Practice:** Always read the body into a variable (`await response.text()` or `await response.json()`) exactly once and then reuse that variable.

### ApiClient: SSR-Safe Data Loading in `load` functions
**Problem:** Using the global `fetch` with relative URLs (e.g., `/api/suppliers`) will fail during Server-Side Rendering (SSR).
**Best Practice:** Always use the context-aware `fetch` function provided by SvelteKit's `LoadEvent` and pass it to the `ApiClient`'s constructor, as documented in the architecture.

---

## TODOS (UPDATED)
*   **FIX NAVIGATION BUG:** The reconciliation logic in `(browser)/+layout.ts` is faulty. When navigating to the top-level "Suppliers" list, the conserved path is incorrectly cleared, causing the loss of user context. This works correctly when navigating to mid-levels like "Categories". This is a high-priority bug.
See chapter "Frontend Navigation Architecture: Context Conservation" above.

*   **Finalize CSS Refactoring:** Ensure all pages correctly import and use the new pattern-based CSS files (`detail-page-layout.css`, etc.) and that all duplicate local styles have been removed.
*   **Audit API Clients for SSR Safety:** Verify that all `LoadingState` method calls (`.start()`, `.finish()`) are wrapped in an `if (browser)` check.
*   **Audit `load` Functions:** Verify that all `load` functions correctly pass the `fetch` function from the `LoadEvent` to the `ApiClient`.
*   **Audit Deletion Logic:** Verify that all `deleteStrategy` implementations use the "fire-and-forget" `invalidateAll()` pattern to prevent UI race conditions.
*   **Fix scaffolding tool:** Ensure the `+page.ts` template generates extension-less imports for module delegation.
```