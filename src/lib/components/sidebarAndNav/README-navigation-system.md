# **Hierarchy Navigation System - Complete Documentation**

This document outlines the architecture of the hierarchical navigation system. Its core principle is the separation of the **Navigation Context** (the chain of specific entities a user has selected) from the **Active View** (the specific UI level the user is currently looking at). This allows for powerful "Context Preservation" during client-side navigation.

---

## **1. Core Concepts & Definitions**

1.  **URL / Route** - The address in the browser bar. It primarily determines the SvelteKit page component to be rendered and represents the user's **Active View**.

2.  **Navigation Context** - The application's "memory" of the specific entities the user has drilled down into. This context is **managed per hierarchy tree**. It is stored as a path of `RuntimeHierarchyTreeNode` objects in the `navigationState` store. When the user switches between trees (e.g., from "Suppliers" to "Product Categories"), the context of the previous tree is preserved, allowing for seamless context restoration upon returning.

3.  **Active View** - The specific hierarchy entry the user intends to see, represented by a complete `RuntimeHierarchyTreeNode`. This is primarily determined by the URL, but for sidebar navigation, it is explicitly signaled by the `activeViewNode` in the `navigationState` store. Using the full node object instead of a simple key eliminates ambiguity when multiple trees share the same key names.

4.  **Context Preservation** - The core feature. When a user navigates via the sidebar, the deep `NavigationContext` is kept, even if the URL becomes simpler. This ensures that all relevant parts of the hierarchy remain enabled.

5.  **Context Reset** - Occurs only when a user makes a new **Entity Selection** at the same or a higher level, overwriting the previous context from that point downwards for the currently active tree.

6.  **Entity Selection** - A user action, typically clicking a row in a data grid, that selects a specific entity (e.g., "Supplier #3"). This action always updates the `NavigationContext`.

7.  **Sidebar Navigation** - A user action, clicking an item in the `HierarchySidebar`. This action changes the `Active View` but **preserves** the `NavigationContext`.

8.  **`defaultChild`** - A configuration property on a hierarchy node that specifies which child level should automatically become the `Active View` after an **Entity Selection**.

---

## **2. Complete Navigation Flow - A Practical Example**

This example demonstrates how the state changes during a typical user journey within a single hierarchy tree (e.g., 'suppliers').

### **Initial State: User lands on the Suppliers List**
- **URL:** `/suppliers`
- **`navigationState` Context:** `paths: [suppliersNode]`
- **`navigationState` Active View Node:** `null`
- **Sidebar Marked:** "Suppliers"
- **Enabled Tree:** Only "Suppliers" is enabled.

### **Step 1: User selects "Supplier C" (Entity Selection)**
- **Action:** User clicks on "Supplier C" (ID = 3) in the data grid.
- **URL:** Changes to `/suppliers/3`.
- **`navigationState` Context:** The `selectNode` function is called with the new ID, resetting the context to `paths: [suppliersNode(ID=3)]`.
- **Sidebar Marked:** "Categories". This is determined by the `load` function, which sees an entity was selected and uses the `defaultChild` of the "Suppliers" node.
- **Enabled Tree:** "Suppliers", "Categories", "Addresses".

### **Step 2: User selects "Bracelets" (Deeper Entity Selection)**
- **Action:** User is on the Supplier Detail Page and clicks on the category "Bracelets" (ID = 5).
- **URL:** Changes to `/suppliers/3/categories/5`.
- **`navigationState` Context:** The context is extended: `paths: [suppliersNode(ID=3), categoriesNode(ID=5)]`.
- **Sidebar Marked:** "Offerings" (the `defaultChild` of "Categories").
- **Enabled Tree:** All levels down to "Offerings" and its children are enabled.

