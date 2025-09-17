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

#### Level 3: Offerings (Attributed n:m Relationship)
- **Entity**: `dbo.wholesaler_item_offerings`
- **Purpose**: A central master data entity that realizes the n:m relationship between a `Wholesaler` and a `ProductDefinition`, carrying its own attributes like `price` and `size`.
- **Key Characteristic**: While being a master data entity with its own CRUD endpoints, it is logically dependent on its parents (`Wholesaler`, `ProductCategory`, `ProductDefinition`) for context. A supplier can have multiple offerings for the same product definition (e.g., different sizes or conditions).
- **API Pattern**: Centralized CRUD via `/api/offerings/[id]`. Creation via `POST /api/offerings/new` with a body containing all required foreign keys (`wholesaler_id`, `category_id`, `product_def_id`).
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

// 1:n Hierarchical Creation (one parent ID, child exists in parent context)
export type CreateChildRequest<TParent, TChild> = {
    parentId: TParent[IdField<TParent>];
    data: TChild;
}

// Assignment between two master entities (n:m relationships)
export type AssignmentRequest<TParent1, TParent2, TChild> = {
    parent1Id: TParent1[IdField<TParent1>];
    parent2Id: TParent2[IdField<TParent2>];
    data?: TChild
}

// Update assignment between two master entities
export type AssignmentUpdateRequest<TParent1, TParent2,TChild> = {
    parent1Id: TParent1[IdField<TParent1>];
    parent2Id: TParent2[IdField<TParent2>];
    data?: TChild
}

