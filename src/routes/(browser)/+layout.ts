// File: src/routes/(browser)/+layout.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb } from "$lib/components/sidebarAndNav/buildBreadcrumb";
import type { RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { getAppHierarchies } from "../../lib/routes/navHierarchyConfig";
import {
  convertToRuntimeTree,
  updateDisabledStates,
  getPrimitivePathFromUrl,
  reconcilePaths,
  findNodesAndParamValuesForPath,
  resolveAllHrefsInTree,
  validateUniqueHierarchyNames,
} from "$lib/components/sidebarAndNav/hierarchyUtils";
import {
  getCurrentPathForContext,
  navigationState,
  resetNavigationState,
  setCurrentPathForContext,
} from "$lib/components/sidebarAndNav/navigationState";
import { get } from "svelte/store";
import { browser } from "$app/environment";
import { cloneDeep } from "lodash-es";
import { getCategoryApi } from "$lib/api/client/category";

// ================================================================================================
// CACHING & INITIALIZATION
// ================================================================================================

const runtimeHierarchyCache = new Map<string, RuntimeHierarchyTree>();

/**
 * Initializes the static hierarchy configurations into runtime trees on first load
 * and caches them in memory. On subsequent loads, it returns the cached trees for performance.
 * @returns An array of all runtime hierarchy trees for the application.
 */
function initializeAndCacheHierarchies(): RuntimeHierarchyTree[] {
  if (runtimeHierarchyCache.size > 0) {
    return Array.from(runtimeHierarchyCache.values());
  }
  log.debug("Initializing and caching runtime hierarchies for the first time...");
  const staticHierarchies = getAppHierarchies();

  // Check if tree names are unique.
  // NOTE: The tree itself is validated in convertToRuntimeTree() belpw.
  const uniqueNameValRes = validateUniqueHierarchyNames(staticHierarchies);
  if (!uniqueNameValRes.isValid) {
    const msg = `Navigation tree names must be unique. ${JSON.stringify(uniqueNameValRes.errors, null, 4)}`;
    log.errorLn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    log.error(msg);
    log.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`)
    throw new Error(msg);
  }

  // Create runtime trees.
  const initialRuntimeHierarchies: RuntimeHierarchyTree[] = [];
  for (const staticTree of staticHierarchies) {
    const runtimeTreeResult = convertToRuntimeTree(staticTree);
    if (runtimeTreeResult.errors) {
      const msg = `Runtime tree ${staticTree.name} is invalid: ${JSON.stringify(runtimeTreeResult.errors, null, 2)}`
      log.error(msg);
      throw error(500, msg);
    }
    initialRuntimeHierarchies.push(runtimeTreeResult.runtimeTree);
    runtimeHierarchyCache.set(runtimeTreeResult.runtimeTree.name, runtimeTreeResult.runtimeTree);
  }
  return initialRuntimeHierarchies;
}

// ================================================================================================
// HELPER FUNCTIONS for the load function
// ================================================================================================

/**
 * Selects the appropriate hierarchy tree for the current navigation context.
 * It uses the first segment of the URL's pathname to determine which tree is active
 * (e.g., a URL starting with `/suppliers` will select the `suppliers` tree).
 * @param allHierarchies All available runtime hierarchy trees.
 * @param url The current URL object from the SvelteKit load event.
 * @returns The single `RuntimeHierarchyTree` that matches the current URL's context.
 */
function findTreeForUrl(allHierarchies: RuntimeHierarchyTree[], url: URL): RuntimeHierarchyTree {
  const firstPathSegment = url.pathname.split("/")[1] || "";
  let activeTree: RuntimeHierarchyTree | undefined;
  if (firstPathSegment === "") {
    activeTree = allHierarchies.find((tree) => tree.name === "suppliers") || allHierarchies[0];
  } else {
    activeTree = allHierarchies.find((tree) => tree.rootItem.item.key === firstPathSegment);
  }
  if (!activeTree) {
    throw error(404, `No hierarchy tree configured for path segment '${firstPathSegment}'.`);
  }
  return activeTree;
}

/**
 * Determines which single UI node should be highlighted as the "active view".
 * This function implements a cascade of rules based exclusively on the current URL,
 * ensuring the UI highlight is always consistent with the page being viewed.
 * It follows a priority order: Direct URL Match -> Default Child -> First Visible Child -> Fallback.
 * @param url The current URL from the SvelteKit load event.
 * @param activeTree The currently active runtime hierarchy tree to evaluate against.
 * @returns The single `RuntimeHierarchyTreeNode` that should be highlighted in the UI.
 */
function determineActiveNode(url: URL, activeTree: RuntimeHierarchyTree): RuntimeHierarchyTreeNode {
  log.debug(`<determineActiveNode> Determining active node for tree='${activeTree.name}' ...`);

  const urlPrimitivePath = getPrimitivePathFromUrl(url);

  // Special case: If the last segment is "new", the active highlight should be
  // the parent list, not the default child of the (invisible) object node.
  if (urlPrimitivePath.length > 1 && urlPrimitivePath[urlPrimitivePath.length - 1] === "new") {
    try {
      // Find the path for the parent (everything except "/new")
      const parentPath = urlPrimitivePath.slice(0, -1);
      const nodes = findNodesAndParamValuesForPath(activeTree, parentPath);
      const parentNode = nodes[nodes.length - 1];
      if (parentNode) {
        log.info(`new_case_match chosen='${parentNode.item.key}'`);
        return parentNode;
      }
    } catch (e: unknown) {
      const originalMessage = e instanceof Error ? e.message : String(e);
      log.error(`Unrecoverable error resolving parent path for "/new" route.`, e);
      throw error(500, `Failed to determine the active navigation node: ${originalMessage}`);
    }
  }

  const isSelectableNode = (node: RuntimeHierarchyTreeNode): boolean => {
    return node.item.display !== false && !node.item.disabled;
  };

  const findDirectChild = (parent: RuntimeHierarchyTreeNode, childKey: string): RuntimeHierarchyTreeNode | undefined =>
    parent.children?.find((c) => c.item.key === childKey);

  let urlNodesOnPath: RuntimeHierarchyTreeNode[] = [];
  try {
    urlNodesOnPath = findNodesAndParamValuesForPath(activeTree, urlPrimitivePath);
  } catch (e) {
    log.warn(`Unable to resolve urlNodesOnPath for '${url.pathname}': ${String(e)}`);
  }

  const lastNodeOfUrl = urlNodesOnPath[urlNodesOnPath.length - 1];

  if (!lastNodeOfUrl) {
    log.info(`empty_path_fallback chosen='${activeTree.rootItem.item.key}'`);
    return activeTree.rootItem;
  }
  if (isSelectableNode(lastNodeOfUrl)) {
    log.info(`direct_url_match chosen='${lastNodeOfUrl.item.key}'`);
    return lastNodeOfUrl;
  }
  if (lastNodeOfUrl.item.type === "object" && typeof lastNodeOfUrl.defaultChild === "string") {
    const defaultChild = findDirectChild(lastNodeOfUrl, lastNodeOfUrl.defaultChild);
    if (defaultChild && isSelectableNode(defaultChild)) {
      log.info(`default_child chosen='${defaultChild.item.key}' parent='${lastNodeOfUrl.item.key}'`);
      return defaultChild;
    }
  }
  if (lastNodeOfUrl.children?.length) {
    const firstSelectableChild = lastNodeOfUrl.children.find(isSelectableNode);
    if (firstSelectableChild) {
      log.info(`first_visible_child chosen='${firstSelectableChild.item.key}' parent='${lastNodeOfUrl.item.key}'`);
      return firstSelectableChild;
    }
  }
  log.info(`decision=final_fallback chosen='${lastNodeOfUrl.item.key}' (may be hidden)`);
  return lastNodeOfUrl;
}

// ================================================================================================
// FINAL `load` FUNCTION
// ================================================================================================

/**
 * The central orchestrator for the entire navigation system. This function runs on every navigation.
 * It reconciles the navigation context, determines the active UI state, fetches necessary data for
 * display (e.g., entity names for breadcrumbs), and returns all data to the layout and page components.
 * @param event The SvelteKit LoadEvent object, containing URL, params, and fetch.
 * @returns A data object containing the hierarchies, breadcrumb items, active node, and URL params for the layout.
 */
export async function load({ url, params: urlParamsFromLoadEvent, depends, fetch: loadEventFetch }: LoadEvent) {
  log.info(`Load function triggered for URL: ${url.pathname}`);
  depends(`url:${url.href}`);

  // ⚠️ Due to SSR, state leak between requests and/or multiple user is a problem => Reset.
  if (!browser) {
    resetNavigationState();
  }

  // --- 1. Setup & Reconciliation ---

  const allHierarchies = initializeAndCacheHierarchies();
  let activeTree = findTreeForUrl(allHierarchies, url);

  // ⚠️ Due to SSR, state leak between requests and/or multiple user is a problem => Clone the tree.
  if (!browser) {
    // Erstelle eine tiefe Kopie des Baumes NUR für diese Server-Anfrage.
    // Das Original im Cache bleibt unberührt ("pristine").
    // Alle nachfolgenden Operationen (wie findNodesForPath) modifizieren
    // sicher diese Wegwerf-Kopie.
    activeTree = cloneDeep(activeTree);
  }

  const currentNavState = get(navigationState);
  const previousContextKey = currentNavState.activeContextKey;
  const currentContextKey = activeTree.name;
  const urlPrimitivePath = getPrimitivePathFromUrl(url);

  const previousContextPath = previousContextKey ? getCurrentPathForContext(previousContextKey) : null;
  if (previousContextKey !== currentContextKey) {
    log.info(`*** Context switch detected from '${previousContextKey}' to '${currentContextKey}'.`, {
      previousContextPath,
      currentNavState,
    });
  }
  const preservedPrimitivePath = getCurrentPathForContext(currentContextKey);
  const definitivePrimitivePath = reconcilePaths(urlPrimitivePath, preservedPrimitivePath);
  setCurrentPathForContext(currentContextKey, definitivePrimitivePath);
  log.info(`Definitive context path=${JSON.stringify(definitivePrimitivePath)}`, definitivePrimitivePath);

  // --- 2. Resolve Context Path & Update UI State ---
  let nodesOnPath: RuntimeHierarchyTreeNode[];
  try {
    nodesOnPath = findNodesAndParamValuesForPath(activeTree, definitivePrimitivePath);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "An unknown error occurred";
    throw error(404, `Page not found: ${message}`);
  }

  log.debug(`nodesOnPath found by findNodesAnParamValuesForPath:`, nodesOnPath);

  // Disable inactive trees
  for (const tree of allHierarchies) {
    if (tree.name === activeTree.name) {
      // For active tree: Use logic based on conserved context navPath.
      updateDisabledStates(tree, nodesOnPath);
    } else {
      // For inactive trees: Use logic with their own conserved navPath.
      const preservedPath = getCurrentPathForContext(tree.name);
      let preservedNodes: RuntimeHierarchyTreeNode[] = [];

      if (preservedPath && preservedPath.length > 0) {
        try {
          preservedNodes = findNodesAndParamValuesForPath(tree, preservedPath);
        } catch (err) {
          log.warn(`Could not resolve preserved path for inactive tree '${tree.name}'.`, err);
        }
      }
      updateDisabledStates(tree, preservedNodes);
    }
  }

  // --- 3. Determine Active Node (New Logic) ---
  const activeNode = determineActiveNode(url, activeTree);
  log.info(`Determined activeNode='${activeNode.item.key}' based on URL`);

  // --- 4. Data Fetching for Breadcrumbs ---
  const client = new ApiClient(loadEventFetch);
  const entityNameMap = new Map<string, string>();
  const promises = [];

  for (const node of nodesOnPath) {
    if (node.item.type === "object" && node.item.urlParamName) {
      const paramName = node.item.urlParamName;
      const entityId = node.item.urlParamValue;

      if (entityId && typeof entityId === "number") {
        let apiPromise;
        if (paramName === "supplierId") {
          apiPromise = getSupplierApi(client)
            .loadSupplier(entityId)
            .then((s) => s?.name);
        } else if (paramName === "categoryId") {
          apiPromise = getCategoryApi(client)
            .loadCategory(entityId)
            .then((c) => c?.name);
        } else if (paramName === "offeringId") {
          apiPromise = getOfferingApi(client)
            .loadOffering(entityId)
            .then((o) => o?.product_def_title);
        }

        if (apiPromise) {
          promises.push(
            apiPromise
              .then((name) => {
                if (name) entityNameMap.set(paramName, name);
              })
              .catch((err) => log.warn(`API call failed for ${paramName}=${entityId}`, err)),
          );
        }
      }
    }
  }
  await Promise.all(promises);

  // --- 5. Final Data Assembly  ---
  const breadcrumbItems = buildBreadcrumb({
    navigationPath: nodesOnPath,
    entityNameMap,
    activeNode: activeNode,
  });

  // Merge the context path parameters with the current URL parameters,
  // ensuring the URL parameters (the source of truth for the current view) take precedence.
  const urlParamsFromNodePath = {
    ...Object.fromEntries(
      nodesOnPath
        .filter((n) => n.item.urlParamName && n.item.urlParamValue && n.item.urlParamValue !== "leaf")
        .map((n) => [n.item.urlParamName!, n.item.urlParamValue!]),
    ),
    ...urlParamsFromLoadEvent,
  };

  // --- Resolve All Hrefs for UI consumption, e.g. layout.svelte ---
  // This ensures that every single node in the tree (not just those on the path)
  // has a ready-to-use URL for the UI components.
  resolveAllHrefsInTree(activeTree.rootItem, urlParamsFromNodePath);

  const returnData = {
    hierarchy: allHierarchies,
    breadcrumbItems,
    activeNode,
    urlParams: urlParamsFromNodePath,
  };
  log.debug(`load complete, returning the data dor context '${currentContextKey}'`, returnData);
  return returnData;
}
