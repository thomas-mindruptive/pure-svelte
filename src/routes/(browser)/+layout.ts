// src/routes/(browser)/+layout.ts

import { log } from "$lib/utils/logger";
import type { LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getCategoryApi } from "$lib/api/client/category";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb, type ConservedPath } from "$lib/utils/buildBreadcrumb";
import type { HierarchyTree, HierarchyTreeNode, Hierarchy } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { setActiveTreePath } from "$lib/components/sidebarAndNav/navigationState";
import { buildHierarchy } from "./hierarchyConfig";

// === TYPES ====================================================================================

type EntityNames = {
  supplier: string | null;
  category: string | null;
  offering: string | null | undefined;
};

// === HIERARCHY TRAVERSAL UTILITIES ============================================================

/**
 * Traverses a hierarchy tree and calls a function for each node
 * Used for extracting information from the hierarchy structure
 */
function traverseHierarchy(node: HierarchyTreeNode, callback: (node: HierarchyTreeNode) => void): void {
  callback(node);

  if (node.children) {
    for (const child of node.children) {
      traverseHierarchy(child, callback);
    }
  }
}

/**
 * Finds all leaf nodes in the hierarchy (nodes without urlParamName)
 * These represent pages like /attributes, /links that don't have IDs
 */
function findLeafNodes(hierarchy: Hierarchy): string[] {
  const leafNodes: string[] = [];

  for (const tree of hierarchy) {
    traverseHierarchy(tree.rootItem, (node) => {
      // Leaf nodes are those without urlParamName (no ID expected)
      if (!node.item.urlParamName) {
        leafNodes.push(node.item.key);
      }
    });
  }

  return leafNodes;
}

/**
 * Extracts leaf page information from URL pathname using hierarchy structure
 * No hardcoded strings - determines leaf pages from hierarchy
 */
function extractLeafFromUrl(hierarchy: Hierarchy, pathname: string): string | null {
  const leafNodes = findLeafNodes(hierarchy);

  // Check which leaf node matches the URL ending
  for (const leafKey of leafNodes) {
    if (pathname.endsWith(`/${leafKey}`)) {
      return leafKey;
    }
  }

  return null;
}

/**
 * Generically parses URL parameters based on hierarchy structure
 * Uses the urlParamName properties from hierarchy nodes to extract values
 */
function parseUrlParameters(hierarchy: Hierarchy, params: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const tree of hierarchy) {
    traverseHierarchy(tree.rootItem, (node) => {
      if (node.item.urlParamName && params[node.item.urlParamName]) {
        const paramValue = params[node.item.urlParamName];
        // Try to parse as number, fall back to string
        const numericValue = Number(paramValue);
        result[node.item.urlParamName] = !isNaN(numericValue) && isFinite(numericValue) ? numericValue : paramValue;
      }
    });
  }

  return result;
}

/**
 * Finds a node at a specific level in the hierarchy
 * Levels are 0-indexed: 0 = root, 1 = first child level, etc.
 */
function findNodeAtLevel(tree: HierarchyTree, targetLevel: number): HierarchyTreeNode | null {
  function searchAtLevel(node: HierarchyTreeNode, currentLevel: number): HierarchyTreeNode | null {
    if (currentLevel === targetLevel) {
      return node;
    }

    if (node.children && currentLevel < targetLevel) {
      // Return the first child node at the target level
      // This assumes a linear hierarchy structure
      for (const child of node.children) {
        const found = searchAtLevel(child, currentLevel + 1);
        if (found) return found;
      }
    }

    return null;
  }

  return searchAtLevel(tree.rootItem, 0);
}

/**
 * Builds a navigation path based on available URL parameters
 * Traverses the hierarchy and includes nodes where parameters are available
 */
function buildNavigationPath(tree: HierarchyTree, urlParams: Record<string, any>): HierarchyTreeNode[] {
  const path: HierarchyTreeNode[] = [];

  // Start from root and traverse down while we have parameters
  let currentLevel = 0;

  while (true) {
    const nodeAtLevel = findNodeAtLevel(tree, currentLevel);
    if (!nodeAtLevel) break;

    const paramName = nodeAtLevel.item.urlParamName;

    // If this node expects a parameter and we have it, include it in path
    if (paramName && urlParams[paramName] !== undefined) {
      path.push(nodeAtLevel);
      currentLevel++;
    }
    // If this node doesn't expect a parameter (like root "suppliers"), include it if it's level 0
    else if (!paramName && currentLevel === 0) {
      path.push(nodeAtLevel);
      currentLevel++;
    }
    // If we can't continue the path, stop
    else {
      break;
    }
  }

  return path;
}

/**
 * Determines the active level for sidebar highlighting
 * Shows the next navigable level or current leaf page
 */
