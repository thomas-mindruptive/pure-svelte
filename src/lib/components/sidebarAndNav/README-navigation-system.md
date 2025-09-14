# **Hierarchy Navigation System - Complete Documentation**

### **Executive Summary**

This document specifies the architecture of the application's hierarchical navigation system. The system is designed to be robust, predictable, and maintainable.

Its core principle is that the **`url.pathname` is the definitive source of truth.** The system translates this URL path into a rich UI state, enabling advanced features like "Context Preservation," where a user's deep drill-down path is remembered even when navigating to parent pages.

This document serves as the architectural blueprint and the implementation guide for all related components.

---

## **Core Concepts & Definitions**

A precise understanding of these terms is critical for working with the navigation system.

*   **Navigation Tree (`HierarchyTree` and `RuntimeHierarchyTree`):** Represents the complete, hierarchical map of all possible navigation destinations. It is the single source of truth for the application's structure.

*   **TreeNode (`RuntimeHierarchyTreeNode`):** A node in the navigation tree. It consists of an `item` (holding navigation metadata like `key`, `href`, `label`) and its `children`. Nodes can be configured as visible (e.g., a sidebar link) or invisible (e.g., an "object" node representing a selected entity ID).

*   **URL / Route**: The address in the browser's address bar. The `url.pathname` (e.g., `/suppliers/3/categories`) is the primary, unambiguous input that drives the entire navigation state.

*   **Navigation Context (Primitive Path)**: The application's "memory" of the user's location, stored in the central `navigationState` store. It is a simple array of strings and numbers representing the deepest drill-down path (e.g., `['suppliers', 3, 'categories', 5]`). It is determined by the `reconcilePaths` function and is the data source for the Breadcrumbs and item enablement.

*   **Rich Node Path (`nodesOnPath`)**: A temporary, in-memory array of `RuntimeHierarchyTreeNode` objects, created by translating the **Navigation Context** against the hierarchy tree. It is the primary data structure consumed by the Breadcrumbs and the `updateDisabledStates` logic.

*   **Active View (`activeNode`)**: A pure **UI concept**. It is the **single** `RuntimeHierarchyTreeNode` that is marked as "current" in the user interface (e.g., highlighted in the sidebar, marked as active in the breadcrumbs). It is determined **exclusively from the current URL**, separate from the Navigation Context.

*   **`defaultChild`**: A configuration property on a node. It creates an architectural bridge between the logical hierarchy and the physical page implementation, allowing a URL that points to an invisible node to correctly highlight a visible child node in the UI.

*   **URL Params**: A key-value object passed from the `load` function to the UI components. It contains all URL parameters required to correctly resolve dynamic `href` patterns (e.g., `/suppliers/[supplierId]`). It is assembled by merging parameters from the deep **Navigation Context** with the parameters from the **current URL**, with the current URL always taking precedence.

## **Complete Navigation Flow - A Deeper Example**

This table shows how the state changes across multiple steps, illustrating Context Deepening, Preservation, and Reset.

| User Action | URL | **Primitive Path in `navState`** <br> *(The "memory" of the data context)* | **Rich Node Path (`nodesOnPath`)** <br> *(Used by Breadcrumbs & for enablement)* | **Active View (`activeNode`)** <br> *(The UI highlight, derived only from the URL)* |
| :--- | :--- | :--- | :--- | :--- |
| **1. Start:** Lands on suppliers list. | `/suppliers` | `['suppliers']` | `[suppliersNode]` | `suppliersNode` |
| **2. Selection (Deepening):** Clicks "Supplier C" (ID=3). | `/suppliers/3` | `['suppliers', 3]` <br>*(CONTEXT DEEPENING)* | `[suppliersNode, supplierNode(3)]` | `categoriesNode` **(due to `defaultChild` on invisible `supplierNode`)** |
| **3. Deeper Selection:** Clicks "Category X" (ID=5). | `/suppliers/3/categories/5` | `['suppliers', 3, 'categories', 5]` <br>*(CONTEXT DEEPENING)* | `[suppliersNode, supplierNode(3), categoriesNode, categoryNode(5)]` | `offeringsNode` **(due to `defaultChild` on invisible `categoryNode`)** |
| **4. Back-Navigation:** Clicks "Suppliers" in the breadcrumb. | `/suppliers` | `['suppliers', 3, 'categories', 5]` <br> **(CONTEXT IS PRESERVED!)** | `[suppliersNode, supplierNode(3), categoriesNode, categoryNode(5)]` | `suppliersNode` **(The highlight correctly follows the URL!)** |
| **5. Divergent Selection:** Clicks "Supplier Z" (ID=7). | `/suppliers/7` | `['suppliers', 7]` <br> **(CONTEXT IS RESET)** | `[suppliersNode, supplierNode(7)]` | `categoriesNode` **(due to `defaultChild` on invisible `supplierNode`)** |