// Remove assignment between two master entities
export type RemoveAssignmentRequest<TParent1, TParent2> = {
    parent1Id: TParent1[IdField<TParent1>];
    parent2Id: TParent2[IdField<TParent2>];
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
| **1:n Hierarchical Creation**| `CreateChildRequest<Parent, Child>` | Child exists only in parent context | `POST /api/offering-links` |
| **n:m Assignment** | `AssignmentRequest` | Link two existing entities | `POST /api/supplier-categories` |
| **Generic Query** | **`QueryRequest<T>`** | Flexible querying for lists or complex joins | `POST /api/query` |


### Redundancy Handling in `CreateChildRequest`

For hierarchical relationships, the API accepts controlled redundancy between the parent context and the child's foreign key in the request body.

```typescript
// Client sends a request to POST /api/offering-links
// The parentId (123) is provided in the body for consistency.
CreateChildRequest<WholesalerItemOffering, Partial<Omit<WholesalerOfferingLink, 'link_id'>>> = {
  parentId: 123,           // Parent offering_id context
  data: {
    offering_id: 123,      // May be redundant - server validates consistency
    url: "https://..."
  }
}

// Server-side logic ensures consistency:
if (requestData.parentId !== requestData.data.offering_id) {
  throw new Error("Parent ID mismatch");
}
```

---

## API Architecture Patterns

### The Generic Query Endpoint: `/api/query`

The `/api/query` endpoint is a central architectural component that handles all complex relational data access. It expects a `QueryPayload` object and validates it on the server against a central `aliasedTablesConfig`.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures.
- **Named Queries**: Predefined query configurations like `supplier_categories`, `product_definition_offerings`, etc.
- **Security**: All table and alias access is validated against a central `aliasedTablesConfig` on the server to prevent unauthorized data access.

### Master Data Pattern: QueryPayload + Individual CRUD

Master data entities follow a consistent pattern for API interactions. List queries are initiated by the client sending a complete `QueryPayload`.

```typescript
// List with flexible querying
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
- `/api/offering-links`: An Offering has many Links.

```typescript
// Example: Create a Link for an Offering
POST /api/offering-links
{
  "parentId": 123,
  "data": { "url": "https://..." }
}
```

#### n:m Assignment Relationships (`AssignmentRequest`)
- `/api/supplier-categories`: Assign a Supplier to a Category.
- `/api/offering-attributes`: Assign an Attribute to an Offering.

```typescript
// Example: Assign a Category to a Supplier
POST /api/supplier-categories
{
  "parent1Id": 1,
  "parent2Id": 5,
  "data": {
    "comment": "High priority",
    "link": "https://..."
  }
}
```

#### Deletion Patterns for Relationships vs. Master Data

To ensure API consistency, deletion operations adhere to one of three distinct patterns based on the type of resource being deleted.

| Deletion Type | Endpoint | Method | Body Content | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Master Data** | `/api/[entity]/[id]` | `DELETE` | *None*. `cascade` flag is a URL query parameter (`?cascade=true`). | Deletes a top-level entity. The ID in the URL is the source of truth. |
| **n:m Assignment** | `/api/[parent]-[child]` | `DELETE` | `RemoveAssignmentRequest` | Removes a link between two entities. Requires both IDs to identify the unique relationship. |
| **1:n Child** | `/api/[parent]-[child]` | `DELETE` | `DeleteRequest<{id}>` | Deletes a child entity that has its own unique ID. Follows the standard `DeleteRequest` pattern. |

---

## Current Implementation Status

| Entity/Operation | Endpoint | Generic Type | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** | | | | | |
| Query List | `POST /api/suppliers` | `QueryRequest<Wholesaler>` | ✅ | ✅ | |
| Read Single | `GET /api/suppliers/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/suppliers/new` | `Omit<Wholesaler, 'wholesaler_id'>` | ✅ | ✅ | |
| Update | `PUT /api/suppliers/[id]` | `Partial<Wholesaler>` | ✅ | ✅ | |
| Delete | `DELETE /api/suppliers/[id]` | - | ✅ | ✅ | |
| **ATTRIBUTES (Master Data)** | | | | | |
| Query List | `POST /api/attributes` | `QueryRequest<Attribute>` | ✅ | ✅ | |
| ... | ... | ... | ✅ | ✅ | |
| **CATEGORIES (Master Data)** | | | | | |
| Query List | `POST /api/categories` | `QueryRequest<ProductCategory>` | ✅ | ✅ | |
| ... | ... | ... | ✅ | ✅ | |
| **PRODUCT DEFINITIONS (Master Data)** | | | | | |
| Query List | `POST /api/product-definitions` | `QueryRequest<ProductDefinition>` | ✅ | ✅ | |
| ... | ... | ... | ✅ | ✅ | |
| **OFFERINGS (Master Data)** | | | | | **REFACTORED** |
| Query List | `POST /api/offerings` | `QueryRequest<Offering>` | ✅ | ✅ | |
| Read Single | `GET /api/offerings/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/offerings/new` | `Omit<Offering, 'offering_id'>` | ✅ | ✅ | Body must contain all FKs. |
| Update | `PUT /api/offerings/[id]` | `Partial<Offering>` | ✅ | ✅ | |
| Delete | `DELETE /api/offerings/[id]` | - | ✅ | ✅ | |
| **SUPPLIER-CATEGORIES (Assignment - n:m)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'supplier_categories'` | ✅ | ✅ | |
| Create Assignment | `POST /api/supplier-categories` | `AssignmentRequest` | ✅ | ✅ | |
| Remove Assignment | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest` | ✅ | ✅ | |
| **OFFERING-ATTRIBUTES (Assignment - n:m Attributed)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_attributes'` | ✅ | ✅ | |
| Create Assignment | `POST /api/offering-attributes` | `AssignmentRequest` | ✅ | ✅ | |
| Update Assignment | `PUT /api/offering-attributes` | `AssignmentUpdateRequest` | ✅ | ✅ | |
| Delete Assignment | `DELETE /api/offering-attributes` | `RemoveAssignmentRequest` | ✅ | ✅ | |
| **OFFERING-LINKS (Composition - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_links'` | ✅ | ✅ | |
| Read Single | `GET /api/offering-links/[id]` | - | ✅ | ✅ | For forms only |
| Create | `POST /api/offering-links` | `CreateChildRequest<WholesalerItemOffering, LinkData>` | ✅ | ✅ | |
| Update | `PUT /api/offering-links` | Update pattern | ✅ | ✅ | |
| Delete | `DELETE /api/offering-links` | `DeleteRequest<WholesalerOfferingLink>` | ✅ | ✅ | |

---

## Architectural Decisions & Ongoing Work

### **CORRECTED:** Architectural Decision: Loading Available Entities for New Offerings

A core business rule is that a supplier can have **multiple, distinct offerings for the same product definition** (e.g., to represent different sizes, colors, or conditions). The initial architectural assumption of using a SQL `LEFT JOIN` / `IS NULL` (anti-join) to find "available" products was therefore **incorrect**, as it would filter out a product as soon as the first offering was created, preventing the creation of variants.

**The Corrected Architectural Solution:**
Instead of using a complex and logically flawed anti-join, the system now follows a simpler, more robust pattern:

1.  **Load All Relevant Parents:** When creating a new `Offering`, the UI must load **all** potential parent entities for the given context.
    *   **From Supplier Context (`/suppliers/...`):** The `OfferingForm` loads **all** `ProductDefinitions` that belong to the selected `ProductCategory`.
    *   **From Product Context (`/categories/...`):** The `OfferingForm` will load **all** `Wholesalers` that are assigned to the `ProductCategory` of the current `ProductDefinition`.

2.  **No Client-Side Filtering:** The client does not perform any logic to filter out entities for which offerings already exist. The selection dropdowns in the `OfferingForm` always present the complete list of valid parent entities.

This corrected approach simplifies the client-side API, aligns with the business requirements, and removes the need for complex, misuse-prone queries. The flexibility is now correctly placed in the data model, not in a restrictive query.

### Future Architectural Enhancements

#### Recursive Sidebar Component
- **Current State:** The `HierarchySidebar` component currently renders a flat list of `HierarchyItem` objects. The hierarchical structure is simulated using a `level` property, which is used to calculate CSS padding for indentation.
- **Potential Improvement:** A future refactoring could change the data structure from a flat list to a true tree structure, where each node object contains an optional `children` array of child nodes.
- **Benefits:** The `HierarchySidebar` component could then be refactored to render itself recursively using `<svelte:self>`. This would make the component more robust, capable of handling infinitely deep hierarchies, and would rely on semantically correct nested `<ul>` lists for indentation instead of dynamic styling.

---

## Technical Architecture Pillars

### Type Safety Architecture
The project is built on six pillars of type safety that work together to ensure correctness from the database to the UI.
- **Pillar I: Generic API Types:** Universal request/response envelopes in `lib/api/api.types.ts`.
- **Pillar II: Query Grammar:** A structured object (`QueryPayload`) for defining database queries in a type-safe manner.
- **Pillar III: Query Config:** A security whitelist for all table, alias, and column access, centered around a single source of truth: the `aliasedTablesConfig` object.
- **Pillar IV: Query Builder:** A server-side utility that converts the `QueryPayload` grammar into parameterized SQL.
- **Pillar V: Data Validation & Contracts with Zod:** A new pillar ensuring runtime data integrity on the frontend.
- **Pillar VI: Enhanced Component Type Safety:** Key generic components like the `Datagrid` have been improved for stricter type safety.

### Pillar II: Query Grammar & Core Structures (`QueryPayload`)
The architecture relies on a well-defined, type-safe object structure called `QueryPayload` to describe database queries. This approach ensures that all query definitions are declarative, serializable, and can be easily validated.

**Example `QueryPayload`:**
```typescript
const payload: QueryPayload<Wholesaler> = {
  from: { table: 'dbo.wholesalers', alias: 'w' },
  select: ['wholesaler_id', 'name', 'status'],
  where: { 
    whereCondOp: 'AND',
    conditions: [
      { key: 'w.status', whereCondOp: '=', val: 'active' }
    ]
  },
  orderBy: [{ key: 'name', direction: 'asc' }],
  limit: 50
};
```
This payload is sent from the client to a server endpoint (e.g., `/api/suppliers` or `/api/query`), where it is parsed, validated against the security configuration (`queryConfig.ts`), and safely converted into a parameterized SQL statement by the Query Builder.

### Pillar V: Data Validation & Contracts with Zod
Zod is the single source of truth for the **shape** of data on the frontend. It allows us to define a data structure once and get both static TypeScript types and runtime validation for free.

#### Usage on the Frontend (Client-Side)
1.  **Defining Data Contracts for `load` Functions:** Zod schemas (e.g., `SupplierDetailPage_LoadDataSchema`) define the exact shape of the data that a page component expects to receive.
2.  **Validating Component Props:** Components use Zod schemas internally to validate their inputs upon initialization, creating robust, "self-defending" components.

#### Current Status on the Server-Side
Server-side API endpoints do **not yet** use Zod for validating incoming request bodies. They rely on the custom-built `validateDomainEntity` function from `domainValidator.ts`. Migrating the server-side validation to Zod is a potential future architectural improvement.

### Request Pattern Architecture

#### Deletion Pattern: Optimistic Delete with Two-Step Confirmation
The client implements an **"Optimistic Delete"** pattern to provide a safe and informative user experience.

**Workflow:**
1.  **Step 1 (API Call):** The client sends a **non-cascading** `DELETE` request.
2.  **Step 2 (Conflict Path):** If the server responds with `409 Conflict` and `cascade_available: true`, it signals that dependencies exist.
3.  **Step 3 (Consequence-Aware Confirmation):** The UI displays a **second, specific dialog** detailing the consequences. If the user confirms, the client sends a second `DELETE` request with `cascade=true`.

### Frontend Architecture: Domain-Driven Structure & Page Delegation
The frontend follows a **Domain-Driven file structure** combined with a **Page Delegation Pattern**. The core principle is **Co-Location**: All files related to a specific business domain are located in a single directory (`src/lib/domain/suppliers/`).

- A SvelteKit **Route** (`src/routes/...`) acts as a simple "delegator". Its only job is to load data and render the corresponding page module from `src/lib/domain/...`.

### Frontend Form Architecture: The "Dumb Shell / Smart Parent" Pattern
To create reusable yet fully type-safe forms, the project uses this robust pattern.

#### The "Dumb" State Manager: `FormShell.svelte`
- A generic component that manages core form mechanics: tracking data, "dirty" state, submission, and validation lifecycle via Svelte 5 callback props.

#### The "Smart" Parent: `SupplierForm.svelte`
- A specific component that knows everything about a `Wholesaler`. It provides the domain-specific `validate` and `submit` functions to the `FormShell`.

### Frontend Navigation Architecture: Context Conservation
The application employs a **"Context Conservation"** pattern to create an intuitive hierarchical browsing experience. The system remembers the deepest path the user has explored and reflects this state consistently across the `HierarchySidebar` and `Breadcrumb` components, only pruning the path when the user explicitly changes context on a higher level.

---

## Understanding Svelte's Reactivity in the SupplierBrowser App

Svelte's reactivity is understood on three distinct levels:

1.  **Architectural Reactivity (`load` Function):** SvelteKit's `load` function is the highest level of reactivity, triggered by navigation.
2.  **Global Reactivity (Svelte Stores):** For state shared across components, like `navigationState.ts`.
3.  **Component-Level Reactivity (Svelte 5 Runes):** Runes (`$state`, `$props`, `$derived`) make reactivity explicit and granular inside components.

---

## Implementation Pitfalls & Best Practices

### ApiClient: Handling the Response Body
**Problem:** A `Response` body from a `fetch` call is a stream and can only be read **once**.
**Best Practice:** Always read the body into a variable (`await response.text()` or `await response.json()`) exactly once and then reuse that variable.

### ApiClient: SSR-Safe Data Loading in `load` functions
**Problem:** Using the global `fetch` with relative URLs (e.g., `/api/suppliers`) will fail during Server-Side Rendering (SSR).
**Best Practice:** Always use the context-aware `fetch` function provided by SvelteKit's `LoadEvent` and pass it to the `ApiClient`'s constructor.

## Svelte 5 Best Practices & Pitfalls

### Correct Prop Typing with `$props()`
The official and recommended syntax for Svelte 5 is to use **destructuring with a type annotation**.

**Correct Pattern:**
```typescript
type MyComponentProps = { name: string; count?: number; };
const { name, count = 0 }: MyComponentProps = $props();
```

**Anti-Pattern:**
Using a generic type argument like `$props<MyComponentProps>()` is incorrect and will cause a compiler error.

### Understanding `$derived` vs. `$derived.by`

The primary difference lies in how complex computations are handled.

#### `$derived(...)`
- **What it is:** A compile-time macro.
- **How to use:** Used for simple, inline expressions. The value is accessed directly.
- **Example:** `const double = $derived(count * 2);`

#### `$derived.by(...)`
- **What it is:** A function that takes a callback. This is the correct choice for more complex, multi-line computations or when the logic involves creating intermediate variables.
- **How to use:** The entire calculation is wrapped in a function that returns the final derived value. The return value of `$derived.by` is the computed value itself.
- **Example from the codebase:**
  ```typescript
  let { validatedData, errors } = $derived.by(() => {
    const result = SomeSchema.safeParse(initialData);
    // ... more logic ...
    return {
      validatedData: result.success ? result.data : null,
      errors: result.success ? null : result.error.issues,
    };
  });
  ```
In this pattern, the entire object `{ validatedData, errors }` is recomputed and its properties are destructured into reactive variables whenever `initialData` changes.

### The "Global Magic Chaos" and Type Safety
SvelteKit's `PageData` object, which merges data from all parent layouts, is powerful but can create implicit dependencies, making errors hard to trace. This is especially challenging with generic components like `FormShell.svelte`.

**Solution: The Controlled Bridge**
This application solves the problem by establishing a "Controlled Bridge" pattern where the "smart parent" component (`SupplierForm`) provides explicit type information to the generic child (`FormShell`), ensuring end-to-end type safety. This is achieved by:

1.  **Casting Props Down (`as any`):** Deliberately casting strongly-typed functions passed to the weakly-typed props of the generic shell.
2.  **Casting Data Up (`{@const}`):** Immediately casting the weakly-typed `data` object from the shell's snippet back to the specific type within the parent's template.

This guarantees that any property access is fully type-checked by the compiler, preventing runtime errors.


