Absolut. Das ist ein entscheidender Punkt, um die Qualität und Wartbarkeit des Projekts langfristig zu sichern. Die Architektur ist das "Was", die technischen Rahmenbedingungen sind das "Wie".

Ich werde einen neuen Abschnitt "Development Guidelines & Technical Framework" in das `README-Supplier-Browser.md` einfügen, der diese Regeln klar und unmissverständlich darlegt.

Hier ist die finale, vollständige Version des **`README-Supplier-Browser.md`**, inklusive des neuen Abschnitts.

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

The application has no complex client-side state stores for navigation. The entire UI state is derived directly from the URL's search parameters. This makes the application robust, bookmarkable, and shareable.

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

## Core Architecture Patterns (FINAL)

The application follows a strict, generic, and type-safe architecture. All generic types are defined in **`src/lib/api/types/common.ts`**.

### 1. The Universal API Response Envelope

All API endpoints return a JSON object following one of two structures: `ApiSuccessResponse<TData>` on success, or `ApiErrorResponse` on failure. This creates a predictable API.

### 2. The API Endpoint Strategy (Entity vs. Query)

The backend is divided into two clear types of endpoints to ensure security and separation of concerns.

-   **A. Secure Entity Endpoints (e.g., `/api/suppliers`, `/api/categories`)**: These are responsible for the master data (CRUD) of a single entity. The client sends a `QueryRequest` but **omits the `from` field**, which the server securely injects to prevent unauthorized table access.

-   **B. The Generic Query Endpoint (`/api/query`)**: This is the workhorse for all **complex, relational queries** (1:n, n:m). It accepts two types of request bodies:
    1.  **`QueryRequest`**: For simple, direct queries where the client specifies the `from` table, which is validated against a server-side whitelist.
    2.  **`PredefinedQueryRequest`**: The primary method for complex JOINs. The client specifies a `namedQuery` (e.g., `'supplier_categories'`), and the server uses a secure, predefined SQL template from `queryConfig.ts`, applying only the client's safe `where`, `select`, and `orderBy` clauses.

### 3. The Client-Side Fetch Strategy

The client uses two different fetch wrappers from `lib/api/client/common.ts`:

-   **`apiFetch<TData>()`**: For standard calls expecting success. Throws a structured `ApiError` on any failure.
-   **`apiFetchUnion<TUnion>()`**: For calls with expected error states (e.g., delete conflicts). It **returns** the full response union (`ApiSuccessResponse | ApiErrorResponse`), allowing the UI to use type guards like `isDeleteConflict` to handle the different outcomes.

---

## Development Guidelines & Technical Framework

Adherence to these technical standards is mandatory to maintain code quality, security, and maintainability.

### 1. TypeScript Strictness is Non-Negotiable

The project is configured with TypeScript's strictest settings (`"strict": true`, `"noImplicitAny": true`, `"exactOptionalPropertyTypes": true`).

-   **The `any` type is forbidden.** The ESLint rule `@typescript-eslint/no-explicit-any` is set to `warn` and must be treated as an error. Using `any` defeats the purpose of TypeScript and introduces potential runtime errors. Use `unknown` for values whose type is truly unknown and perform type-safe checks.

### 2. ESLint is the Gatekeeper

All code must be ESLint-compliant before merging. Use the provided scripts to check and fix your code:

-   `npm run lint`: Checks for any style or type errors.
-   `npm run lint:fix`: Attempts to automatically fix any issues.

### 3. Svelte 5 Patterns are Mandatory

This project is built on Svelte 5 and leverages its new features for cleaner, more efficient code.

-   **Use Runes for Reactivity**: All component-level state must use Runes (`$state`, `$derived`). Avoid `let` for reactive variables.
-   **Use Typed Props**: All components must use the `$props` rune with an explicit type definition for their props:
    ```typescript
    const { rows = [] } = $props<{ rows: MyType[] }>();
    ```

### 4. API and Type Consistency is Critical

-   **One Source of Truth**: All API response and request types are derived from the generic definitions in **`src/lib/api/types/common.ts`**. Do not create new, one-off interfaces for API responses.
-   **Type-Check Before Returning**: On the server, all API endpoints **must** explicitly type their response variable before returning it. This acts as a final type-check to ensure compliance with the common types.
    ```typescript
    // ✅ DO THIS
    const response: ApiSuccessResponse<{ supplier: Wholesaler }> = { /* ... */ };
    return json(response);

    // ❌ AVOID THIS
    return json({ success: true, /* ... */ }); // No type checking!
    ```

### 5. Security is Paramount

-   **Never Trust the Client**: The client is never allowed to dictate the table for primary entity queries. Always use the **Secure Entity Endpoint** pattern where the server enforces the `from` clause.

---

## Implementation Status & Next Steps

The core architecture (`types/common.ts`, `client/common.ts`) is now finalized. The existing codebase must be refactored to align with this architecture.

### 🔄 Priority 1: Create/Refactor API Endpoints (`/routes/api/`)

1.  **Create `/api/query/+server.ts`**: Implement the new generic query endpoint to handle both `QueryRequest` and `PredefinedQueryRequest` bodies.
2.  **Refactor `/api/suppliers/...` & `/api/categories/...`**: Update all entity endpoints to use the correct `ApiSuccessResponse`/`ApiErrorResponse` types and the secure entity pattern (server-injected `from`).
3.  **Refactor `/api/supplier-categories/+server.ts`**: Update this assignment endpoint to use the generic `AssignmentApiResponse` and `DeleteApiResponse` types.

### 🔄 Priority 2: Refactor API Clients (`/lib/api/client/`)

1.  **`lib/api/client/supplier.ts`**:
    -   Update `loadSuppliers` to call `/api/suppliers` using `createQueryBody`.
    -   Update `loadSupplierCategories` (the n:m query) to call the new `/api/query` endpoint with a `PredefinedQueryRequest`.
    -   Update `deleteSupplier` to use `apiFetchUnion`.
2.  **`lib/api/client/category.ts`**:
    -   Update `getAvailableCategoriesForSupplier` to call `/api/query` with a standard `QueryRequest`.
    -   Update `removeCategoryFromSupplier` to use `apiFetchUnion`.

### 🔄 Priority 3: Refactor UI (`/routes/supplierbrowser/+page.svelte`)

1.  **Update Delete Handlers**: Modify the delete logic to correctly handle the `DeleteApiResponse` union. Use the `isDeleteConflict` type guard to check the response and trigger the cascade confirmation dialog.
2.  **Add Error Handling**: Wrap all data-loading calls in `try/catch` blocks to gracefully handle errors thrown by `apiFetch`.