function determineActiveLevel(navigationPath: HierarchyTreeNode[], tree: HierarchyTree, leaf: string | null): string {
  log.debug("determineActiveLevel:", {
    navigationPath: navigationPath.map((n) => n.item.key),
    currentDepth: navigationPath.length,
    leaf,
  });

  // If we're on a leaf page, that's the active level
  if (leaf) return leaf;

  // Otherwise, find the next level that should be active
  const currentDepth = navigationPath.length;
  const nextNode = findNodeAtLevel(tree, currentDepth);

   log.debug("nextNode:", nextNode?.item.key);

  // Return the next node's key, or fallback to the root
  return nextNode?.item.key || tree.rootItem.item.key;
}

// === LEGACY SUPPORT ===========================================================================

/**
 * Creates a legacy-compatible finalUiPath object for buildBreadcrumb
 * This bridges the gap between hierarchy-based parsing and existing breadcrumb logic
 */
function createLegacyFinalUiPath(urlParams: Record<string, any>, leaf: string | null): ConservedPath {
  return {
    supplierId: urlParams.supplierId || null,
    categoryId: urlParams.categoryId || null,
    offeringId: urlParams.offeringId || null,
    leaf: leaf as any,
  };
}

// === MAIN LOAD FUNCTION =======================================================================

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  log.info("(Layout Load) called with URL:", url.href, "and params:", params);
  depends(`url:${url.href}`);

  // === 1. BUILD INITIAL HIERARCHY ==============================================================

  // Build hierarchy with empty context first to get structure
  const initialHierarchy = buildHierarchy({
    supplierId: null,
    categoryId: null,
    offeringId: null,
    leaf: null,
  });

  // === 2. PARSE URL PARAMETERS =================================================================

  // Extract parameters generically from hierarchy structure
  const urlParams = parseUrlParameters(initialHierarchy, params);
  log.debug("Parsed URL parameters:", urlParams);

  // Extract leaf page information
  const leaf = extractLeafFromUrl(initialHierarchy, url.pathname);
  log.debug("Extracted leaf:", leaf);

  // === 3. BUILD CONTEXTUAL HIERARCHY ===========================================================

  // Rebuild hierarchy with actual context for proper disabled states and hrefs
  const contextualHierarchy = buildHierarchy({
    supplierId: urlParams.supplierId || null,
    categoryId: urlParams.categoryId || null,
    offeringId: urlParams.offeringId || null,
    leaf: leaf,
  });

  // Find the supplier tree (assuming single tree for now)
  const supplierTree = contextualHierarchy.find((tree) => tree.name === "suppliers");
  if (!supplierTree) {
    throw new Error("Supplier tree not found in hierarchy");
  }

  // === 4. BUILD NAVIGATION PATH ================================================================

  // Build the navigation path that corresponds to the current URL
  const navigationPath = buildNavigationPath(supplierTree, urlParams);
  log.debug(
    "Built navigation path:",
    navigationPath.map((n) => n.item.key),
  );

  // === 5. UPDATE NAVIGATION STATE ==============================================================

  // Update NavigationState to reflect the current URL
  if (navigationPath.length > 0) {
    setActiveTreePath(supplierTree, navigationPath);
    log.debug("NavigationState updated with path length:", navigationPath.length);
  }

  // === 6. DETERMINE ACTIVE LEVEL ===============================================================

  // Determine which level should be highlighted in the sidebar
  const activeLevel = determineActiveLevel(navigationPath, supplierTree, leaf);
  log.debug("Determined active level:", activeLevel);

  // === 7. LOAD ENTITY NAMES ====================================================================

  const client = new ApiClient(loadEventFetch);
  const entityNames: EntityNames = { supplier: null, category: null, offering: null };

  // Load entity names in parallel (same as original +layout.ts)
  const promises = [];

  if (urlParams.supplierId) {
    promises.push(
      getSupplierApi(client)
        .loadSupplier(urlParams.supplierId)
        .then((s) => (entityNames.supplier = s.name))
        .catch(() => {}),
    );
  }

  if (urlParams.categoryId) {
    promises.push(
      getCategoryApi(client)
        .loadCategory(urlParams.categoryId)
        .then((c) => (entityNames.category = c.name))
        .catch(() => {}),
    );
  }

  if (urlParams.offeringId) {
    promises.push(
      getOfferingApi(client)
        .loadOffering(urlParams.offeringId)
        .then((o) => (entityNames.offering = o.product_def_title))
        .catch(() => {}),
    );
  }

  await Promise.all(promises);

  // === 8. BUILD BREADCRUMBS ====================================================================

  // Create legacy-compatible finalUiPath for existing buildBreadcrumb function
  const legacyFinalUiPath = createLegacyFinalUiPath(urlParams, leaf);

  // Build breadcrumbs using the existing buildBreadcrumb function
  const breadcrumbItems = buildBreadcrumb({
    url,
    params,
    entityNames,
    conservedPath: legacyFinalUiPath,
    activeLevel,
  });

  // === 9. RETURN LAYOUT DATA ===================================================================

  return {
    // Core data for the layout
    hierarchy: contextualHierarchy,
    breadcrumbItems,
    activeLevel,

    // Entity names for display
    entityNames,

    // Current navigation state (for debugging/inspection)
    finalUiPath: legacyFinalUiPath,

    // Navigation path for components that need it
    navigationPath,

    // Debug information
    urlParams,
    leaf,
  };
}