### **Step 3: User clicks "Suppliers" in the Sidebar (Back-Navigation)**
- **Action:** While viewing the "Offerings" for "Bracelets", the user clicks the top-level "Suppliers" item in the sidebar.
- **UI Intent:** The `handleSidebarNavigation` function calls `setActiveViewNode` with the `suppliersNode` object.
- **Navigation:** `goto('/suppliers')` is called. The URL is clean.
- **`load` Function Logic:**
    1. It sees the simple `/suppliers` URL and determines the 'suppliers' tree is the active one.
    2. It reads the **preserved `NavigationContext`** from the `navigationState` store (`{supplierId: 3, categoryId: 5}`).
    3. It reconstructs the full `navigationPath`: `[suppliersNode(ID=3), categoriesNode(ID=5)]`.
    4. `updateDisabledStates` is called with this **full path**, keeping deeper levels enabled.
    5. It reads the `activeViewNode` from the store to determine the active level.
- **Final State:**
    - **URL:** `/suppliers`
    - **`navigationState` Context:** **UNCHANGED** (`[suppliersNode(ID=3), categoriesNode(ID=5)]`).
    - **Sidebar Marked:** "Suppliers" (because `activeViewNode` had priority).
    - **Enabled Tree:** "Suppliers" and "Categories" remain enabled because the context is preserved.

