// File: src/routes/(browser)/+layout.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getCategoryApi } from "$lib/api/client/category";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb } from "$lib/components/sidebarAndNav/buildBreadcrumb";
import type { RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { setActiveTreePath } from "$lib/components/sidebarAndNav/navigationState";
import * as ns from "$lib/components/sidebarAndNav/navigationState";
import { getAppHierarchies } from "./navHierarchyConfig";
import {
  buildNavContextPathFromUrl,
  convertToRuntimeTree,
  extractLeafFromUrl,
  findNodeByKeyInHierarchies,
  parseUrlParameters,
  updateDisabledStates,
  updateRuntimeHierarchyParameters,
} from "$lib/components/sidebarAndNav/hierarchyUtils";
import { get } from "svelte/store";

// === CACHING ARCHITECTURE ======================================================================

const runtimeHierarchyCache = new Map<string, RuntimeHierarchyTree>();

function initializeAndCacheHierarchies(): RuntimeHierarchyTree[] {
  if (runtimeHierarchyCache.size > 0) {
    return Array.from(runtimeHierarchyCache.values());
  }
  log.debug("Initializing and caching runtime hierarchies for the first time...");
  const staticHierarchies = getAppHierarchies();
  const initialRuntimeHierarchies: RuntimeHierarchyTree[] = [];
  for (const staticTree of staticHierarchies) {
    const runtimeTree = convertToRuntimeTree(staticTree);
    initialRuntimeHierarchies.push(runtimeTree);
    runtimeHierarchyCache.set(runtimeTree.name, runtimeTree);
  }
  return initialRuntimeHierarchies;
}

// === HIERARCHY UTILITIES =======================================================================

/**
 * Determines the specific `RuntimeHierarchyTreeNode` that should be highlighted as 'active' in the UI (e.g., in the sidebar).
 *
 * @description
 * This function is the central logic for translating the application's navigation state into a specific, active UI element.
 * It's necessary because the active view isn't always the last element in the navigation path (e.g., after an entity selection, a `defaultChild` should be active).
 *
 * The function resolves the active node based on a strict priority order:
 * 1. **Explicit User Intent:** Checks if a node was explicitly set via a sidebar click (`activeViewNode` in the state). This always wins.
 * 2. **Leaf Page:** If the current URL points to a leaf page (e.g., 'attributes'), that page's node is active.
 * 3. **Default Child:** After selecting an entity, its configured `defaultChild` becomes active to guide the user to the next logical step.
 * 4. **Last Path Node:** If none of the above apply, the deepest node in the current navigation context is active.
 * 5. **Fallback:** As a last resort, the root of the currently navigated tree is returned.
 *
 * @param navigationPath - The current contextual path of resolved entities (e.g., [suppliersNode, categoriesNode]).
 * @param tree - The primary `RuntimeHierarchyTree` currently being navigated.
 * @param leaf - The key of a leaf page if one is active, otherwise `null`.
 * @param currentState - The full, current `NavigationState` from the Svelte store, needed to check for explicit view selections.
 * @param allHierarchies - An array of all available runtime hierarchies, required to find nodes by key across different trees (e.g., finding a `defaultChild`).
 * @returns The `RuntimeHierarchyTreeNode` to be highlighted, or `null` if no node could be determined as active.
 */
function determineActiveNode(
  navigationPath: RuntimeHierarchyTreeNode[],
  tree: RuntimeHierarchyTree,
  leaf: string | null,
  currentState: ns.NavigationState,
  allHierarchies: RuntimeHierarchyTree[],
): RuntimeHierarchyTreeNode {
  // Rule 1: An explicitly set view node has the highest priority.
  const explicitViewNode = currentState.activeViewNode;
  if (explicitViewNode) {
    log.debug(`Active node determined by EXPLICIT VIEW NODE: '${explicitViewNode.item.key}'`);
    // Consume the node so it's only used once.
    ns.setActiveViewNode(null);
    return explicitViewNode;
  }

  // Rule 2: A leaf page is the next priority.
  if (leaf) {
    // This call now uses the clean, imported utility function.
    const leafNode = findNodeByKeyInHierarchies(allHierarchies, leaf);
    log.debug(`Active node determined by LEAF: '${leafNode?.item.key}'`);
    if (!leafNode) throw error(500, `+layout.ts::determineActiveNode: Cannot find leaf node in all hierarchie trees: ${leaf}`);
    return leafNode;
  }

  // Rule 3: Apply the defaultChild logic if an entity is selected.
  if (navigationPath.length > 0) {
    const lastNodeInPath = navigationPath[navigationPath.length - 1];
    if (lastNodeInPath.item.urlParamValue !== "leaf" && lastNodeInPath.defaultChild) {
      const childNodeKey = lastNodeInPath.defaultChild;
      // This call also uses the clean, imported utility function.
      const childNode = findNodeByKeyInHierarchies(allHierarchies, childNodeKey);
      log.debug(`Active node determined by DEFAULT CHILD: '${childNode?.item.key}'`);
      if (!childNode) throw error(500, `+layout.ts::determineActiveNode: Cannot find childNode in all hierarchie trees: ${childNodeKey}`);
      return childNode;
    }
    // Rule 4: Otherwise, the last node in the path itself is active.
    log.debug(`Active node determined by LAST PATH NODE: '${lastNodeInPath.item.key}'`);
    return lastNodeInPath;
  }

  // Fallback: The root node of the tree is active.
  log.debug(`Active node determined by FALLBACK: '${tree.rootItem.item.key}'`);
  return tree.rootItem;
}

// === MAIN LOAD FUNCTION ========================================================================

/**
 * The central orchestrator for the application's hierarchical navigation system.
 * This `load` function acts as the "brain" on every client-side navigation,
 * reconciling the application's "memory" (the preserved Navigation Context)
 * with the user's current "intent" (the URL).
 *
 * It follows the architecture described in `README-navigation-system.md` to enable
 * "Context Preservation," where the user's deep drill-down path is remembered
 * even when navigating to higher-level pages via the sidebar.
 *
 * @param {LoadEvent} event - The SvelteKit load event, containing the URL, params, and fetch function.
 * @returns {Promise<object>} A promise that resolves to an object containing all the necessary data
 * for the layout and page components, including the fully contextualized hierarchy,
 * breadcrumbs, and the active level for UI highlighting.
 *
 *
 * ### Core Logic Flow:
 *
 * 1.  **Get Preserved Context**: It retrieves the current navigation path (the chain of selected
 *     entities like "Supplier #3" -> "Category #5") from the `navigationState` Svelte store.
 *     This represents the application's "memory".
 *
 * 2.  **Get URL Intent**: It parses the parameters from the current URL (e.g., `/suppliers/7`).
 *     This represents the user's immediate navigational intent.
 *
 * 3.  **Reconcile State**: It merges the two sets of parameters. The URL's intent (`pathParams`)
 *     always overrides the stored context (`preservedParams`). This is the key to how a
 *     "Context Reset" works: clicking a new supplier in the list updates the URL, which
 *     overwrites the old context. If the URL is simple (e.g., `/suppliers`), the preserved
 *     context is used, achieving "Context Preservation".
 *
 * 4.  **Build Context Path**: Using the final, merged parameters, it constructs the definitive
 *     `navigationPath` for this view using the `buildNavigationPath` utility. This path is the
 *     single source of truth for the current context.
 *
 * 5.  **Update Hierarchy State**: It updates the entire runtime hierarchy:
 *     - `urlParamValue` is injected into each node based on the merged params.
 *     - `disabled` states are recalculated using `updateDisabledStates` based on the newly built
 *       `navigationPath`, enabling/disabling sidebar items.
 *
 * 6.  **Synchronize Store**: The newly calculated `navigationPath` is synchronized back into the
 *     `navigationState` store, making it the new "preserved context" for the *next* navigation.
 *
 * 7.  **Determine Active View**: It calculates which sidebar item should be highlighted (`activeLevel`)
 *     based on a priority system: an explicit sidebar click intent (`activeViewKey`), a leaf page,
 *     the `defaultChild` of the last selected entity, or the last entity itself.
 *
 * 8.  **Fetch Display Names**: It asynchronously fetches user-friendly names for entities in the path
 *     (e.g., fetching "Supplier C" for `supplierId: 3`) to be used in UI elements like breadcrumbs.
 *
 * 9.  **Build UI Data**: Finally, it builds the `breadcrumbItems` and returns the complete data
 *     payload for the `+layout.svelte` component to render.
 */
export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  log.info(`Load function triggered for URL: ${url.pathname}`);
  depends(`url:${url.href}`);

  const currentNavState = get(ns.navigationState);
  // const activeTree = currentState.activeTree;
  log.debug("### Current navstate: ", currentNavState);

  // --- 1. Get or Initialize Hierarchy from Cache ---------------------------------------------
  const initialHierarchies = initializeAndCacheHierarchies();

  // --- 2. Reconciliate currentNavState and URL params.  --------------------------------------

  // --- 2.1 Get preserved context from store
  const preservedParams: Record<string, string | number> = {};
  if (currentNavState.activeTree) {
    currentNavState.activeTree.paths.forEach((node) => {
      if (node.item.urlParamValue !== "leaf") {
        preservedParams[node.item.urlParamName] = node.item.urlParamValue;
      }
    });
  }

  // --- Step 2.2: Get the primary parameters from the URL path. These have priority
  const pathParams = parseUrlParameters(initialHierarchies, params);

  // --- Step 2.3: Merge them. Path parameters from the URL override the preserved context.
  const urlParams = { ...preservedParams, ...pathParams };
  log.debug("Preserved context from store:", preservedParams);
  log.debug("Params from URL path:", pathParams);
  log.debug("FINAL merged params for this load:", urlParams);

  const leaf = extractLeafFromUrl(initialHierarchies, url.pathname);
  log.debug(`Extracted leaf page: ${leaf}`);

  // --- 3. Update Hierarchy with Current Context ----------------------------------------------
  let contextualRuntimeTreeHierarchy = updateRuntimeHierarchyParameters(initialHierarchies, urlParams);
  const supplierTree = contextualRuntimeTreeHierarchy.find((tree) => tree.name === "suppliers");
  if (!supplierTree) {
    throw error(500, "Critical: 'suppliers' tree not found in hierarchy configuration.");
  }
  const categoryTree = contextualRuntimeTreeHierarchy.find((tree) => tree.name === "categories");
  if (!categoryTree) {
    throw error(500, "Critical: 'categoryTree' tree not found in hierarchy configuration.");
  }

  // --- 4. Build the Navigation Context Path --------------------------------------------------
  const navigationPath = buildNavContextPathFromUrl(supplierTree, urlParams);
  log.debug(
    "Built navigation path:",
    navigationPath.map((n) => n.item.key),
  );

  // --- 4.5 Update Disabled States ------------------------------------------------------------
  // After knowing the context path, update the entire tree to set which nodes
  // are clickable (enabled) or not (disabled).
  contextualRuntimeTreeHierarchy = contextualRuntimeTreeHierarchy.map((tree) => updateDisabledStates(tree, navigationPath));
  log.debug("Updated disabled states for the hierarchy.");

  // --- 5. Synchronize with Central Navigation State ------------------------------------------
  if (navigationPath.length > 0) {
    setActiveTreePath(supplierTree, navigationPath);
  } else {
    setActiveTreePath(supplierTree, []);
  }
  log.debug(`NavigationState store updated with path of length: ${navigationPath.length}`);

  // --- 6. Determine the Active UI Level ------------------------------------------------------
  const activeNode = determineActiveNode(navigationPath, supplierTree, leaf, currentNavState, contextualRuntimeTreeHierarchy);
  log.debug(`Determined final active UI Node: '${activeNode?.item.key}'`);

  // --- 7. Fetch Dynamic Entity Names for Display ---------------------------------------------
  const client = new ApiClient(loadEventFetch);
  const entityNameMap = new Map<string, string>();
  const promises = [];
  if (urlParams.supplierId) {
    promises.push(
      getSupplierApi(client)
        .loadSupplier(urlParams.supplierId)
        .then((s) => {
          if (s.name) entityNameMap.set("supplierId", s.name);
        })
        .catch(() => {}),
    );
  }
  if (urlParams.categoryId) {
    promises.push(
      getCategoryApi(client)
        .loadCategory(urlParams.categoryId)
        .then((c) => {
          if (c.name) entityNameMap.set("categoryId", c.name);
        })
        .catch(() => {}),
    );
  }
  if (urlParams.offeringId) {
    promises.push(
      getOfferingApi(client)
        .loadOffering(urlParams.offeringId)
        .then((o) => {
          if (o.product_def_title) entityNameMap.set("offeringId", o.product_def_title);
        })
        .catch(() => {}),
    );
  }
  await Promise.all(promises);
  log.debug("Fetched entity names:", Object.fromEntries(entityNameMap));

  // --- 8. Build Breadcrumbs ------------------------------------------------------------------
  const breadcrumbItems = buildBreadcrumb({
    navigationPath: navigationPath,
    entityNameMap,
    activeLevelKey: activeNode?.item.key,
    hierarchy: contextualRuntimeTreeHierarchy,
  });

  // --- 9. Return Final Data Payload ----------------------------------------------------------
  return {
    hierarchy: contextualRuntimeTreeHierarchy,
    breadcrumbItems,
    activeNode,
    entityNameMap,
    navigationPath,
    urlParams,
    leaf,
  };
}
