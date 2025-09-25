Of course. Based on our detailed discussion and the necessary corrections, I have recreated the entire `README-Supplier-Browser.md` file in English.

I have meticulously ensured that all original chapters are included and that the content reflects the finalized architecture, including the direct use of Zod for validation, the correct explanation of Svelte's reactivity, and the Svelte 5 best practices for data flow.

Here is the complete and updated file.

---

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
    forceCascade?: boolean;
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

### Centralized Deletion Logic: `dataModel/deletes.ts`

To ensure consistency, robustness, and transaction safety, all complex deletion logic is centralized in server-side helper functions within `lib/dataModel/deletes.ts`.

-   **Pattern:** Each master data entity (e.g., `ProductDefinition`, `Supplier`) has a corresponding `delete...` function (e.g., `deleteProductDefinition`).
-   **Parameters:** These functions accept the `id` of the entity to delete, a `cascade: boolean` flag, and an active database `Transaction` object.
-   **Responsibility:** The function is solely responsible for executing the correct SQL `DELETE` statements. If `cascade` is true, it performs a multi-statement, CTE-based batch delete to remove all dependent records in the correct order. If `cascade` is false, it attempts to delete only the master record.
-   **Transaction Control:** These helpers do **not** commit or roll back the transaction. This responsibility remains with the calling API endpoint, making the helpers reusable and testable.
-   **Return Value:** On success, the function queries and returns the data of the resource that was just deleted, enabling the API to build a rich `DeleteSuccessResponse`.

### Deletion Patterns for Relationships vs. Master Data

To ensure API consistency, deletion operations adhere to one of three distinct patterns based on the type of resource being deleted.

| Deletion Type | Endpoint | Method | Body Content | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Master Data** | `/api/[entity]/[id]` | `DELETE` | `DeleteRequest<T>` containing `id`, `cascade`, and `forceCascade` flags. | Deletes a top-level entity. The ID in the URL is used for routing, while the body carries the full request payload for consistency. |
| **n:m Assignment** | `/api/[parent]-[child]` | `DELETE` | `RemoveAssignmentRequest` | Removes a link between two entities. Requires both IDs to identify the unique relationship. |
| **1:n Child** | `/api/[parent]-[child]` | `DELETE` | `DeleteRequest<{id}>` | Deletes a child entity that has its own unique ID. Follows the standard `DeleteRequest` pattern. |

### Deletion Pattern: Centralized, Multi-Stage Optimistic Delete

The client implements a highly robust **Optimistic Delete** pattern managed by a centralized `cascadeDelete` helper function. This provides a safe and context-aware user experience by clearly distinguishing between soft and hard dependencies.

**Workflow:**
1.  **Step 1 (API Call):** The client calls the generic `cascadeDelete` helper, which sends a **non-cascading** `DELETE` request.
2.  **Step 2 (Conflict Path):** If the server responds with `409 Conflict`, it returns a structured `dependencies` object: `{ hard: string[], soft: string[] }`.
3.  **Step 3 (Context-Aware Confirmation):**
    *   If only **soft** dependencies exist, the UI displays a specific confirmation dialog detailing the consequences. If confirmed, the client sends a second `DELETE` request with `cascade=true`.
    *   If **hard** dependencies exist (`cascade_available: false`), the UI displays a more urgent dialog. This dialog requires the user to check an additional "force cascade" box to confirm they understand the destructive nature of the action. Only then is a second `DELETE` request sent with both `cascade=true` and `forceCascade=true`.

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

### **FINALIZED:** Architectural Decision: Loading Entities for New Offerings

A core business rule is that a supplier can have **multiple, distinct offerings for the same product definition** (e.g., to represent different sizes, colors, or conditions). The initial architectural assumption of using a SQL `LEFT JOIN` / `IS NULL` (anti-join) to find "available" products was therefore **incorrect**, as it would filter out a product as soon as the first offering was created, preventing the creation of variants.

**The Corrected and Final Architectural Solution:**
To support this business rule and enable a reusable `OfferingForm`, the system now follows a context-aware loading pattern. Instead of using a logically flawed anti-join, the UI's `load` function fetches the complete list of valid parent entities depending on the user's navigation context.

1.  **Supplier Context (`/suppliers/.../offerings/new`):**
    *   When a user creates an offering for a specific supplier, the UI must present a choice of all possible products.
    *   **Action:** The `load` function calls the API to fetch **all** `ProductDefinitions` that belong to the selected `ProductCategory`.
    *   **UI:** The `OfferingForm` renders a dropdown list of these products.