### **Step 4: User selects a different Supplier (Context Reset)**
- **Action:** While viewing the supplier list (but with the context of Supplier #3 preserved), the user clicks on "Supplier F" (ID = 7).
- **URL:** Changes to `/suppliers/7`.
- **`navigationState` Context:** `selectNode` is called with a new ID at level 0. It performs a **Context Reset**. The new context is `paths: [suppliersNode(ID=7)]`.
- **Sidebar Marked:** "Categories" (the `defaultChild` of "Suppliers").

---

## **3. Architecture & Implementation Details**

### **Type-Safe Hierarchy System (`HierarchySidebar.types.ts`)**
The foundation of the system is a set of generic TypeScript types that enforce correctness at compile time. This prevents common errors like referencing non-existent children.
```typescript
// Generic types with compile-time validation for defaultChild
export type HierarchyTreeNode<
  K extends string,
  C extends readonly HierarchyTreeNode<any, any>[] | undefined
> = {
  item: HierarchyItem<K>;
  defaultChild?: C extends readonly any[] ? C[number]['item']['key'] : never;
  children?: C;
};

// Helper function for strict type inference
export const createHierarchyNode = <
  const K extends string,
  const C extends readonly HierarchyTreeNode<any, any>[] | undefined
>(node: { /* ... */ }): HierarchyTreeNode<K, C> => node;
```
This ensures that a `defaultChild` value must be a key of one of the nodes in the `children` array.

### **Configuration vs. Runtime Separation**
-   **Configuration (`navHierarchyConfig.ts`):** Defines the static structure of the navigation trees using `createHierarchyNode`. This is the single source of truth for the hierarchies' shape, labels, and URL patterns (`href`).
-   **Runtime (`RuntimeHierarchyTree`):** During the `load` process, the static configuration is transformed into a runtime tree. This runtime version is enriched with dynamic data, such as `level` for indentation, `urlParamValue` from the current path, and the `disabled` state.

### **The "Brain": `+layout.ts` `load` function**
The `load` function is the central orchestrator. On every client-side navigation, it performs these critical steps:

1.  **Determine Active Tree:** This is the crucial first step for multi-tree support. The function inspects the first segment of the URL pathname (e.g., `/suppliers` -> `suppliers`). It then dynamically selects the corresponding `RuntimeHierarchyTree` as the active context for this navigation. For the root URL (`/`), a predefined fallback tree (e.g., 'suppliers') is used. This logic ensures that direct navigation and reloads work correctly for any configured hierarchy.

2.  **Get Preserved Context:** It reads the current `navigationState` store to get the "memory" of the user's path (`preservedParams`) for the *currently active tree*.

3.  **Get URL Intent:** It parses the route parameters (e.g., `[supplierId]`) from the URL (`pathParams`).

4.  **Reconcile State:** It merges the preserved context with the URL parameters, giving priority to the URL parameters. This creates the definitive set of parameters for the current view and enables both **Context Preservation** and **Context Reset**.

5.  **Rebuild Hierarchy State:** It uses the merged `urlParams` and the **dynamically determined `activeTree`** to:
    - Reconstruct the full `navigationPath` using `buildNavContextPathFromUrl()`.
    - Update the `disabled` states of the entire hierarchy via `updateDisabledStates()`.

6.  **Determine Active View Node:** It determines which sidebar item to mark as active by calling `determineActiveNode()`. This function returns the complete `RuntimeHierarchyTreeNode` based on a priority system (explicit sidebar click, leaf page, `defaultChild`, etc.).

7.  **Return Data:** It returns a payload containing the fully contextualized hierarchy and the definitive `activeNode` object for the UI to render.

### **State Management: `navigationState.ts`**
The state management has been refactored for greater robustness and clarity in a multi-tree environment.

-   **`activeViewNode: RuntimeHierarchyTreeNode | null`**: The store no longer holds a simple `activeViewKey` string. It now stores the complete `activeViewNode` object. This was a critical change to prevent ambiguity where different trees might share the same key (e.g., a 'categories' key in both the suppliers and products hierarchy). The UI now uses this unambiguous object reference for highlighting.
-   **`setActiveViewNode(node)`**: This is the corresponding mutator function, called from the UI (e.g., `+layout.svelte`) to signal the user's intent to navigate to a specific node.

### **UI Interaction: `+layout.svelte`**
-   The `handleSidebarNavigation` function is the "sender of intent".
-   On a click, it performs two actions:
    1.  **`setActiveViewNode(node)`:** It tells the `navigationState` which view the user wants to see next by passing the entire node object.
    2.  **`goto(href)`:** It triggers the navigation to a clean URL, relying on the `load` function to handle the context.

### **Centralized Logic: `hierarchyUtils.ts`**
To adhere to the DRY (Don't Repeat Yourself) principle, all generic logic for manipulating and querying the hierarchy trees has been consolidated into `hierarchyUtils.ts`. This includes:
-   **Tree Traversal and Searching:** Functions like `findNodeByKeyInHierarchies` provide a single, reliable way to search across all configured trees, preventing logic duplication.
-   **State Building:** Core functions for building the navigation context (`buildNavContextPathFromUrl`) and updating UI states (`updateDisabledStates`) reside here.

The main `load` function in `+layout.ts` acts as a consumer of these utilities, keeping its own logic focused on orchestration.

### **Configuration-Driven URLs: `navHierarchyConfig.ts` & `hierarchyUtils.ts`**
-   Each navigable item in `navHierarchyConfig.ts` has an `href` pattern (e.g., `/suppliers/[supplierId]`).
-   The `resolveHref(pattern, urlParams)` utility in `hierarchyUtils.ts` replaces the placeholders with values from the `urlParams` object. This makes the UI completely agnostic of the URL structure.

---

## **4. Critical Data Flow Summary**

#### **Flow 1: Entity Selection (e.g., clicking a Supplier in a grid)**
1.  **UI:** `goto('/suppliers/3')` is called.
2.  **`load` function:**
    - It identifies the 'suppliers' tree from the URL.
    - `preservedParams` is read from the store for the suppliers tree.
    - `pathParams` becomes `{ supplierId: 3 }`.
    - `urlParams` is merged: `{ ...preservedParams, supplierId: 3 }` (Context Reset happens here).
    - `navigationPath` is built from the new `urlParams`.
    - `determineActiveNode` sees a new entity was selected and uses the `defaultChild` rule to return the 'Categories' node.
3.  **`navigationState`:** The `setActiveTreePath` function updates the `paths` context with the new, reset path for the suppliers tree.

#### **Flow 2: Sidebar Navigation (e.g., clicking "Suppliers" in the sidebar)**
1.  **UI:**
    - `setActiveViewNode(suppliersNode)` is called.
    - `goto('/suppliers')` is called.
2.  **`load` function:**
    - It identifies the 'suppliers' tree from the URL.
    - `preservedParams` is read from the store (contains the full, deep context).
    - `pathParams` is empty `{}`.
    - `urlParams` is merged, resulting in the full, preserved context.
    - `navigationPath` is rebuilt to its full, previous depth.
    - `updateDisabledStates` keeps all relevant items enabled.
    - `determineActiveNode` sees `activeViewNode` is set and returns it immediately.
3.  **`navigationState`:** The `setActiveTreePath` function re-sets the state with the same full path, keeping the context consistent.