# **Hierarchy Navigation System - Complete Documentation**

### **Executive Summary**

This document specifies the architecture of the application's hierarchical navigation system. The system is designed to be robust, predictable, and maintainable.

Its core principle is that the **`url.pathname` is the definitive source of truth for the user's navigation context.** The system translates this URL path into a rich UI state, enabling advanced features like "Context Preservation," where a user's deep drill-down path is remembered even when navigating to parent pages.

This document serves as the architectural blueprint and the implementation guide for all related components.

---

## **Core Concepts & Definitions**

A precise understanding of these terms is critical for working with the navigation system.

* Navigation Tree (HierarchyTree and RuntimeHierarchyTree): Represents the available nav-items in the side-bar and/or the breadcrumbs. 

* TreeNode: A node in the nav-tree. Consists of item (the navigation information) and children. A nodes may my visible or invisible.

*   **URL / Route**: The address in the browser's address bar. The `url.pathname` (e.g., `/suppliers/3/categories`) is the primary, unambiguous input to the navigation system.

*   **Navigation Context (Primitive Path)**: The application's "memory" of the user's location, stored in the central `NavigationState`. It is a simple, serializable array of strings and numbers representing the drill-down path (e.g., `['suppliers', 3, 'categories', 5]`). It is determined by the `reconcilePaths` function and is responsible for Context Preservation.

*   **Rich Node Path (`nodesOnPath`)**: A temporary, in-memory array of the full `RuntimeHierarchyTreeNode` objects. It is created during the `load` function by translating the **Primitive Path (Navigation Context)** against the hierarchy configuration. This is the primary data structure consumed by the Breadcrumbs and the `updateDisabledStates` logic.

*   **Active View (Active Node)**: A pure **UI concept**. It is the **single** `RuntimeHierarchyTreeNode` that is marked as "current" in the user interface (e.g., highlighted in the sidebar). It is determined **exclusively from the current URL**, separate from the Navigation Context.

*   **`defaultChild`**: A configuration property on a node. Its purpose is to create an architectural bridge between the logical navigation hierarchy and the physical page implementation. (See "Architectural Pattern" section for details).

*   **Context Preservation**: The core feature where the system retains a user's deep navigation path (the Navigation Context), even when the user navigates to a higher-level "parent" URL.

*   **Context Reset**: The process of discarding a preserved context when the user navigates to a divergent path (e.g., selects a different entity).

*   **Context Deepening**: The process of extending the current context when the user navigates further down a consistent path.

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

The central misunderstanding that led to the described bugs was the conflation of two concepts that must be handled separately. Their correct separation is the key to understanding the system and fixing the bugs.

### **1. The Context (The "Memory")**

*   **What it is:** The "context" is the complete, deepest path the user has taken within a hierarchy. It is the application's "memory."
*   **How it's determined:** It is determined by the `reconcilePaths` function, which compares the current URL with the previously stored state. This is where **Context Preservation, Deepening, and Reset** happen. The result is the `definitivePrimitivePath`.
*   **What it controls (its only jobs):**
    1.  **The Breadcrumbs:** The breadcrumb bar must always display the full context path to show the user their "journey."
    2.  **Sidebar Item Enablement (`updateDisabledStates`):** The sidebar needs to know which deeper items in the current context are reachable and should therefore be clickable.

### **2. The Active Highlight (The "Focus")**

*   **What it is:** This is a pure UI concept. It answers the question: "Which **one** item in the sidebar should have the visual highlight right now?"
*   **How it's determined:** It is determined **exclusively and always from the current URL**, completely separate from the preserved "context."
*   **The Simple Logic:**
    *   **Case A: The URL's endpoint is a VISIBLE node** (e.g., URL `/suppliers` ends on the `suppliersNode`).
        *   **Result:** This node is highlighted.
    *   **Case B: The URL's endpoint is an INVISIBLE node** (e.g., URL `/suppliers/3` ends on the `supplierNode` with `display: false`).
        *   **Result:** Its `defaultChild` (e.g., `categories`) is highlighted.

This strict separation makes the `activeViewNode` mechanism obsolete and fixes the bugs at their root.

