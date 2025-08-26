# Architectural Specification & Developer Guide: SupplierBrowser

This document serves as the **single source of truth** for the project's architecture. All future development **must** adhere to the patterns and principles defined herein.

## 1. The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### 1.1. The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Real Objects** (master data) and **Assignments** (relationship data) is critical.

-   **Level 1: Suppliers (Real Object)**
    -   **Entity**: `dbo.wholesalers`
    -   **Purpose**: The root of the hierarchy. Manages the master data of supplier entities.
    -   **API Pattern**: Standard REST (`GET [id]`, `POST /new`, `PUT [id]`, `DELETE [id]`).

-   **Level 2: Categories (Assignment)**
    -   **Entity**: `dbo.wholesaler_categories`
    -   **Purpose**: Manages the **n:m relationship** between a selected Supplier and a global `ProductCategory`. This level does not edit the categories themselves, but rather the *link* between a supplier and a category.
    -   **API Pattern**: Dedicated n:m assignment endpoints (`POST` and `DELETE` on `/api/supplier-categories`).

-   **Level 3: Offerings (Real Object)**
    -   **Entity**: `dbo.wholesaler_item_offerings`
    -   **Purpose**: Manages the master data of products offered by the selected Supplier *within* the selected Category.
    -   **API Pattern**: Standard REST.

-   **Level 4: Attributes (Assignment)**
    -   **Entity**: `dbo.wholesaler_offering_attributes`
    -   **Purpose**: Manages the **n:m relationship** between a selected Offering and a global `Attribute`, storing the specific `value` for that link.
    -   **API Pattern**: Dedicated n:m assignment endpoints.

-   **Level 5: Links (Real Object)**
    -   **Entity**: `dbo.wholesaler_offering_links`
    -   **Purpose**: Manages URL links that are directly associated with a selected Offering.
    -   **API Pattern**: Standard REST.

### 1.2. The User Experience: A URL-Driven Single-Page Application

The entire application exists on a single route (`/supplierbrowser`) and creates a seamless, app-like experience.

-   **URL-Driven State**: The UI is a direct, reactive reflection of the URL's search parameters (`level`, `supplierId`, `categoryId`, `offeringId`). We use Svelte 5 Runes (`$derived`) to listen to URL changes. This eliminates complex client-side state management.
-   **Hierarchical Sidebar**: A persistent sidebar (`HierarchySidebar.svelte`) is the main navigation. Its levels are dynamically enabled or disabled based on the current selections in the URL, creating a guided, foolproof workflow for the user.
-   **Dynamic Content Pane**: The main content area renders different grids and forms based on the current `level` in the URL, providing the correct context and actions for the user's position in the hierarchy.

---

## 2. The Architecture Deep Dive: From Type to Server

This section details the four pillars of our technical architecture.

### Pillar I: The Foundation - Generic API Types (`lib/api/types/common.ts`)

This file is the **heart of our type safety**. It defines the generic building blocks ("envelopes") for ALL API communication.

-   **Universal Response Envelope**: Every API response is either an `ApiSuccessResponse<TData>` or an `ApiErrorResponse`.
-   **Generic Request Envelopes**: `common.ts` defines the wrappers for our request bodies: `QueryRequest<T>`, `PredefinedQueryRequest`, `CreateRequest<T>`, and `UpdateRequest<TId, TData>`.
-   **Generic Operation Patterns**: It defines the full response unions for complex operations, like `DeleteApiResponse<T, D>`, and the type guards to handle them (`isDeleteConflict`).

### Pillar II: The Language - The Split Query Grammar (`lib/clientAndBack/queryGrammar.ts`)

This file defines the "language" for all queries by providing **two distinct, purpose-built payload types**:

-   **`QueryPayload<T>` (Strictly Generic):** Used for queries against a **single entity**. It is strictly typed to `keyof T`, providing **compile-time safety** against typos and invalid fields (e.g., `QueryPayload<Wholesaler>` will not allow `select: ['color']`).
-   **`JoinQueryPayload` (Flexibly Typed):** Used for **predefined JOIN queries**. Its fields are `string`, as the columns (`'w.name'`) do not belong to a single entity. Its safety is guaranteed by the server-side validation against `queryConfig.ts`.

### Pillar III: The Contract - The Self-Validating Query Config (`lib/clientAndBack/queryConfig.ts`)

This file is the central "contract" that validates itself against our domain models at compile time.

-   **`BaseTableConfig` Type**: Strictly maps a table name (e.g., `'dbo.wholesalers'`) to an array of keys of its domain type (`(keyof Wholesaler)[]`). **This makes it impossible to add a misspelled column like `'wholesaler_idxxxxx'` without a TypeScript error.**
-   **`PredefinedQueryConfig` Type**: Strictly maps a named query (e.g., `supplier_categories`) to an array of valid, auto-generated JOIN columns. **This makes it impossible to add an invalid JOIN column like `'woa.fake_column'` without a TypeScript error.**

### Pillar IV: The API Lifecycle - Endpoints & Patterns

