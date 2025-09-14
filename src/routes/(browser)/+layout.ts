// File: src/routes/(browser)/+layout.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getCategoryApi } from "$lib/api/client/category";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb } from "$lib/components/sidebarAndNav/buildBreadcrumb";
import type { RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { getAppHierarchies } from "./navHierarchyConfig";
import {
  convertToRuntimeTree,
  updateDisabledStates,
  getPrimitivePathFromUrl,
  reconcilePaths,
  findNodesForPath,
} from "$lib/components/sidebarAndNav/hierarchyUtils";
import { getCurrentPathForContext, setCurrentPathForContext } from "$lib/components/sidebarAndNav/navigationState";

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
  const initialRuntimeHierarchies: RuntimeHierarchyTree[] = [];
  for (const staticTree of staticHierarchies) {
    const runtimeTree = convertToRuntimeTree(staticTree);
    initialRuntimeHierarchies.push(runtimeTree);
    runtimeHierarchyCache.set(runtimeTree.name, runtimeTree);
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
    throw error(404, `Page not found: No hierarchy tree configured for path segment '${firstPathSegment}'.`);
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

  const isSelectableNode = (node: RuntimeHierarchyTreeNode): boolean => {
    return node.item.display !== false && !node.item.disabled;
  };

  const findDirectChild = (parent: RuntimeHierarchyTreeNode, childKey: string): RuntimeHierarchyTreeNode | undefined =>
    parent.children?.find((c) => c.item.key === childKey);

  const urlPrimitivePath = getPrimitivePathFromUrl(url);
  let urlNodesOnPath: RuntimeHierarchyTreeNode[] = [];
  try {
    urlNodesOnPath = findNodesForPath(activeTree, urlPrimitivePath);
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
export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  log.info(`Load function triggered for URL: ${url.pathname}`);
  depends(`url:${url.href}`);

  // --- 1. Setup & Reconciliation ---
  const allHierarchies = initializeAndCacheHierarchies();
  const activeTree = findTreeForUrl(allHierarchies, url);
  const currentContextKey = activeTree.name;

  const urlPrimitivePath = getPrimitivePathFromUrl(url);
  // KORREKTUR 2: `getCurrentPathForContext` benötigt nur noch ein Argument mit dem neuen Store
  const preservedPrimitivePath = getCurrentPathForContext(currentContextKey);
  const definitivePrimitivePath = reconcilePaths(urlPrimitivePath, preservedPrimitivePath);
  setCurrentPathForContext(currentContextKey, definitivePrimitivePath);
  log.info(`Definitive context path=${JSON.stringify(definitivePrimitivePath)}`);

  // --- 2. Resolve Context Path & Update UI State ---
  let nodesOnPath: RuntimeHierarchyTreeNode[];
  try {
    nodesOnPath = findNodesForPath(activeTree, definitivePrimitivePath);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "An unknown error occurred";
    throw error(404, `Page not found: ${message}`);
  }

  nodesOnPath.forEach((node) => {
    if (node.item.urlParamName) {
      // KORREKTUR 3: `params` casten, um den TypeScript-Fehler beim dynamischen Zugriff zu beheben
      const paramValue = (params as Record<string, string>)[node.item.urlParamName];
      if (paramValue) {
        const numericValue = Number(paramValue);
        node.item.urlParamValue = isNaN(numericValue) ? paramValue : numericValue;
      }
    }
  });

  updateDisabledStates(activeTree, nodesOnPath);

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

  // --- 5. Final Data Assembly (Corrected Logic) ---
  const breadcrumbItems = buildBreadcrumb({
    navigationPath: nodesOnPath,
    entityNameMap,
    activeNode: activeNode,
  });

  const returnData = {
    hierarchy: allHierarchies,
    breadcrumbItems,
    activeNode,
    // CORRECTED: Merge the context path parameters with the current URL parameters,
    // ensuring the URL parameters (the source of truth for the current view) take precedence.
    urlParams: {
      ...Object.fromEntries(
        nodesOnPath
          .filter((n) => n.item.urlParamName && n.item.urlParamValue && n.item.urlParamValue !== "leaf")
          .map((n) => [n.item.urlParamName!, n.item.urlParamValue!]),
      ),
      ...params,
    },
  };
  log.debug(`load complete, returning the data`, returnData);
  return returnData;
}