## **Architectural Pattern: Decoupling Logic from UI**

The navigation system is designed to decouple the **logical navigation hierarchy** from the **physical implementation of pages**. This gives developers the freedom to design the UI pragmatically without being forced to implement a separate CRUD page for every logical level. The `defaultChild` property and invisible nodes are the key tools for this.

### **Example 1: The "Condensed Page"**

*   **Scenario:** A user navigates to a specific supplier at URL `/suppliers/3`. The page that renders (`SupplierDetailPage`) contains both the supplier's details and the list of its categories.
*   **Logical Path:** `suppliers -> supplier -> categories`.
*   **Physical Implementation:** Instead of forcing a separate `/suppliers/3/categories` page, everything is presented on the parent `/suppliers/3` page.
    *   **Svelte Routing**: The route `/suppliers/3/categories` does not exist. Our `hierarchyConfig.ts` reflects this by setting the `href` for the "categories" node to `/suppliers/[supplierId]`. This ensures a user can never click a link to a non-existent route.
    *   **The Problem:** But how does the system know to highlight "Categories" in the sidebar when the URL is only `/suppliers/3`?
    *   **The Solution:** `defaultChild`!
*   **The `defaultChild` Bridge:**
    1.  The URL `/suppliers/3` points to the **invisible** `supplier` node.
    2.  This node's configuration contains `defaultChild: 'categories'`.
    3.  The system concludes: "The page at `/suppliers/3` serves the purpose of displaying the categories list. Therefore, I must highlight the visible `categories` node in the sidebar."

### **Example 2: The "Split Page" with Delegation**

*   **Scenario:** A user navigates to an offering. There is no single "detail page" but two equivalent, specific views: `Attributes` and `Links`.
*   **Logical Path:** `... -> offering -> attributes` OR `... -> offering -> links`.
*   **Physical Implementation:** There is no content page at `.../offerings/1`. Instead, there are two specific pages:
    *   `/.../offerings/1/attributes`
    *   `/.../offerings/1/links`
    *   **Svelte Routing**: We use a **delegation pattern**. An almost empty page exists at the route `.../offerings/[offeringId]`, which does nothing but immediately delegate (e.g., using `goto`) to a default child route like `.../offerings/[offeringId]/links`.
*   **The `defaultChild` Bridge:**
    *   In this case, the logic is "the other way around". The Svelte routing itself handles the non-existent `/offerings/1` page by redirecting to `/offerings/1/links`.
    *   The user always lands on a URL like `.../offerings/1/links` or `.../offerings/1/attributes`.
    *   The active node is therefore determined by **Case A** of our logic: the last part of the URL (`links` or `attributes`) is a visible node, so it gets highlighted directly.
    *   **The `defaultChild` property on the `offering` object is not used for determining the highlight here**, because the user is never on a URL that ends with the invisible `offering` node. The `href` attributes on the `links` and `attributes` nodes point to the correct, specific URLs.

### **Current Scenario: All "object" nodes are invisible**

In our current application, all object nodes are configured as invisible (`display: false`) for one of two reasons:

1.  Our detail pages are **condensed** and already contain the content of the `defaultChild` (e.g., the supplier page shows the categories).
2.  There is **no detail page at all** for that object (e.g., `offering/[offeringId]`), and all navigation links in the configuration point directly to one of its visible children (`attributes` or `links`).

---

## **Architecture & Implementation Details**

### **The `+layout.ts` `load` Function: Conceptual Flow**

The `load` function is the central orchestrator. It executes the following flow on every navigation:

**Input:** The `url` object from SvelteKit, and the current `NavigationState` from the store.

#### **Phase 1: Context Reconciliation**

1.  **Determine Current Context Tree:** The first segment of the `url.pathname` identifies the relevant hierarchy.
2.  **Gather Competing Paths:** The `urlPrimitivePath` is parsed from the new URL. The `preservedPrimitivePath` is retrieved from the `navState`.
3.  **Compare and Decide (Context):** `reconcilePaths` determines the `definitivePrimitivePath` (the Navigation Context).

#### **Phase 2: State Update and Data Preparation**

