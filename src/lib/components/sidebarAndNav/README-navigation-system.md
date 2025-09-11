# **Hierarchy Navigation System - Complete Documentation**

This document outlines the architecture of the hierarchical navigation system. Its core principle is the separation of the **Navigation Context** (the chain of specific entities a user has selected) from the **Active View** (the specific UI level the user is currently looking at). This allows for powerful "Context Preservation" during client-side navigation.

---

## **1. Core Concepts & Definitions**

1.  **URL / Route** - The address in the browser bar. It primarily determines the SvelteKit page component to be rendered and represents the user's **Active View**.

2.  **Navigation Context** - The application's "memory" of the specific entities the user has drilled down into. It is stored as a path of `RuntimeHierarchyTreeNode` objects in the `navigationState` store (`activeTree.paths`). **This context is preserved during sidebar navigation.**

3.  **Active View** - The specific hierarchy level the user intends to see. This is primarily determined by the URL path, but for sidebar navigation, it is explicitly signaled by the `activeViewKey` in the `navigationState` store.

4.  **Context Preservation** - The core feature. When a user navigates via the sidebar, the deep `NavigationContext` is kept, even if the URL becomes simpler. This ensures that all relevant parts of the hierarchy remain enabled.

5.  **Context Reset** - Occurs only when a user makes a new **Entity Selection** at the same or a higher level, overwriting the previous context from that point downwards.

6.  **Entity Selection** - A user action, typically clicking a row in a data grid, that selects a specific entity (e.g., "Supplier #3"). This action always updates the `NavigationContext`.

7.  **Sidebar Navigation** - A user action, clicking an item in the `HierarchySidebar`. This action changes the `Active View` but **preserves** the `NavigationContext`.

8.  **`defaultChild`** - A configuration property on a hierarchy node that specifies which child level should automatically become the `Active View` after an **Entity Selection**.

---

## **2. Complete Navigation Flow - A Practical Example**

This example demonstrates how the state changes during a typical user journey.

### **Initial State: User lands on the Suppliers List**
- **URL:** `/suppliers`
- **`navigationState` Context:** `paths: [suppliersNode]`
- **`navigationState` Active View Key:** `null`
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
- **UI Intent:** The `handleSidebarNavigation` function calls `setActiveViewKey('suppliers')`.
- **Navigation:** `goto('/suppliers')` is called. The URL is clean.
- **`load` Function Logic:**
    1. It sees the simple `/suppliers` URL (`pathParams` are empty).
    2. It reads the **preserved `NavigationContext`** from the `navigationState` store (`{supplierId: 3, categoryId: 5}`).
    3. It reconstructs the full `navigationPath`: `[suppliersNode(ID=3), categoriesNode(ID=5)]`.
    4. `updateDisabledStates` is called with this **full path**.
    5. It reads the `activeViewKey` ('suppliers') from the store to determine the active level.
- **Final State:**
    - **URL:** `/suppliers`
    - **`navigationState` Context:** **UNCHANGED** (`[suppliersNode(ID=3), categoriesNode(ID=5)]`).
    - **Sidebar Marked:** "Suppliers" (because `activeViewKey` had priority).
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
-   **Configuration (`hierarchyConfig.ts`):** Defines the static structure of the navigation tree using `createHierarchyNode`. This is the single source of truth for the hierarchy's shape, labels, and URL patterns (`href`).
-   **Runtime (`RuntimeHierarchyTree`):** During the `load` process, the static configuration is transformed into a runtime tree. This runtime version is enriched with dynamic data, such as `level` for indentation, `urlParamValue` from the current path, and the `disabled` state.

### **The "Brain": `+layout.ts` `load` function**
The `load` function is the central orchestrator. On every client-side navigation, it performs these critical steps:
1.  **Get Preserved Context:** It reads the current `navigationState` store to get the "memory" of the user's path (`preservedParams`).
2.  **Get URL Intent:** It parses the route parameters (e.g., `[supplierId]`) from the URL (`pathParams`).
3.  **Reconcile State:** It merges the preserved context with the URL parameters, giving priority to the URL parameters (`urlParams = { ...preservedParams, ...pathParams }`). This creates the definitive set of parameters for the current view.
4.  **Rebuild Hierarchy State:** It uses the merged `urlParams` to:
    - Reconstruct the full `navigationPath` using `buildNavigationPath()`.
    - Update the `disabled` states of the entire hierarchy via `updateDisabledStates()`.
5.  **Determine Active View:** It determines which sidebar item to mark as active by checking, in order of priority:
    1.  The `activeViewKey` in the store (set by a sidebar click).
    2.  If the URL is a `leaf` page.
    3.  The `defaultChild` of the last entity in the path.
    4.  The last entity in the path itself.

### **State Management: `navigationState.ts`**
-   **`paths`:** The array of `RuntimeHierarchyTreeNode` objects that represents the **Navigation Context**.
-   **`activeViewKey`:** A simple string that stores the key of the intended **Active View**, set by the UI just before navigation.
-   **`selectNode(node, newUrlParamValue)`:** The core state mutation function.
    -   If `newUrlParamValue` is provided (**Entity Selection**), it resets and rebuilds the `paths` context.
    -   If `newUrlParamValue` is `undefined` (**Sidebar Navigation**), it **does not change the `paths` context**, thus preserving it.
-   **`setActiveViewKey(key)`:** A simple mutator called from the UI to signal the next view.

### **UI Interaction: `+layout.svelte`**
-   The `handleSidebarNavigation` function is the "sender of intent".
-   On a click, it performs two actions:
    1.  **`setActiveViewKey(node.item.key)`:** It tells the `navigationState` which view the user wants to see next.
    2.  **`goto(href)`:** It triggers the navigation to a clean URL, relying on the `load` function to handle the context.

### **Configuration-Driven URLs: `hierarchyConfig.ts` & `hierarchyUtils.ts`**
-   Each navigable item in `hierarchyConfig.ts` has an `href` pattern (e.g., `/suppliers/[supplierId]`).
-   The `resolveHref(pattern, urlParams)` utility in `hierarchyUtils.ts` replaces the placeholders with values from the `urlParams` object. This makes the UI completely agnostic of the URL structure.

---

## **4. Critical Data Flow Summary**

#### **Flow 1: Entity Selection (e.g., clicking a Supplier in a grid)**
1.  **UI:** `goto('/suppliers/3')` is called.
2.  **`load` function:**
    - `preservedParams` is read from the store.
    - `pathParams` becomes `{ supplierId: 3 }`.
    - `urlParams` is merged: `{ ...preservedParams, supplierId: 3 }` (Context Reset happens here).
    - `navigationPath` is built from the new `urlParams`.
    - `determineActiveLevel` sees a new entity was selected and uses the `defaultChild` rule.
3.  **`navigationState`:** The `setActiveTreePath` function updates the `paths` context with the new, reset path.

#### **Flow 2: Sidebar Navigation (e.g., clicking "Suppliers" in the sidebar)**
1.  **UI:**
    - `setActiveViewKey('suppliers')` is called.
    - `goto('/suppliers')` is called.
2.  **`load` function:**
    - `preservedParams` is read from the store (contains the full, deep context).
    - `pathParams` is empty `{}`.
    - `urlParams` is merged, resulting in the full, preserved context.
    - `navigationPath` is rebuilt to its full, previous depth.
    - `updateDisabledStates` keeps all relevant items enabled.
    - `determineActiveLevel` sees `activeViewKey` is 'suppliers' and returns it immediately.
3.  **`navigationState`:** The `setActiveTreePath` function re-sets the state with the same full path, keeping the context consistent.