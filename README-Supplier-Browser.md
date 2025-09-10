# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

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
}```

---

## API Architecture Patterns

### The Generic Query Endpoint: `/api/query`

The `/api/query` endpoint is a central architectural component that handles all complex relational data access. It expects the `from` clause in a `QueryPayload` to be a structured object: `{ table: string, alias: string }`, which is validated on the server against a central `aliasedTablesConfig`.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures. The anti-join to find available products is a prime example of its power.
- **Named Queries**: Predefined query configurations like `supplier_categories`, `category_offerings`, etc.
- **Security**: All table and alias access is validated against a central `aliasedTablesConfig` on the server to prevent unauthorized data access.

### Master Data Pattern: QueryPayload + Individual CRUD

Master data entities follow a consistent pattern for API interactions. List queries are initiated by the client sending a complete `QueryPayload`, including the `from` object. The typed server endpoint (e.g., `/api/suppliers`) acts as a semantic gatekeeper that enforces the `from` clause.

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

#### Deletion Patterns for Relationships vs. Master Data

To ensure API consistency, deletion operations adhere to one of three distinct patterns based on the type of resource being deleted.

| Deletion Type | Endpoint | Method | Body Content | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Master Data** | `/api/[entity]/[id]` | `DELETE` | *None*. `cascade` flag is a URL query parameter (`?cascade=true`). | Deletes a top-level entity. The ID in the URL is the source of truth. |
| **n:m Assignment** | `/api/[parent]-[child]` | `DELETE` | `RemoveAssignmentRequest<{parentId, childId}>` | Removes a link between two entities. Requires both IDs to identify the unique relationship. |
| **1:n Child** | `/api/[parent]-[child]` | `DELETE` | `DeleteRequest<{id}>` | Deletes a child entity that has its own unique ID. Follows the standard `DeleteRequest` pattern. |

---

## Current Implementation Status

| Entity/Operation | Endpoint | Generic Type | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** | | | | | |
| Query List | `POST /api/suppliers` | `QueryRequest<Wholesaler>` | ✅ | ✅ | Client sends full `from` object. |
| Read Single | `GET /api/suppliers/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/suppliers/new` | `Omit<Wholesaler, 'wholesaler_id'>` | ✅ | ✅ | |
| Update | `PUT /api/suppliers/[id]` | `Partial<Wholesaler>` | ✅ | ✅ | |
| Delete | `DELETE /api/suppliers/[id]` | - | ✅ | ✅ | |
| **ATTRIBUTES (Master Data)** | | | | | |
| Query List | `POST /api/attributes` | `QueryRequest<Attribute>` | ✅ | ✅ | |
| Read Single | `GET /api/attributes/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/attributes/new` | `Omit<Attribute, 'attribute_id'>` | ✅ | ✅ | |
| Update | `PUT /api/attributes/[id]` | `Partial<Attribute>` | ✅ | ✅ | |
| Delete | `DELETE /api/attributes/[id]` | - | ✅ | ✅ | |
| **CATEGORIES (Master Data)** | | | | | |
| Query List | `POST /api/categories` | `QueryRequest<ProductCategory>` | ✅ | ✅ | For assignment dropdowns |
| Read Single | `GET /api/categories/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/categories/new` | `Omit<ProductCategory, 'category_id'>` | ✅ | ✅ | |
| Update | `PUT /api/categories/[id]` | `Partial<ProductCategory>` | ✅ | ✅ | |
| Delete | `DELETE /api/categories/[id]` | - | ✅ | ✅ | |
| **PRODUCT DEFINITIONS (Master Data)** | | | | | |
| Query List | `POST /api/product-definitions` | `QueryRequest<ProductDefinition>` | ✅ | ✅ | |
| Read Single | `GET /api/product-definitions/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/product-definitions/new` | `Omit<ProductDefinition, 'product_def_id'>` | ✅ | ✅ | |
| Update | `PUT /api/product-definitions/[id]` | `Partial<ProductDefinition>` | ✅ | ✅ | |
| Delete | `DELETE /api/product-definitions/[id]` | - | ✅ | ✅ | |
| Query Available for New Offering | `POST /api/query` | `QueryPayload` with `LEFT JOIN` | ✅ | ✅ | Functionality moved to `offering.ts` client. |
| **SUPPLIER-CATEGORIES (Assignment - n:m)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'supplier_categories'` | ✅ | ✅ | |
| Create Assignment | `POST /api/supplier-categories` | `AssignmentRequest<Wholesaler, ProductCategory>` | ✅ | ✅ | |
| Remove Assignment | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest<Wholesaler, ProductCategory>` | ✅ | ✅ | |
| **CATEGORY-OFFERINGS (Hierarchical - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'category_offerings'` | ✅ | ✅ | |
| Create | `POST /api/category-offerings` | `CreateChildRequest<ProductCategory, OfferingData>` | ✅ | ✅ | |
| Update | `PUT /api/category-offerings` | `{offering_id, ...updates}` | ✅ | ✅ | |
| Delete | `DELETE /api/category-offerings` | `DeleteRequest<WholesalerItemOffering>` | ✅ | ✅ | |
| **OFFERING-ATTRIBUTES (Assignment - n:m Attributed)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_attributes'` | ✅ | ✅ | |
| Create Assignment | `POST /api/offering-attributes` | `AssignmentRequest<WholesalerItemOffering, Attribute>` | ✅ | ✅ | |
| Update Assignment | `PUT /api/offering-attributes` | `AssignmentUpdateRequest<WholesalerItemOffering, Attribute>` | ✅ | ✅ | |
| Delete Assignment | `DELETE /api/offering-attributes` | `RemoveAssignmentRequest<WholesalerItemOffering, Attribute>` | ✅ | ✅ | |
| **OFFERING-LINKS (Composition - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_links'` | ✅ | ✅ | |
| Read Single | `GET /api/offering-links/[id]` | - | ✅ | ✅ | For forms only |
| Create | `POST /api/offering-links` | `CreateChildRequest<WholesalerItemOffering, LinkData>` | ✅ | ✅ | |
| Update | `PUT /api/offering-links` | Update pattern | ✅ | ✅ | |
| Delete | `DELETE /api/offering-links` | `DeleteRequest<WholesalerOfferingLink>` | ✅ | ✅ | |

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
Instead of creating a specialized, one-off API endpoint, we **leverage the flexibility of the generic query system**. The client-side API module (`offering.ts`) constructs a full `QueryPayload` that perfectly describes this complex join. This payload is then sent to the generic `/api/query` endpoint, which validates it against the `aliasedTablesConfig` and builds the secure, parameterized SQL.

This enhancement makes our generic query system significantly more powerful, avoids API endpoint proliferation, and keeps complex business logic encapsulated in the client-side API module responsible for the context (`offering.ts`).

### Future Architectural Enhancements

#### Recursive Sidebar Component
- **Current State:** The `HierarchySidebar` component currently renders a flat list of `HierarchyItem` objects. The hierarchical structure is simulated using a `level` property, which is used to calculate CSS padding for indentation.
- **Potential Improvement:** A future refactoring could change the data structure from a flat list to a true tree structure, where each node object contains an optional `children` array of child nodes.
- **Benefits:** The `HierarchySidebar` component could then be refactored to render itself recursively using `<svelte:self>`. This would make the component more robust, capable of handling infinitely deep hierarchies, and would rely on semantically correct nested `<ul>` lists for indentation instead of dynamic styling.

---

## Technical Architecture Pillars

### Type Safety Architecture
The project is built on five pillars of type safety that work together to ensure correctness from the database to the UI.
- **Pillar I: Generic API Types:** Universal request/response envelopes in `lib/api/types/common.ts`.
- **Pillar II: Query Grammar:** Type-safe query language in `lib/clientAndBack/queryGrammar.ts`, featuring a structured `from: { table, alias }` object.
- **Pillar III: Query Config:** A security whitelist for all table, alias, and column access, centered around a single source of truth: the `aliasedTablesConfig` object.
- **Pillar IV: Query Builder:** A server-side utility that converts the type-safe grammar into parameterized SQL.
- **Pillar V: Data Validation & Contracts with Zod:** A new pillar ensuring runtime data integrity on the frontend.
- **Pillar VI: Enhanced Component Type Safety:** Key generic components like the `Datagrid` have been improved for stricter type safety. For example, the `ColumnDef` type now requires the `key` property to always be a valid `keyof T` of the data model, even when a custom `accessor` function is used. This prevents typos and invalid column definitions at compile time.

### Pillar V: Data Validation & Contracts with Zod
Zod is the single source of truth for the **shape** of data on the frontend. It allows us to define a data structure once and get both static TypeScript types and runtime validation for free. This is crucial for ensuring that data coming from the "untyped" outside world (like an API response) conforms to the application's expectations before it is used in Svelte components.

#### Usage on the Frontend (Client-Side)
Zod is a cornerstone of the frontend architecture in two key areas:

1.  **Defining Data Contracts for `load` Functions:** Zod schemas (e.g., `SupplierDetailPage_LoadDataSchema`) define the exact shape of the data that a page component expects to receive. In our async `load` pattern, we validate the resolved data from API calls against these schemas *before* passing it to the component. This guarantees that the component only ever renders data that has been verified at runtime.
    ```typescript
    // Conceptual example in a component's $effect block
    const resolvedData = await Promise.all(...);
    const validationResult = SupplierDetailPage_LoadDataSchema.safeParse(resolvedData);

    if (!validationResult.success) {
      throw new Error("Invalid data structure from API!");
    }
    // Now it's safe to use validationResult.data
    ```

2.  **Validating Component Props:** Components that receive complex data objects as props, like `OfferingForm`, use Zod schemas internally to validate their inputs upon initialization. This creates robust, "self-defending" components that fail early if they are used with incorrect data.

#### Current Status on the Server-Side
Server-side API endpoints (`/api/...`) do **not yet** use Zod for validating incoming request bodies. They rely on the custom-built, programmatic `validateDomainEntity` function from `domainValidator.ts`.

Migrating the server-side validation to Zod is a potential future architectural improvement. This would reduce code, eliminate the need for the `validateDomainEntity` system, and create a single, unified validation mechanism across the entire full-stack application.

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

### Frontend Architecture: Domain-Driven Structure & Page Delegation
To improve developer experience and scalability, the frontend follows a **Domain-Driven file structure** combined with a **Page Delegation Pattern**.

The core principle is **Co-Location**: All files related to a specific business domain (e.g., "Suppliers") are located in a single directory.

#### New Directory Structure
All reusable page modules and components are now located under `src/lib/domain/`. The previous separation between `lib/pages` and `lib/components/domain` has been eliminated.

**Before:**
```
src/lib/
├── components/domain/suppliers/
│   └── SupplierForm.svelte
└── pages/suppliers/
    └── SupplierDetailPage.svelte
```

**After:**
```
src/lib/
└── domain/
    └── suppliers/
        ├── SupplierForm.svelte
        └── SupplierDetailPage.svelte
```

#### The Delegation Pattern
- A SvelteKit **Route** (`src/routes/...`) acts as a simple "delegator". Its only job is to load data and render the corresponding page module.
- It imports and renders a reusable **Page Module** from `src/lib/domain/...`.
- This allows multiple, different URLs to render the same UI with different data contexts, ensuring that UI and data-loading logic exist only once and are easy to find.

### Frontend Styling Architecture: Pattern-Based CSS
The application avoids global, unscoped CSS. Instead, it follows a **pattern-based approach** where common UI patterns are defined in central CSS files and explicitly imported by the components or pages that use them.
- **Key Files:** `detail-page-layout.css`, `assignment-section.css`, `form.css`.
- **Principle:** Components are self-documenting in their style dependencies, preventing CSS conflicts.

### Frontend Form Architecture: The "Dumb Shell / Smart Parent" Pattern
To create reusable yet fully type-safe forms, the project uses this robust pattern.

#### The "Dumb" State Manager: `FormShell.svelte`
- A generic component that knows nothing about specific data types like `Wholesaler`.
- It manages the core form mechanics: tracking data, "dirty" state, submission status, and orchestrating the `validate` and `submit` lifecycle via Svelte 5 callback props (`onSubmitted`, `onSubmitError`).
- The `FormShell` is enhanced with an `$effect` to robustly handle asynchronous changes to its `initial` prop, preventing state inconsistencies when a component is reused across navigations.

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

### Frontend API Client & State Management

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

### Data Invalidation: The "Re-fetch and Update" Pattern
To provide a seamless user experience without disruptive page reloads, the application uses a **"Re-fetch and Update"** pattern for data invalidation after a mutation (e.g., assigning a category).

-   **Anti-Pattern:** The use of `invalidateAll()` or `goto(..., { invalidateAll: true })` is avoided for simple state updates. While effective, this "sledgehammer" approach re-runs all `load` functions and can cause a noticeable "jump" or "flash" as the entire page's data is re-fetched.
-   **Best Practice:** The recommended workflow is:
    1.  **Mutate:** Execute the API call that changes data on the server (e.g., `supplierApi.assignCategoryToSupplier()`).
    2.  **Re-fetch:** Upon a successful response, immediately re-fetch *only the specific data sources* that were affected by the change (e.g., call `loadCategoriesForSupplier()` and `loadAvailableCategoriesForSupplier()` again).
    3.  **Update State:** Write the newly fetched data directly into the component's local `$state` variables. Svelte's reactivity will then update the UI seamlessly and instantly without a full page reload.

This pattern provides the ideal balance between data consistency (by always getting the latest data from the server) and a smooth, modern user experience.

---

## Developer Experience & Tooling

### Fluent Query Builder: Type-Safe Query Construction
To improve developer experience and reduce errors when constructing `QueryPayload` objects on the client, the project provides a typsicheren, fluenten Query Builder. This builder guides the developer through the creation of a valid query, making the code more readable and robust.

**Before (Manual Object Construction):**
```typescript
const payload: QueryPayload<Wholesaler> = {
  from: { table: 'dbo.wholesalers', alias: 'w' },
  select: ['w.wholesaler_id', 'w.name'],
  where: { key: 'w.status', whereCondOp: ComparisonOperator.EQUALS, val: 'active' }
};```

**After (Fluent Builder):**
```typescript
import { Query, ComparisonOperator } from '$lib/backendQueries/fluentQueryBuilder';

const payload = Query.for<Wholesaler>()
  .from('dbo.wholesalers', 'w')
  .select(['w.wholesaler_id', 'w.name'])
  .where()
    .and('w.status', ComparisonOperator.EQUALS, 'active')
  .build();
```

---

### Advanced Assertion Utilities: Simplifying Type Safety
A common challenge in Svelte components that handle asynchronously loaded data is proving to the TypeScript compiler that a nested property is no longer `null` or `undefined`. The project provides an advanced `assertDefined` utility to solve this elegantly.

**The Problem:**
After loading data, a simple check might not be enough to satisfy the compiler for nested properties.
```typescript
let resolvedData: { offering: Offering | null } | null = $state(null);

// This check only confirms `resolvedData` is not null.
if (!resolvedData) { throw new Error("Data not loaded"); }

// ERROR: 'resolvedData.offering' is possibly 'null'.
const id = resolvedData.offering.offering_id; 
```

**The Solution (`assertDefined` with Path Validation):**
The enhanced `assertDefined` function can take an array of paths to validate. It uses an advanced `asserts obj is WithDefinedPaths<...>` signature to inform TypeScript's control flow analysis that these paths are guaranteed to exist and are not null/undefined.

```typescript
// This single assertion guarantees that `resolvedData` AND the path `["offering"]` are not null.
assertDefined(resolvedData, "Data and offering must be loaded", ["offering"]);

// NO ERROR: TypeScript now understands the access is safe.
const id = resolvedData.offering.offering_id; 

// It even works for deeply nested paths.
assertDefined(resolvedData, "Price must exist", ["offering", "details", "price"]);
const price = resolvedData.offering.details.price; // Type is `number`, not `number | null`
```
This utility simplifies code within event handlers and other component logic, eliminating the need for repetitive nested `if` checks while maintaining strict type safety.

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

## Svelte 5 Best Practices & Pitfalls

### Correct Prop Typing with `$props()`
Correctly typing component props is crucial for type safety. The official and recommended syntax for Svelte 5 is to use **destructuring with a type annotation**.

**Correct Pattern:**
A `type` or `interface` for the props is defined, and this type is then applied to the destructured `const` or `let`.
```typescript
// 1. Define a type for the component's props.
type MyComponentProps = {
  name: string;
  count?: number;
};

// 2. Use the type to annotate the destructured props.
const { name, count = 0 }: MyComponentProps = $props();
```
**Anti-Pattern:**
Using a generic type argument with `$props()` (e.g., `$props<MyComponentProps>()`) is **incorrect**. The `$props()` rune is a compiler macro, not a generic function. This will result in a TypeScript compiler error (`ts(2558): Expected 0 type arguments, but got 1`).

### Understanding `$derived` vs. `$derived.by`
Svelte 5 offers two ways to create derived reactive values. Understanding their difference is key to avoiding bugs and "false positive" type errors from the language server.

#### `$derived(...)` - The Macro
- **What it is:** A compile-time macro. The Svelte compiler transforms this code at build time.
- **How to access:** The variable holds the **direct value**. You access it directly: `if (myDerivedValue) { ... }`.
- **When to use:** This should be the default choice for simple, inline derivations. It's cleaner and more concise.
- **Pitfall:** Because it's a compiler macro, the TypeScript Language Server can sometimes get confused and incorrectly infer that the variable is a function (`() => ...`), leading to "false positive" type errors in the editor, even though the code would compile and run correctly.

#### `$derived.by(...)` - The Function
- **What it is:** An explicit, regular function that is executed at runtime. It does not get transformed.
- **How to access:** The variable holds a **signal object**, which is a getter function. To get the current value, you **must call it**: `if (myDerivedValue()) { ... }`.
- **When to use:** Use this more explicit form when the `$derived` macro causes incorrect type errors from the tooling, or when the derivation logic is complex and needs to be passed as a function.

**Recommendation:** Start with the `$derived` macro for its simplicity. If you encounter inexplicable TypeScript errors related to a "function being assigned to a value", switch to `$derived.by(...)` and remember to access the value with `()`.

---

## TODOS (UPDATED)
* Check if necessary: Add routes for adding new objects: suppliers, offerings
*   **Finalize CSS Refactoring:** Ensure all pages correctly import and use the new pattern-based CSS files (`detail-page-layout.css`, etc.) and that all duplicate local styles have been removed.
*   **Audit API Clients for SSR Safety:** Verify that all `LoadingState` method calls (`.start()`, `.finish` are wrapped in an `if (browser)` check.
*   **Audit `load` Functions:** Verify that all `load` functions correctly pass the `fetch` function from the `LoadEvent` to the `ApiClient`.
*   **Audit Deletion Logic:** Verify that all `deleteStrategy` implementations use the "fire-and-forget" `invalidateAll()` pattern to prevent UI race conditions.
*   **Fix scaffolding tool:** Ensure the `+page.ts` template generates extension-less imports for module delegation.