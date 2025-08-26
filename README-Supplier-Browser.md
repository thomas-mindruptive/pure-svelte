Verstanden. Ich aktualisiere jetzt das `README-Supplier-Browser.md` mit der finalen, korrigierten Tabelle, die den "Add n:m"-Fall explizit enthält.

Hier ist der neue, vollständige Inhalt der Datei.

---

# SupplierBrowser - 5-Level Hierarchical Data Management

**URL-driven, single-page navigation for Supplier/Wholesaler data management with a secure, type-safe, and generic API architecture.**

## What This Is

A hierarchical data management tool built as a Single-Page Application (SPA) that operates on five distinct levels of data relationships:

1.  **Level 1: Suppliers** - Master data for `Wholesaler` entities.
2.  **Level 2: Categories** - Manages the **n:m assignment** between a selected Supplier and global `Product Categories`.
3.  **Level 3: Offerings** - Master data for `WholesalerItemOffering` entities within a selected Supplier/Category context.
4.  **Level 4: Attributes** - Manages the **n:m assignment** of key-value `Attributes` to a selected Offering.
5.  **Level 5: Links** - Master data for external URLs (`Links`) related to a selected Offering.

---

## Application Flow & UI/UX

The entire user experience is contained within the single route `/supplierbrowser` and is controlled by two primary concepts: URL-driven state and a dependent sidebar navigation.

### 1. URL-Driven State

The application has no complex client-side state stores for navigation. The entire UI state is derived directly from the URL's search parameters using Svelte 5 Runes (`$derived`). This makes the application robust, bookmarkable, and shareable.

**Example URL:**
`/supplierbrowser?level=categories&supplierId=123&categoryId=456`

-   `level`: The currently active navigation level (`wholesalers` | `categories` | `offerings` | `attributes` | `links`). This determines which components are visible in the main content area.
-   `supplierId`: The ID of the currently selected supplier.
-   `categoryId`: The ID of the currently selected category assignment.
-   `offeringId`: The ID of the currently selected offering.

### 2. Hierarchical Sidebar Navigation

A persistent sidebar (`HierarchySidebar.svelte`) is the primary navigation control. Its levels become enabled or disabled based on selections made in the hierarchy, providing clear user guidance.

-   **Suppliers**: Always enabled. Clicking navigates to `level=wholesalers` and clears selections.
-   **Categories**: **Enabled only when a `supplierId` is present in the URL.** Clicking navigates to `level=categories`.
-   **Offerings**: **Enabled only when both `supplierId` and `categoryId` are present.** Clicking navigates to `level=offerings`.
-   **Attributes & Links**: **Enabled only when an `offeringId` is present.**

The sidebar also displays a live count of items at each level for the current context (e.g., the number of categories assigned to the *selected* supplier).

### 3. Main Content Pane

The main content area dynamically renders components based on the `level` parameter in the URL.

-   **`level=wholesalers`**: Displays a single `SupplierGrid` component listing all suppliers. Clicking a supplier sets the `supplierId` in the URL and navigates to the `categories` level.
-   **`level=categories`**: Displays a master-detail view:
    -   A `SupplierForm` to edit the selected supplier's master data.
    -   A `CategoryAssignment` component to add new categories.
    -   A `CategoryGrid` showing all categories currently assigned to this supplier.
-   **`level=offerings`**: Displays a `OfferingGrid` with all products for the selected supplier/category pair.
-   **Levels 4 & 5**: Will display `AttributeGrid` and `LinkGrid` respectively.

---

## API Design Philosophy & CRUD Patterns (FINAL)

This section details the final, strict architecture for all API interactions. Adherence to these patterns is mandatory. All generic request and response types are defined in **`src/lib/api/types/common.ts`**.

### 1. The Universal API Response Envelope

All API endpoints return a JSON object following one of two structures: `ApiSuccessResponse<TData>` on success, or `ApiErrorResponse` on failure. This creates a predictable API where the client can always expect a `.success` property. Handled, predictable errors (like validation or conflicts) are returned as a structured `ApiErrorResponse` with a `4xx` status code, not thrown as server exceptions.

### 2. The API Request & Endpoint Strategy

To balance REST principles with the practical needs of a complex frontend, we use a clear and explicit set of patterns for all CRUD operations.

| Operation | Method & URL | Request Body Type | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **Query List** | `POST /api/suppliers` | `QueryRequest<T>` | **Pragmatic Choice.** A pure REST `GET` with complex filter objects in the URL is impractical due to URL length limits and encoding issues. Using `POST` with a structured JSON body is a robust, widely-accepted industry pattern (used by GraphQL, Elasticsearch, etc.). |
| **Read Single** | `GET /api/suppliers/[id]` | *(none)* | **Pure REST.** The canonical way to fetch a resource by its unique identifier. The request is simple, idempotent, and cacheable. |
| **Create** | `POST /api/suppliers/new` | `Partial<Omit<T, 'id'>>` | **Pure REST.** Uses a special identifier (`new`) to distinguish the create action. The request body *is* the new resource data. A `CreateRequest<T>` wrapper was considered but deemed unnecessary overhead for this simple case. |
| **Update** | `PUT /api/suppliers/[id]` | `Partial<T>` | **Pure REST.** The request body contains only the fields to be changed (a partial representation). `PUT` is used as the primary verb for full or partial updates. |
| **Delete Single**| `DELETE /api/suppliers/[id]`| *(none)* | **Pure REST.** The resource to be deleted is identified solely by the URL. Options like `cascade` are passed as URL query parameters (`?cascade=true`), as a `DELETE` request should not have a body. |
| **Add n:m** | `POST /api/supplier-categories`| `AssignmentRequest` | **Pure REST.** `POST` is the correct verb to create a new *relationship* in a collection of relationships. The body contains the composite key (`parentId`, `childId`) of the two entities to be linked. |
| **Remove n:m** | `DELETE /api/supplier-categories`| `RemoveAssignmentRequest`| **Pragmatic Choice.** A pure REST approach would require a complex URL like `/api/suppliers/123/categories/456`. Passing the composite key (`parentId`, `childId`) in the body of a `DELETE` request is a simpler, cleaner solution for this specific n:m use case. |