2.  **Product Context (`/categories/.../productdefinitions/.../offerings/new`):**
    *   When a user creates an offering for a specific product, the UI must present a choice of all possible suppliers.
    *   **Action:** The `load` function calls the new `categoryApi.loadSuppliersForCategory()` function to fetch **all** `Wholesalers` assigned to the `ProductCategory` of the current `ProductDefinition`.
    *   **UI:** The `OfferingForm` renders a dropdown list of these suppliers.

This corrected approach simplifies the client-side API, aligns perfectly with the business requirements, and removes complex, misuse-prone queries. The flexibility is now correctly placed in the data model and handled by a context-aware UI. This architectural decision was successfully enforced in the data layer by **removing the restrictive `UNIQUE INDEX`** from the `dbo.wholesaler_item_offerings` table, which previously prevented the creation of multiple offerings for the same product in direct conflict with this business rule.

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

Zod is the sole source of truth for the **shape** and **rules** of data throughout the system, on both the frontend and backend. The schemas defined in `src/lib/domain/domainTypes.ts` are used directly in API endpoints for robust server-side validation.

#### **Server-Side Validation in API Endpoints**

Instead of a custom validator, each API endpoint imports the required Zod schema directly and applies schema methods to adapt it for the specific use case. This pattern is explicit, type-safe, and avoids unnecessary abstractions.

**Create Pattern (`POST /api/.../new`):**
The `...ForCreateSchema` variant is used, which omits server-generated fields (like IDs and timestamps).

```typescript
// In: /api/suppliers/new/+server.ts
import { WholesalerForCreateSchema } from '$lib/domain/domainTypes';
import { validateEntity } from '$lib/domain/domainTypes'; // Or adapter

const validation = validateEntity(WholesalerForCreateSchema, requestData);
```

**Update Pattern (`PUT /api/.../[id]`):**
The base schema is modified inline with `.omit()` and then `.partial()`. The `.partial()` method makes all fields optional, which is perfect for PATCH/PUT requests where only the changed data is sent.

```typescript
// In: /api/suppliers/[id]/+server.ts
import { WholesalerSchema } from '$lib/domain/domainTypes';
import { validateEntity } from '$lib/domain/domainTypes'; // Or adapter

const WholesalerForUpdateSchema = WholesalerSchema.omit({ wholesaler_id: true, created_at: true }).partial();
const validation = validateEntity(WholesalerForUpdateSchema, requestData);
```

#### **Status: Fully Migrated**

Server-side validation has been fully migrated to this direct Zod approach. The old validation logic in `src/lib/server/validation/domainValidator.ts` is obsolete and **should be deleted**.

### Frontend Architecture: Domain-Driven Structure & Page Delegation
The frontend follows a **Domain-Driven file structure** combined with a **Page Delegation Pattern**. The core principle is **Co-Location**: All files related to a specific business domain are located in a single directory (`src/lib/domain/suppliers/`).

### Client-side deletion helpers 
To handle different deletion scenarios in a type-safe manner, the generic `cascadeDelete` helper has been refactored into two specialized functions:

*   **`cascadeDelete`**: Used for deleting **master data entities** (Suppliers, Categories, Offerings, Attributes). It takes an array of simple `ID`s and a `DeleteApiFunction` like `supplierApi.deleteSupplier`.

*   **`cascadeDeleteAssignments`**: Used exclusively for deleting **n:m assignments** (e.g., removing a category from a supplier). It takes an array of composite IDs (e.g., `{ parent1Id, parent2Id }`) and a `RemoveAssignmentApiFunction`.

Both helpers now correctly support the full dependency-checking workflow, including the `forceCascade` option, by calling a shared internal function that manages the user confirmation dialogs. This makes the UI component code cleaner, more predictable, and strictly typed.

- A SvelteKit **Route** (`src/routes/...`) acts as a simple "delegator". Its only job is to load data and render the corresponding page module from `src/lib/domain/...`.

### Frontend Form Architecture: The "Dumb Shell / Smart Parent" Pattern
To create reusable yet fully type-safe forms, the project uses this robust pattern.

#### The "Dumb" State Manager: `FormShell.svelte`
- A generic component that manages core form mechanics: tracking data, "dirty" state, submission, and validation lifecycle via Svelte 5 callback props.

