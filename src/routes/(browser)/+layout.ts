// File: src/routes/(browser)/+layout.ts

import { log } from "$lib/utils/logger";
import { error, type LoadEvent } from "@sveltejs/kit";
import { get } from "svelte/store";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getCategoryApi } from "$lib/api/client/category";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb } from "$lib/components/sidebarAndNav/buildBreadcrumb";
import type { RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import {
  navigationState,
  setActiveViewNode,
  getCurrentPathForContext,
  setCurrentPathForContext,
  setActiveViewKeyForContext,
} from "$lib/components/sidebarAndNav/navigationState";
import { getAppHierarchies } from "./navHierarchyConfig";
import {
  convertToRuntimeTree,
  updateDisabledStates,
  getPrimitivePathFromUrl,
  reconcilePaths,
  findNodesForPath,
  findNodeByKeyInHierarchies,
} from "$lib/components/sidebarAndNav/hierarchyUtils";

// ================================================================================================
// CACHING & INITIALIZATION
// ================================================================================================

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

// ================================================================================================
// HELPER FUNCTIONS for the load function
// ================================================================================================

/**
 * Finds the appropriate hierarchy tree that corresponds to the current URL's context.
 * The context is determined by the first segment of the URL path.
 *
 * @param allHierarchies All available runtime hierarchies.
 * @param url The current URL object from the SvelteKit load event.
 * @returns The matching RuntimeHierarchyTree for the current context.
 */
function findTreeForUrl(allHierarchies: RuntimeHierarchyTree[], url: URL): RuntimeHierarchyTree {
  const firstPathSegment = url.pathname.split("/")[1] || "";

  let activeTree: RuntimeHierarchyTree | undefined;

  if (firstPathSegment === "") {
    // The root path '/' defaults to the 'suppliers' tree or the first available one as a fallback.
    activeTree = allHierarchies.find((tree) => tree.name === "suppliers") || allHierarchies[0];
  } else {
    // Find the tree whose root item's key matches the first URL segment.
    activeTree = allHierarchies.find((tree) => tree.rootItem.item.key === firstPathSegment);
  }

  if (!activeTree) {
    // This is a critical error indicating a URL for which no navigation is configured.
    throw error(404, `Page not found: No hierarchy tree configured for path segment '${firstPathSegment}'.`);
  }
  log.debug(`Active tree for URL '${url.pathname}' is '${activeTree.name}'.`);
  return activeTree;
}

/**
 * Determine which sidebar node should be highlighted (active view) for the given URL/context.
 *
 * Design principles:
 * - Breadcrumbs represent the literal URL path (may include hidden "object" nodes).
 * - The sidebar should highlight a *visible & enabled* node the user can actually click.
 * - Never jump deeper than direct children of the last path node unless enablement/preservation allows it.
 *
 * Priority order:
 *  1) EXPLICIT INTENT: If the UI signaled a direct, visible & enabled child → pick it.
 *  2) DIRECT URL MATCH: If the last node of the URL path is visible & enabled → pick it.
 *  3) DEFAULT CHILD: If the last path node is an object with a visible & enabled default child → pick it.
 *  4) DIRECT LEAF MATCH: If the last static URL segment matches a direct, visible & enabled child → pick it.
 *  5) FIRST VISIBLE CHILD: If any direct child is visible & enabled → pick the first one.
 *  6) FINAL FALLBACK: Use the last node in the path (might be hidden) as a last resort.
 *
 * Notes:
 * - "Selectable" = visible (display !== false) AND not disabled (!disabled).
 * - This function is intentionally *pure* (no store access). Pass any intent from the caller.
 * - Caller should reset/consume the intent AFTER setting the active view key.
 */
export function determineActiveNode(
  nodesOnPath: RuntimeHierarchyTreeNode[],
  url: URL,
  contextKey: string,
  activeTree: RuntimeHierarchyTree,
  /**
   * Optional explicit UI intent (e.g., user clicked a sidebar item just before navigation).
   * Only honored if it is a direct, visible & enabled child of the last path node.
   */
  activeViewNode?: RuntimeHierarchyTreeNode | null
): RuntimeHierarchyTreeNode {
  log.debug(`<determineActiveNode> Determining active node for context='${contextKey}' ...`);

  const lastNodeInPath =
    nodesOnPath.length > 0 ? nodesOnPath[nodesOnPath.length - 1] : null;

  // --- EMPTY PATH FALLBACK ---------------------------------------------------
  // If there is no node on the path (should be rare), fall back to the root of the active tree.
  if (!lastNodeInPath) {
    const fallbackRoot = activeTree.rootItem;
    if (!fallbackRoot) {
      log.error(
        `<determineActiveNode> No hierarchies configured; cannot determine active node`
      );
      throw error(500, 'No hierarchies configured.');
    }
    log.info(
      `<determineActiveNode> decision=empty_path_fallback chosen='${fallbackRoot.item.key}'`
    );
    return fallbackRoot;
  }

  // --- Helpers ---------------------------------------------------------------
  // A node is "selectable" if it is visible and not disabled.
  const isSelectableNode = (node: RuntimeHierarchyTreeNode): boolean =>
    node.item.display !== false && !node.item.disabled;

  // Find a direct child of "parent" with a specific key.
  const findDirectChild = (
    parent: RuntimeHierarchyTreeNode,
    childKey: string
  ): RuntimeHierarchyTreeNode | undefined =>
    parent.children?.find((c) => c.item.key === childKey);

  // Split URL into raw segments (for leaf matching).
  const urlPathSegments = url.pathname.split('/').filter(Boolean);
  const lastUrlSegment =
    urlPathSegments.length > 0 ? urlPathSegments[urlPathSegments.length - 1] : null;

  // Build the URL primitive path and resolve the nodes it maps to in the active tree.
  const urlPrimitivePath = getPrimitivePathFromUrl(url);
  // Safe to assume this succeeds because the caller already validated the path;
  // if it doesn’t, we’ll just skip Priority 2 and continue with other strategies.
  let urlNodesOnPath: RuntimeHierarchyTreeNode[] = [];
  try {
    urlNodesOnPath = findNodesForPath(activeTree, urlPrimitivePath);
  } catch (e) {
    log.warn(
      `<determineActiveNode> Unable to resolve urlNodesOnPath for '${url.pathname}': ${String(
        e
      )}`
    );
  }

  // --- Priority 1: EXPLICIT INTENT ------------------------------------------
  // Honor explicit UI intent only if it targets a direct, visible & enabled child
  // of the last node on the current path.
  if (activeViewNode && lastNodeInPath.children?.length) {
    const intentChild = lastNodeInPath.children.find(
      (child) =>
        child.item.key === activeViewNode.item.key && isSelectableNode(child)
    );
    if (intentChild) {
      log.info(
        `<determineActiveNode> decision=explicit_intent chosen='${intentChild.item.key}' parent='${lastNodeInPath.item.key}'`
      );
      return intentChild;
    }
    log.debug(
      `<determineActiveNode> Ignoring intent '${activeViewNode.item.key}' (not a direct selectable child of '${lastNodeInPath.item.key}')`
    );
  }

  // --- Priority 2: DIRECT URL MATCH -----------------------------------------
  // If the URL ends on a selectable node (i.e., visible + enabled), use it.
  if (urlNodesOnPath.length > 0) {
    const lastNodeOfUrl = urlNodesOnPath[urlNodesOnPath.length - 1];
    const selectable = isSelectableNode(lastNodeOfUrl);
    log.debug(
      `<determineActiveNode> url_last='${lastNodeOfUrl.item.key}' selectable=${selectable} (hidden=${
        lastNodeOfUrl.item.display === false
      }, disabled=${!!lastNodeOfUrl.item.disabled})`
    );
    if (selectable) {
      log.info(
        `<determineActiveNode> decision=direct_url_match chosen='${lastNodeOfUrl.item.key}'`
      );
      return lastNodeOfUrl;
    }
  }

  // --- Priority 3: DEFAULT CHILD --------------------------------------------
  // If the last node on the path is an "object" with a configured defaultChild,
  // prefer that *direct* child — but only if selectable.
  if (
    lastNodeInPath.item.type === 'object' &&
    typeof lastNodeInPath.defaultChild === 'string'
  ) {
    const defaultChildKey = lastNodeInPath.defaultChild;
    const defaultChild = findDirectChild(lastNodeInPath, defaultChildKey);

    if (defaultChild) {
      const selectable = isSelectableNode(defaultChild);
      log.debug(
        `<determineActiveNode> defaultChild='${defaultChildKey}' selectable=${selectable} (hidden=${
          defaultChild.item.display === false
        }, disabled=${!!defaultChild.item.disabled})`
      );
      if (selectable) {
        log.info(
          `<determineActiveNode> decision=default_child chosen='${defaultChild.item.key}' parent='${lastNodeInPath.item.key}'`
        );
        return defaultChild;
      }
      // If the default exists but is not selectable, continue to next strategies.
    } else {
      log.warn(
        `<determineActiveNode> defaultChild='${defaultChildKey}' not found as a direct child of '${lastNodeInPath.item.key}'`
      );
    }
  }

  // --- Priority 4: DIRECT LEAF MATCH ----------------------------------------
  // If the last *static* URL segment equals a direct child's key, and it is selectable.
  // (Note: for paths like '/suppliers/3' this rarely matches, because '3' ≠ 'categories'.)
  if (lastUrlSegment && lastNodeInPath.children?.length) {
    const matchingChild = lastNodeInPath.children.find(
      (child) =>
        child.item.key === lastUrlSegment && isSelectableNode(child)
    );
    if (matchingChild) {
      log.info(
        `<determineActiveNode> decision=direct_leaf_match chosen='${matchingChild.item.key}' parent='${lastNodeInPath.item.key}'`
      );
      return matchingChild;
    }
  }

  // --- Priority 5: FIRST VISIBLE CHILD --------------------------------------
  // Before falling back to a potentially hidden node, try any selectable direct child.
  if (lastNodeInPath.children?.length) {
    const firstSelectableChild = lastNodeInPath.children.find(isSelectableNode);
    if (firstSelectableChild) {
      log.info(
        `<determineActiveNode> decision=first_visible_child chosen='${firstSelectableChild.item.key}' parent='${lastNodeInPath.item.key}'`
      );
      return firstSelectableChild;
    }
  }

  // --- Priority 6: FINAL FALLBACK -------------------------------------------
  // As the very last resort, keep the last node in the path (even if hidden).
  // This keeps the system stable and prevents "no active item" situations when
  // nothing is selectable under the current context.
  log.info(
    `<determineActiveNode> decision=final_fallback chosen='${lastNodeInPath.item.key}' (may be hidden)`
  );
  return lastNodeInPath;
}


// ================================================================================================
// FINAL `load` FUNCTION
// ================================================================================================

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  // keep params/fetch "used" to avoid lints when not needed
  void params;
  void loadEventFetch;

  // 1) bootstrap
  log.debug(`after load triggered for URL: ${url.pathname}`);
  depends?.('app:navigation');

  // 2) hierarchies (returns array)
  const allHierarchies: RuntimeHierarchyTree[] = initializeAndCacheHierarchies();
  log.debug(`after initializeAndCacheHierarchies`);

  // 3) active tree
  const activeTree = findTreeForUrl(allHierarchies, url) as RuntimeHierarchyTree | undefined;
  if (!activeTree) {
    log.error(`after findTreeForUrl none for URL: ${url.pathname}`);
    throw error(404, 'No matching hierarchy');
  }
  const contextKey = activeTree.name;
  log.debug(`after findTreeForUrl: '${contextKey}' selected`);

  // 4) URL -> primitive path
  const urlPrimitivePath = getPrimitivePathFromUrl(url);
  log.debug(`after getPrimitivePathFromUrl: ${JSON.stringify(urlPrimitivePath)}`);

  // 5) preserved path (getter needs state + contextKey)
  const state = get(navigationState);
  const preservedPath = getCurrentPathForContext(state, contextKey) ?? ([] as (string | number)[]);
  log.debug(`after read preservedPath: ${JSON.stringify(preservedPath)}`);

  // 6) reconcile -> definitive primitive path (array)
  const definitivePrimitivePath = reconcilePaths(urlPrimitivePath, preservedPath);
  log.info(`after reconcilePaths definitivePath=${JSON.stringify(definitivePrimitivePath)}`);

  // 7) persist definitive path
  setCurrentPathForContext(contextKey, definitivePrimitivePath);
  log.debug(`after setCurrentPathForContext: ${JSON.stringify(definitivePrimitivePath)}`);

  // 8) resolve/validate nodes for path
  let nodesOnPath: RuntimeHierarchyTreeNode[] = [];
  try {
    nodesOnPath = findNodesForPath(activeTree, definitivePrimitivePath);
    log.info(`after findNodesForPath: ${nodesOnPath.length} nodes`);
  } catch (e: unknown) {
    const anyErr = e as { code?: string; message?: string };
    log.error(`after findNodesForPath error code=${anyErr?.code} msg=${anyErr?.message}`);
    const status = anyErr?.code === 'ERR_ROOT_MISMATCH' ? 404 : 400;
    throw error(status, anyErr?.message ?? 'Invalid path');
  }

  // 9) propagate URL params to runtime nodes (object nodes)
  for (const node of nodesOnPath) {
    const paramName = node.item.urlParamName;
    if (!paramName) continue;
    const idx = definitivePrimitivePath.findIndex(
      (seg: string | number) => seg === node.item.key
    );
    const candidate = idx >= 0 ? definitivePrimitivePath[idx + 1] : undefined;
    if (candidate !== undefined) {
      node.item.urlParamValue = candidate; // intended runtime mutation
      log.debug(`after propagate param: ${paramName}=${candidate} for ${node.item.key}`);
    }
  }

  // 10) enablement based on preserved context
  // NOTE: updateDisabledStates expects nodesOnPath (not the primitive array)
  updateDisabledStates(activeTree, nodesOnPath);
  log.debug(`after updateDisabledStates pathLen=${definitivePrimitivePath.length}`);
  const lastNode = nodesOnPath[nodesOnPath.length - 1];
  const enabledChildren =
    lastNode?.children?.filter((c) => c.item.display !== false && !c.item.disabled) ?? [];
  log.info(`after enablement enabledChildren=[${enabledChildren.map((c) => c.item.key).join(', ')}]`);

  // 11) determine visible active node (sidebar highlight)
  const maybeIntent = state.contexts.get(contextKey)?.activeViewNode ?? null;
  const activeNode = determineActiveNode(nodesOnPath, url, contextKey, activeTree, maybeIntent);
  log.info(`after determineActiveNode chose='${activeNode.item.key}'`);

  // 12) persist active view key
  setActiveViewKeyForContext(contextKey, activeNode.item.key);
  log.info(`after setActiveViewKey: '${activeNode.item.key}'`);

  // 13) consume/reset intent AFTER setting active view
  if (maybeIntent) {
    const consumed = activeNode.item.key === maybeIntent.item.key;
    setActiveViewNode(null);
    log.debug(`after intent_reset reason=${consumed ? 'consumed' : 'invalid'} context=${contextKey}`);
  } else {
    log.debug(`after intent_reset reason=noop context=${contextKey}`);
  }

  // 14) breadcrumbs from URL path (expects { path: nodes[], activeNodeKey, entityNameMap: Map })
  const breadcrumbItems = buildBreadcrumb({
    path: nodesOnPath,
    activeNodeKey: nodesOnPath[nodesOnPath.length - 1]?.item.key,
    entityNameMap: new Map<string, string>()
  });
  log.info(`after buildBreadcrumb count=${breadcrumbItems.length}`);

  // 15) return layout data
  log.debug(`after load complete`);
  return {
    hierarchy: activeTree,
    breadcrumbItems,
    activeNode,
    entityNameMap: new Map<string, string>(),
    urlParams: Object.fromEntries(
      nodesOnPath
        .filter((n) => n.item.urlParamName && n.item.urlParamValue !== undefined)
        .map((n) => [n.item.urlParamName!, n.item.urlParamValue!])
    )
  };
}