### 3. Client-Side Fetch Strategy

The client uses two different fetch wrappers from `lib/api/client/common.ts`:

-   **`apiFetch<TData>()`**: The default for most calls (`GET`, `POST`, `PUT`). It expects a successful response and returns the unwrapped `.data` payload. It throws a structured `ApiError` on any non-2xx response, which must be handled in a `try/catch` block in the UI.
-   **`apiFetchUnion<TUnion>()`**: Used **only** for operations with *expected, structured failure states*, such as `DELETE`. It returns the full response object (success or error), allowing the UI to use type guards like `isDeleteConflict` to handle the different outcomes without a `try/catch`.

---

## Development Guidelines & Technical Framework

Adherence to these technical standards is mandatory to maintain code quality, security, and maintainability.

### 1. TypeScript Strictness is Non-Negotiable

The project is configured with TypeScript's strictest settings (`"strict": true`, `"noImplicitAny": true`).

-   **The `any` type is forbidden.** The ESLint rule `@typescript-eslint/no-explicit-any` is set to `warn` and must be treated as an error. Using `any` defeats the purpose of TypeScript. Use `unknown` for values whose type is truly unknown and perform type-safe checks.

### 2. ESLint is the Gatekeeper

All code must be ESLint-compliant before merging. Use the provided scripts to check and fix your code:

-   `npm run lint`: Checks for any style or type errors.
-   `npm run lint:fix`: Attempts to automatically fix any issues.

### 3. Svelte 5 Patterns are Mandatory

-   **Use Runes for Reactivity**: All component-level state must use Runes (`$state`, `$derived`).
-   **Use Typed Props**: All components must use the `$props` rune with an explicit type definition:
    ```typescript
    const { rows = [] } = $props<{ rows: MyType[] }>();
    ```

### 4. API and Type Consistency is Critical

-   **One Source of Truth**: All API types are derived from the generic definitions in **`src/lib/api/types/common.ts`**. Do not create new, one-off interfaces for API responses.
-   **Type-Check Before Returning**: On the server, all API endpoints **must** explicitly type their response variable before returning it. This acts as a final type-check to ensure compliance.
    ```typescript
    // ✅ DO THIS
    const response: ApiSuccessResponse<{ supplier: Wholesaler }> = { /* ... */ };
    return json(response);

    // ❌ AVOID THIS
    return json({ success: true, /* ... */ }); // No type checking!
    ```

---

## Implementation Status & Next Steps

The core architecture is now finalized. The existing codebase must be refactored to align with these clear patterns.

### 🔄 Priority 1: Refactor Server Endpoints (`/routes/api/`)

1.  **Restructure `/api/suppliers/`**:
    -   `+server.ts` (`POST`): Must be updated to handle **list queries** only.
    -   `[id]/+server.ts` (`GET`): Must be added to handle **read single**.
    -   `[id]/+server.ts` (`POST`): Must be added to handle the **create** action when the `id` parameter is `"new"`.
    -   `[id]/+server.ts` (`PUT`, `DELETE`): Must handle **update** and **delete**.

2.  **Create `/api/query/+server.ts`**:
    -   Implement the new generic query endpoint to handle `PredefinedQueryRequest` bodies for complex JOINs.

3.  **Refactor all endpoints**:
    -   Ensure every endpoint returns the correct, typed `ApiSuccessResponse` or `ApiErrorResponse`.
    -   Implement the detailed logging pattern consistently.

### 🔄 Priority 2: Refactor API Clients (`/lib/api/client/`)

1.  **`lib/api/client/supplier.ts`**:
    -   Create a new `createSupplier` function that calls `POST /api/suppliers/new`.
    -   Update `loadSuppliers` to call `POST /api/suppliers`.
    -   Update `loadSupplier` to call `GET /api/suppliers/[id]`.
    -   Update `loadSupplierCategories` to call the new `/api/query` endpoint.
    -   Update `deleteSupplier` to use `apiFetchUnion`.

2.  **`lib/api/client/category.ts`**:
    -   Update `getAvailableCategoriesForSupplier` to call `/api/query`.
    -   Update all other functions to align with the new server responses.

### 🔄 Priority 3: Refactor UI (`/routes/supplierbrowser/+page.svelte`)

1.  **Update Event Handlers**: Connect UI actions to the new/updated client functions (e.g., call `createSupplier`).
2.  **Update Delete Logic**: Ensure the UI correctly handles the `DeleteApiResponse` union returned by `deleteSupplier` by using the `isDeleteConflict` type guard.
3.  **Add Error Handling**: Wrap all data-loading calls in `try/catch` blocks to gracefully handle errors now thrown by `apiFetch`.