---

## **The Crucial Separation: Context vs. Active Highlight**

The key to a robust and bug-free system is the strict separation of two distinct concepts:

### **1. The Context (The "Memory")**

*   **What it is:** The complete, deepest path the user has taken within a hierarchy.
*   **How it's determined:** By the `reconcilePaths` function, which compares the current URL with the previously stored state to enable **Context Preservation, Deepening, and Reset**.
*   **What it controls:**
    1.  **Breadcrumb Content:** The list of items shown in the breadcrumb bar, representing the user's full "journey."
    2.  **Sidebar Item Enablement:** The `updateDisabledStates` logic, which determines which deeper items remain clickable.

### **2. The Active Highlight (The "Focus")**

*   **What it is:** A pure UI concept answering the question: "Which **one** item in the sidebar and breadcrumbs should be visually marked as active right now?"
*   **How it's determined:** **Exclusively from the current URL** via the `determineActiveNode` function.
*   **What it controls:** The `active` prop passed to both the `HierarchySidebar` and `buildBreadcrumb` function. This ensures the highlight is always synchronized between components and consistent with the current page.

---

## **Architectural Pattern: Decoupling Logic from UI**

The navigation system is designed to decouple the **logical navigation hierarchy** from the **physical implementation of pages**. This gives developers the freedom to design the UI pragmatically (e.g., condensing multiple logical levels onto one page) without breaking the navigation logic.

### **Example 1: The "Condensed Page"**

*   **Scenario:** A user navigates to `/suppliers/3`. The rendered `SupplierDetailPage` contains both the supplier's details and the list of its categories.
*   **Logical Path:** `suppliers -> supplier -> categories`.
*   **Physical Implementation:** The Svelte route `/suppliers/3/categories` does not exist. The `href` for the "categories" node in the config points to `/suppliers/[supplierId]`.
*   **The `defaultChild` Bridge:** The URL `/suppliers/3` points to the **invisible** `supplier` node. Its configuration `defaultChild: 'categories'` tells the `determineActiveNode` function: "The page at this URL fulfills the purpose of showing categories, so highlight the `categories` node in the UI."

### **Example 2: The "Split Page" with Delegation**