#### The "Smart" Parent: `SupplierForm.svelte`
- A specific component that knows everything about a `Wholesaler`. It provides the domain-specific `validate` and `submit` functions to the `FormShell`.

#### Validation Strategy: Zod-Driven with HTML5 UX Enhancement

The form architecture leverages the strengths of Zod and native browser validation for a robust and performant user experience.

*   **Server-Side Zod Schemas as "Single Source of Truth":** The Zod schemas used in the API endpoints are the ultimate authority for data integrity.
*   **Standard Rules in HTML:** Simple validations (`required`, `minlength`, `pattern`, `type="email"`) are declared directly as attributes on the `<input>` elements. This enables instant, performant feedback from the browser.
*   **Styling via Pure CSS:** Visual feedback for invalid fields is handled exclusively by the CSS `:invalid` pseudo-class.
*   **"Smart Parent" for Complex UX Rules:** The "Smart Parent" component (e.g., `SupplierForm`) can optionally provide a `validate` function to check complex business rules (e.g., cross-field validation) *before submission* on the client. This serves to improve UX, not for data security.
*   **"Dumb Shell" as Orchestrator:** The `FormShell` uses the browser's `checkValidity()` and `reportValidity()` APIs to determine the final validation status before submission and to control UI feedback.

### Case Study: Context-Aware Reusable Forms (`OfferingForm`)
The `OfferingForm` is a prime example of the "Smart Parent / Dumb Shell" pattern applied to a complex, reusable component. It is designed to be used from two different navigation contexts: creating an offering for a specific supplier, or creating an offering for a specific product.

- **Context Detection:** The form receives a comprehensive `initialLoadedData` prop from its parent wrapper. It uses Svelte 5's `$derived` rune to determine its context from boolean flags within this data (e.g., `isSuppliersRoute`, `isCategoriesRoute`).
- **Conditional UI:** Based on the detected context, the form conditionally renders the appropriate UI. In the "Supplier Context", it displays a dropdown of available products. In the "Product Context", it displays a dropdown of available suppliers.
- **Intelligent State Preparation:** A `$derived.by` block prepares a consistent `initial` data object for the underlying `FormShell`. In "Create" mode, this object is pre-populated with the fixed context IDs (e.g., `supplier_id` or `product_def_id`) received from the props.
- **Contextual Submission Logic:** The `submitOffering` function contains the final piece of intelligence. In "Create" mode, it correctly assembles the final data payload for the API by combining the fixed context IDs with the IDs selected by the user in the dropdown.

This pattern makes the `OfferingForm` highly reusable and decouples it from the specific routes, while keeping all context-specific logic clearly organized within the component itself.

### Frontend Navigation Architecture: Context Conservation
The application employs a **"Context Conservation"** pattern to create an intuitive hierarchical browsing experience. The system remembers the deepest path the user has explored and reflects this state consistently across the `HierarchySidebar` and `Breadcrumb` components, only pruning the path when the user explicitly changes context on a higher level.

---

## Understanding Svelte's Reactivity in the SupplierBrowser App

Svelte's reactivity is understood on three distinct levels:

1.  **Architectural Reactivity (`load` Function):** SvelteKit's `load` function is the highest level of reactivity, triggered by navigation.
2.  **Global Reactivity (Svelte Stores):** For state shared across components, like `navigationState.ts`.
3.  **Component-Level Reactivity (Svelte 5 Runes):** Runes (`$state`, `$props`, `$derived`) make reactivity explicit and granular inside components. Svelte is a compiler; when state changes, it does not re-render the entire component. Instead, it generates highly-optimized code that **surgically updates only the affected DOM elements.**

#### Best Practice: Avoiding the Global `$page` Store in Components

Directly importing and using `import { page } from '$app/stores'` in reusable components is an anti-pattern in Svelte 5 and can be unreliable. It may lead to errors where `$page.url` is `undefined`, especially in deeply nested components.

**The Correct Svelte 5 Architecture:**

1.  The `load` function in `+page.ts` or `+layout.ts` is the only place that should access the `url`.
2.  Required URL data (like `url.pathname`) is explicitly returned as part of the `data` object from the `load` function.
3.  This data is received by the page component as a prop (`let { data } = $props()`) and passed down to child components as needed.

This (`load` -> `props` -> `props`) pattern is explicit, type-safe, and guarantees that all components receive the correct, up-to-date data.

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