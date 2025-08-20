# Project Summary: A Data Management Web Application

## **1. Core Objective**

The goal is to build a web application for managing business data, specifically "Suppliers" (Wholesalers) and their related information. The application needs to handle thousands of records efficiently, providing a fast user experience for viewing, creating, and editing data. The architecture must be robust, maintainable, and avoid unnecessary database load.

## **2. Technology Stack & Key Libraries**

*   **Framework:** SvelteKit
*   **Language:** TypeScript
*   **Database:** Microsoft SQL Server (MSSQL)
*   **Styling:** Global CSS with CSS Variables (`src/app.css`) and component-scoped styles.
*   **Key Libraries:**
    *   `mssql`: The Node.js driver for connecting to the SQL Server.
    *   `uuid`: For generating unique transaction keys to ensure multi-tab safety.
    *   `lodash-es`: For utility functions like `debounce` to improve UX in search fields.

## **3. Core Architectural Decisions & Patterns**

1.  **Generic Query API (`/api/query`):** Instead of creating dedicated API endpoints for every data request, we have a single, powerful, and secure generic endpoint. It accepts a JSON `QueryPayload` object that describes the desired query (`select`, `from`, `where`, `orderBy`). This keeps the backend DRY (Don't Repeat Yourself) and flexible.
2.  **Universal `load` Function (`+page.ts`):** The main supplier list page (`/suppliers`) uses a universal `load` function. This function runs on the server for the initial page load (SSR) and in the browser for subsequent client-side navigation. This is the central point for defining the data requirements of the page.
3.  **URL-Driven State:** The state of the supplier list (filtering, sorting, pagination) is stored directly in the URL's search parameters (e.g., `/suppliers?filter=ACME&sort=name`). This makes the application state bookmarkable, shareable, and robust.
4.  **"Create, Redirect, and Hydrate" Pattern:** To create new suppliers without re-fetching the entire list from the database, we use a dedicated `/suppliers/new` page.
    *   The `create` action on this page saves the new supplier to the DB.
    *   It then stores the newly created record in a short-lived, unique cookie.
    *   It redirects the user back to the `/suppliers` list page with a unique key in the URL.
    *   The list page's client-side script (`onMount`) checks for this key, "consumes" the data from the cookie, and dynamically injects the new record into the displayed list. This is performant and multi-tab safe.
5.  **Reusable, "Dumb" Components:** A generic `Datagrid.svelte` component is used to display data. It is purely presentational; it receives rows and column definitions as props and emits events (like `onsort`, `ondelete`), but has no knowledge of where the data comes from.

## **4. Current File Structure & Key Files**

```
src/
├── app.css              # Global styles (typography, colors, etc.)
├── lib/
│   ├── clientAndBack/
│   │   └── columnDefinitions.ts # TypeScript interfaces for column definitions (ColumnDefinition, ColumnDefinitionInclDB)
│   ├── components/
│   │   └── Datagrid.svelte      # The reusable, sortable, scrollable datagrid component with delete functionality
│   ├── server/
│   │   ├── db.ts                # Establishes and exports the MSSQL database connection pool
│   │   └── queryBuilder.ts      # Securely builds parameterized SQL from a QueryPayload object
│   └── stores/
│       └── notifications.ts   # A global Svelte store for managing UI notifications (snackbars)
│
└── routes/
    ├── +layout.svelte       # Root layout, imports global CSS and the Snackbar component
    ├── api/
    │   └── query/
    │       └── +server.ts     # The generic API endpoint that uses the queryBuilder
    │
    └── suppliers/
        ├── +page.ts           # UNIVERSAL load function for the list page. Defines columns, reads URL, fetches data.
        ├── +page.svelte         # The supplier list UI. Manages filter/sort state by updating the URL.
        ├── +page.server.ts      # Server actions for delete operations with cascade support
        │
        ├── [id]/
        │   ├── +page.server.ts  # SERVER-ONLY logic for the detail page (load/edit/create actions)
        │   └── +page.svelte     # The unified UI for EDITING an existing supplier
        │
        └── new/
            ├── +page.server.ts  # SERVER-ONLY logic for the NEW page (create action)
            └── +page.svelte     # The UI form for CREATING a new supplier
```

## **5. Current Status & Functionality**

*   **Supplier List (`/suppliers`):**
    *   Displays a list of suppliers in a sortable, scrollable `Datagrid`.
    *   Data is loaded server-side for the initial view.
    *   Features a client-side filter input that dynamically re-queries the data via the `/api/query` endpoint without a full page reload.
    *   Sorting is also handled client-side by updating the URL and re-querying.
    *   Contains a link to `/suppliers/new`.
    *   **NEW: Delete functionality with cascade support**
*   **New Supplier Page (`/suppliers/new`):**
    *   Presents a form to create a new supplier.
    *   Upon submission, it saves the data via a server-side `action`.
    *   On success, it redirects back to the `/suppliers` list. The list page then intelligently adds the new record to the UI without re-fetching the entire list.
*   **Edit Supplier Page (`/suppliers/[id]`):**
    *   Loads and displays all data for a single, existing supplier.
    *   Allows editing and saving of master data.
    *   Includes a fully functional section for managing the n:m relationship to `product_categories`, including adding and removing categories.
    *   Correctly handles and displays user-friendly error messages (e.g., when trying to remove a category that is still in use).
*   **UI Notifications:** A global "snackbar" system is in place to provide feedback for successful actions or errors.

## **6. Recent Enhancements (Current Status)**

### **6.1 Svelte 5 Compatibility**
*   **Migrated from `createEventDispatcher` to callback props:** The Datagrid component now uses modern Svelte 5 patterns with `onsort` and `ondelete` callback props instead of custom events.
*   **Updated TypeScript signatures:** Event handlers now receive direct objects instead of CustomEvent wrappers.
*   **Enhanced type safety:** All components are fully typed for Svelte 5 compatibility.

### **6.2 Enhanced Delete Functionality**
*   **Dependency Detection:** The system automatically detects when a supplier has related data (categories, offerings, links, attributes) and prevents deletion.
*   **Cascade Delete Option:** When dependencies are found, users are offered a "Cascade Delete" option to remove all related data in a single transaction.
*   **Transaction Safety:** All delete operations use database transactions to ensure data consistency.
*   **Per-Supplier Delete State:** Each supplier row manages its own delete state, allowing multiple delete operations without UI blocking.

### **6.3 Robust Error Handling**
*   **String-based Error Detection:** Implemented a fallback system that can parse error messages even when JSON serialization fails.
*   **Smart Response Processing:** The system handles both structured JSON responses and serialized array formats from SvelteKit actions.
*   **Graceful Degradation:** Manual state updates serve as fallback when `invalidateAll()` fails or times out.

### **6.4 Database Schema Integration**
*   **Complete Dependency Mapping:** The delete system understands the full database schema hierarchy:
    ```
    dbo.wholesalers (ROOT)
    ├── dbo.wholesaler_categories
        ├── dbo.wholesaler_item_offerings  
            ├── dbo.wholesaler_offering_links
            └── dbo.wholesaler_offering_attributes
    ```
*   **Cascading Delete Order:** Dependencies are removed in the correct order to satisfy foreign key constraints.
*   **Comprehensive Dependency Checking:** The system checks all related tables before allowing deletion.

### **6.5 Enhanced User Experience**
*   **Smart Delete Workflow:**
    1. User clicks delete → Initial confirmation
    2. System checks dependencies → Shows specific dependency count
    3. If dependencies exist → Offers cascade delete with detailed warning
    4. If confirmed → Executes transactional cascade delete
    5. Success notification → Automatic UI update
*   **Visual Feedback:** Delete buttons show loading states and are disabled appropriately.
*   **Detailed Notifications:** Users receive specific feedback about what was deleted and any related data removed.

### **6.6 Technical Improvements**
*   **Manual State Management:** Implemented efficient client-side state updates to avoid server round-trips.
*   **Debug-Ready Architecture:** Comprehensive logging system for troubleshooting delete operations.
*   **Serialization Workarounds:** Robust handling of SvelteKit's complex object serialization patterns.

## **7. Known Issues & Workarounds**

*   **SvelteKit `invalidateAll()` Timeout:** In some environments, `invalidateAll()` may hang. The system automatically falls back to manual state updates.
*   **Response Serialization:** SvelteKit sometimes serializes complex objects in array format. The error handling includes parsers for both normal and array-serialized responses.

## **8. Architecture Benefits**

This architecture provides:
*   **Scalability:** The generic query API and reusable components support rapid feature development.
*   **Maintainability:** Clear separation of concerns and consistent patterns across the application.
*   **Performance:** Efficient state management and minimal database round-trips.
*   **User Experience:** Smooth interactions with real-time feedback and robust error handling.
*   **Data Integrity:** Transaction-based operations ensure database consistency.
*   **Type Safety:** Full TypeScript integration with modern Svelte 5 patterns.

The application successfully demonstrates modern web application patterns with SvelteKit, providing a robust foundation for business data management.
------------------------------------------------------------------------------------------------------------------------

# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