*   **Scenario:** A user navigates to an offering. There is no single "detail page" but two equivalent, specific views: `Attributes` and `Links`.
*   **Logical Path:** `... -> offering -> attributes` OR `... -> offering -> links`.
*   **Physical Implementation:** There is no content page at `.../offerings/1`. Instead, two specific pages exist, and the `href` attributes in the config point directly to them. A route at `.../offerings/[offeringId]` serves only to delegate (redirect) to one of the children.
*   **The `defaultChild` Bridge:** The user always lands on a URL like `.../links` or `.../attributes`. The active node is determined directly by the URL (Rule #1 of `determineActiveNode`). The `defaultChild` on the invisible `offering` object is not used for highlighting in this case, but can inform the delegation logic.

---

## **Architecture & Implementation Details**

### **The `+layout.ts` `load` Function: Conceptual Flow**

The `load` function is the central orchestrator. It executes the following flow on every navigation:

1.  **Reconcile Context:** It determines the definitive **Navigation Context** (`definitivePrimitivePath`) using `reconcilePaths` and persists it to the store.
2.  **Resolve Context Path:** It translates the Navigation Context into a **Rich Node Path** (`nodesOnPath`).
3.  **Update UI State:** It updates the enablement of all sidebar items using `updateDisabledStates` based on the Rich Node Path.
4.  **Determine Active Node:** It determines the **Active Node** (`activeNode`) for UI highlighting by calling `determineActiveNode`, which uses **only the current URL**.
5.  **Fetch Data:** It performs API calls to fetch entity names (e.g., supplier name for an ID) needed for the Breadcrumbs, based on the Rich Node Path.
6.  **Assemble Final Data:** It builds the final `breadcrumbItems` and assembles the `urlParams` object before returning all data to the UI components.

### **Drilling Deeper: The `reconcilePaths` Logic**

The `reconcilePaths` utility is the intelligent core of the system's context memory. It compares the `urlPrimitivePath` with the `preservedPrimitivePath` to decide the outcome:

*   **Context Preservation:** If the URL path is an identical starting sub-sequence of the preserved path, the longer, preserved path is kept.
*   **Context Reset:** If the paths diverge at any point, the new URL path is adopted.
*   **Context Deepening:** If the preserved path is an identical starting sub-sequence of the URL path, the new, longer URL path is adopted.

### **Drilling Deeper: The `findNodesForPath` Translation Logic**

This utility is the authoritative translator and validator. Its core logic is to distinguish between the two types of URL segments:

*   **String Segments:** A segment like `"categories"` is treated as a static key and must match a child node's `item.key`.
*   **Numeric Segments:** A segment like `5` is treated as a dynamic entity ID and must correspond to a child node with `item.type === 'object'`.

### **Drilling Deeper: The `determineActiveNode` Logic**

This function creates an intuitive UI highlight based on a strict analysis of the **current URL**:

1.  **Parse the URL:** It generates a node path (`urlNodes`) *only* from the current URL.
2.  **Inspect the final node:** The last node of `urlNodes` is examined.
3.  **Apply the Rule Cascade:**
    *   **If the node is visible:** It is selected as the active node.
    *   **If the node is an invisible "object":** Its `defaultChild` is used to find the corresponding visible node.
    *   **If the node is an invisible container:** The first available visible child is selected as a best-guess fallback.
    *   **If all else fails:** The (invisible) node itself is returned to ensure stability.

### **Drilling Deeper: Assembling `urlParams` for UI Components**

A critical task of the `load` function is to provide the UI with a complete set of URL parameters for resolving dynamic `href` patterns. This is necessary for features like Context Preservation, where the UI may need parameters that are not present in the current, shorter URL. The `urlParams` object is assembled with a defined priority:

1.  **Base:** The object is first populated with all parameters from the deep **Navigation Context** (`nodesOnPath`).
2.  **Override:** It is then merged with the parameters from the **current URL** (`params`).

```javascript
// The logic in the `load` function's return statement
urlParams: {
  ...paramsFromContextPath,
  ...paramsFromCurrentUrl,
}
```This ensures that the current URL's parameters always take precedence (fixing divergence bugs), while parameters from the deeper context are still available for resolving links in the breadcrumbs (fixing the `Placeholder not found` bug).

### **Type-Safe Hierarchy System (`HierarchySidebar.types.ts`)**

The foundation of the system is a set of generic TypeScript types that enforce correctness at compile time. By using generics and `const` assertions, we can ensure that a `defaultChild` key must be one of the actual children's keys, preventing configuration errors before the code is even run.

```typescript
// Generic types with compile-time validation for defaultChild
export type HierarchyTreeNode<K extends string, C extends readonly HierarchyTreeNode<any, any>[] | undefined> = {
  item: HierarchyItem<K>;
  defaultChild?: C extends readonly any[] ? C[number]["item"]["key"] : never;
  children?: C;
};
```

### **State Management (`navigationState.ts`)**

The central `navigationState` store is a standard Svelte `writable` store designed to be simple and serializable. It holds the navigation context as a `(string | number)[]` primitive path, completely decoupled from the rich `RuntimeHierarchyTreeNode` objects. The `activeViewNode` property that was previously part of the state is now **obsolete**, as the logic for determining the active highlight no longer requires an explicit "intent" passed from the UI.

### **Architectural Goal: A Fully Data-Driven Navigation Hierarchy**

The architecture is designed to be fully data-driven.

*   **Logic Moves to Data:** The hierarchy configuration in `navHierarchyConfig.ts` is the single source of truth for navigation paths.
*   **Simplified Code:** Complex, manual logic in components is eliminated.
*   **Enhanced Maintainability:** Future changes to the navigation flow only require modifying the configuration data.

#### **Example of the Target Configuration**
```typescript
export const supplierHierarchyConfig: HierarchyTree = {
  name: "suppliers",
  rootItem: createHierarchyNode({
    item: { key: "suppliers", type: "list", href: "/suppliers", label: "Suppliers" },
    children: [
      createHierarchyNode({
        item: { key: "supplier", type: "object", href: "/suppliers/[supplierId]", label: "Supplier", display: false, urlParamName: "supplierId" },
        defaultChild: "categories",
        children: [ /* ...and so on */ ],
      }),
    ],
  }),
};
```

Of course. This is a crucial finding, and documenting it clearly is essential for the project's maintainability.

Here is the translation of the chapter, formatted for your README file.

---

## **Architectural Detail: State Management in Server-Side Rendering (SSR)**

The caching strategy for the `RuntimeHierarchyTree` offers significant performance benefits. However, in the context of SSR (Server-Side Rendering), it introduces a critical challenge: **managing shared state.**

When the Node.js server starts, it loads all JavaScript modules into memory **only once.** This means that any module-level variables, caches, or Svelte stores are **shared across every single request** that the server handles. Without a clean separation, the state from one request can "leak" into another.

### **The Problem: State Leak Between Requests**

We observed this issue in practice:

1.  A user (or a previous request) navigates to a deep URL like `/suppliers/3/categories/5`.
2.  On the server, the `navigationState` store is populated with the deep path, and the `runtimeHierarchyCache` is modified with request-specific `urlParamValue`s (`3`, `5`).
3.  Another user (or a subsequent reload) requests the simple URL `/suppliers`.
4.  The `load` function for this new request reads the **old, shared `navigationState`**, incorrectly applies "Context Preservation," and generates breadcrumbs for the deep path, even though the URL does not warrant it.

This not only results in incorrect data but also causes a UI "flicker" during hydration, as the (incorrect) state rendered by the server does not match the client's clean, initial state.

### **The Solution: Strict State Isolation on a Per-Request Basis**

To make the system robust, we must ensure that the state for each request is completely isolated on the server. This is achieved with a two-step strategy in the `+layout.ts` `load` function, which checks if it's running on the server (`!browser`).

**1. Isolating the `navigationState` Store:**
Each server request must start with a clean navigation context. Therefore, the store is explicitly reset at the beginning of every server-side execution of the `load` function.

**2. Isolating the `runtimeHierarchyCache`:**
Request-specific data (like `urlParamValue`) must never "pollute" the global cache. Instead of invalidating the cache, we work with a "disposable copy" of the relevant tree on the server. The original object in the cache remains untouched and "pristine."

This logic ensures that the server renders the correct, clean state for every request. Because this state matches the expected initial client state, SvelteKit can perform hydration seamlessly without re-running the `load` function, which prevents any UI flicker.

**Implementation Example in `+layout.ts`:**
```typescript
import { browser } from '$app/environment';
import { resetNavigationState } from '$lib/components/sidebarAndNav/navigationState';
import { cloneDeep } from 'lodash-es'; // or another deep-clone implementation

export async function load({ url, params, ... }: LoadEvent) {

  // Executes code only on the server
  if (!browser) {
    // 1. Isolate the store to prevent state leaks between requests
    resetNavigationState();
  }

  const allHierarchies = initializeAndCacheHierarchies();
  let activeTree = findTreeForUrl(allHierarchies, url);

  if (!browser) {
    // 2. Isolate the tree to prevent polluting the global cache.
    //    All subsequent operations will safely modify only this copy.
    activeTree = cloneDeep(activeTree);
  }

  // ... the rest of the load function can now safely work with the isolated state.
}
```