This table summarizes the final implementation for all CRUD operations, reflecting the "Real Object vs. Assignment" logic.

| Operation | Method & URL | Request Body Type | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **Query List** | `POST /api/suppliers` | `QueryRequest<T>` | **Pragmatic Choice.** `POST` avoids `GET` URL length limits for complex filters. The endpoint is specific to the entity for security. |
| **Read Single** | `GET /api/suppliers/[id]` | *(none)* | **Pure REST.** Canonical way to fetch a resource by its unique identifier. |
| **Create** | `POST /api/suppliers/new` | `CreateRequest<T>` | **Pure REST.** Uses a special identifier (`new`). The request body *is* the new resource data, wrapped for consistency. |
| **Update** | `PUT /api/suppliers/[id]` | `UpdateRequest<TId, TData>`| **Pure REST.** The body contains the resource ID and the partial data for the update. |
| **Delete Single**| `DELETE /api/suppliers/[id]`| *(none)* | **Pure REST.** Resource identified by URL. Options (`cascade`) are passed via query parameters. |
| **Add n:m** | `POST /api/supplier-categories`| `AssignmentRequest` | **Pure REST.** `POST` creates a new *relationship*. The body contains the composite key. |
| **Remove n:m** | `DELETE /api/supplier-categories`| `RemoveAssignmentRequest`| **Pragmatic Choice.** A complex URL is avoided by passing the composite key in the body. |
| **Complex JOINs**| `POST /api/query` | `PredefinedQueryRequest` | **Secure & Explicit.** The client requests a `namedQuery`. The server uses a secure, predefined SQL template from `queryConfig.ts`. |

---

## 3. How to Use This Architecture: A Developer's Guide

### Example 1: Querying a Simple Entity (Full Type Safety)

To fetch active suppliers, the client function `loadSuppliers` constructs a **`QueryPayload<Wholesaler>`**.
```typescript
// This code lives in `lib/api/client/supplier.ts`
const query: QueryPayload<Wholesaler> = {
    select: ['wholesaler_id', 'name'], // Autocomplete for Wholesaler fields.
    // select: ['wholesaler_idxxxxx'], // <-- This would be an immediate TypeScript ERROR.
    where: { op: 'AND', conditions: [{ key: 'status', op: '=', val: 'active' }] }
};
// The function then sends this in a `QueryRequest<Wholesaler>` to `POST /api/suppliers`.
```

### Example 2: Executing a Complex JOIN Query

To fetch categories for a supplier, the client function `loadSupplierCategories` constructs a **`PredefinedQueryRequest`**.

```typescript
// This code lives in `lib/api/client/supplier.ts`
const request: PredefinedQueryRequest = {
    namedQuery: 'supplier_categories',
    payload: { // This is a `JoinQueryPayload`
        select: ['pc.name AS category_name', 'oc.offering_count'],
        // select: ['pc.naem'], // <-- This is NOT a TS error here, but will be caught
                                //     by the server, which validates it against `queryConfig.ts`.
        where: { op: 'AND', conditions: [{ key: 'w.wholesaler_id', op: '=', val: 123 }] }
    }
};
// The function sends this to the generic `/api/query` endpoint.
```

---

## 4. Next Steps: The Refactoring Plan

The architecture is now final. The following steps must be taken to align the codebase.

1.  **UNDERSTAND Files - Only use these for API calls**:
    -   `lib/clientAndBack/queryGrammar.ts` (Implement `QueryPayload<T>` and `JoinQueryPayload`)
    -   `lib/api/types/common.ts` (Implement all generic request/response envelopes)
    -   `lib/clientAndBack/queryConfig.ts` (Implement the self-validating configuration)

2.  **Refactor Server Endpoints (`/routes/api/`)**:
    -   **Restructure `/api/suppliers/`**: Implement the full CRUD lifecycle according to the table (`+server.ts` for list query, `[id]/+server.ts` for GET/PUT/DELETE, and `POST` on `/new` for create).
    -   **Create `/api/query/+server.ts`**: Implement the new generic query endpoint.
    -   **Refactor all endpoints** to use the correct `Api...Response` types, return structured JSON for handled errors, and implement comprehensive logging.

3.  **Refactor API Clients (`/lib/api/client/`)**:
    -   Create a new `createSupplier` function that calls `POST /api/suppliers/new`.
    -   Update `loadSuppliers` to call `POST /api/suppliers`.
    -   Update `loadSupplier` to call `GET /api/suppliers/[id]`.
    -   Update `loadSupplierCategories` to call the new `/api/query` endpoint.
    -   Update `deleteSupplier` to use `apiFetchUnion`.

4.  **Refactor the UI (`/routes/supplierbrowser/+page.svelte`)**:
    -   Update all event handlers to call the new client functions.
    -   Implement `try/catch` blocks for data loading to handle `ApiError` exceptions.
    -   Implement type guard logic (`if (isDeleteConflict(response))`) for delete operations to handle the cascade workflow.