4.  **Update State:** The reconciled `definitivePrimitivePath` is saved to the `navState`.
5.  **Translate Context to Rich Path:** `findNodesForPath` translates the `definitivePrimitivePath` into the `nodesOnPath` array.

#### **Phase 3: UI State Update**

6.  **Update Disabled States:** `updateDisabledStates` consumes the context's `nodesOnPath` to enable/disable all nodes in the hierarchy tree.
7.  **Determine Active Node (Highlight):** A separate logic path consumes **only the URL** to determine which single node to highlight.
8.  **Build Breadcrumbs:** `buildBreadcrumb` consumes the context's `nodesOnPath` to generate the breadcrumb items.

### **Drilling Deeper: The `reconcilePaths` Logic**

The `reconcilePaths` utility is the intelligent core of the system's context memory. It compares the `urlPrimitivePath` with the `preservedPrimitivePath` to decide the outcome:

*   **Context Preservation:** If the URL path is an identical starting sub-sequence of the preserved path, the longer, preserved path is kept.
*   **Context Reset:** If the paths diverge at any point, the new URL path is adopted.
*   **Context Deepening:** If the preserved path is an identical starting sub-sequence of the URL path, the new, longer URL path is adopted.

### **Drilling Deeper: The `findNodesForPath` Translation Logic**

This utility is the authoritative translator and validator. Its core logic is to distinguish between the two types of URL segments:

*   **String Segments:** A segment like `"categories"` is treated as a static key and must match a child node's `item.key`.
*   **Numeric Segments:** A segment like `5` is treated as a dynamic entity ID and must correspond to a child node with `item.type === 'object'`.

### **Drilling Deeper: The `determineActiveNode` Logic (NEW)**

This function creates an intuitive UI highlight based on a strict analysis of the **current URL**:

1.  **Parse the URL:** First, a node path is generated *only* from the current URL (`getPrimitivePathFromUrl` -> `findNodesForPath`). Let's call this `urlNodes`.
2.  **Inspect the final node:** The last node of `urlNodes` is examined.
3.  **Apply the Rule:**
    *   **If the node is visible (`display !== false`):** It is selected as the active node.
    *   **If the node is invisible (`display === false`):** Its `defaultChild` property is used to find the corresponding visible node, which is then selected as the active node.

### **State Management (`navigationState.ts`)**

The central `navigationState` store holds the navigation context as a `(string | number)[]` primitive path. The `activeViewNode` property is now **obsolete**, as the logic for determining the active highlight no longer requires an explicit "intent" passed from the UI. The URL itself is sufficient.

# BUGS TO FIX!!!!

## Bug #1: Incorrect Sidebar Highlighting (Active View is Wrong)
Scenario:
User is on /suppliers. The "Suppliers" item in the sidebar is correctly highlighted.
User clicks on a specific supplier, navigating to /suppliers/3. The defaultChild logic correctly highlights "Categories" in the sidebar.
User navigates back to /suppliers (e.g., by clicking the "Suppliers" breadcrumb).
Incorrect Behavior: The sidebar highlight gets "stuck". It continues to show "Categories" as the active item, even though the user is now viewing the /suppliers page.
Expected Behavior: The "Suppliers" item should be highlighted.
Root Cause Analysis: The `determineActiveNode` function was making its decision based on the preserved context path (`['suppliers', 3]`) instead of the path corresponding to the actual URL (`['suppliers']`). The fix is to ensure this function derives its result strictly from the URL.

## Bug #2: Incorrect Breadcrumb Active State
Scenario: Same as above. After navigating back to /suppliers, the user is on the suppliers list page.
Incorrect Behavior: The breadcrumb shows Suppliers / Supplier X, and the "Supplier X" item remains marked as the active (non-clickable) element.
Expected Behavior: The breadcrumb should show Suppliers, and "Suppliers" should be the active, non-clickable element.
Root Cause Analysis: This is a direct symptom of the same root cause. The data used to build the breadcrumb (which is based on the context path) is correct, but the logic determining which item is `active` was tied to the faulty `activeNode`. By fixing the active node determination to follow the URL, this will be resolved.

