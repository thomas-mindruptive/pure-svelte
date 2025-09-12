// File: src/lib/components/sidebarAndNav/hierarchyUtils.ts

import { log } from "$lib/utils/logger";
import type {
  Hierarchy,
  HierarchyItem,
  HierarchyTree,
  RuntimeHierarchyItem,
  RuntimeHierarchyTree,
  RuntimeHierarchyTreeNode,
} from "./HierarchySidebar.types";

// === TYPE ALIASES FOR STRICT TYPING ============================================================

/**
 * Defines a strictly-typed, recursive interface for a static hierarchy node.
 * This avoids circular references found in type aliases and eliminates the need for `any`.
 */
interface GenericStaticNode {
  item: HierarchyItem<string>;
  children?: readonly GenericStaticNode[];
  defaultChild?: string;
}

// === CORE UTILITIES ============================================================================

/**
 * Resolves a urlParamValue from parameters based on a urlParamName.
 * @param urlParamName The parameter name (e.g., "supplierId", "categoryId", "leaf").
 * @param params The parameters object from the URL.
 * @returns The resolved value or "leaf" if the parameter is not found.
 */
function resolveUrlParamValue(urlParamName: string, params: Record<string, string | number | null>): string | number | "leaf" {
  if (urlParamName === "leaf") {
    return "leaf";
  }
  const value = params[urlParamName];
  return value ?? "leaf"; // Fallback to "leaf" if parameter not found
}

// === PARAMETER UPDATE LOGIC ====================================================================

/**
 * Recursively updates the urlParamValue of a node and its children in-place.
 * @param node The runtime node to update.
 * @param params The URL parameters object.
 */
function updateNodeParameters(node: RuntimeHierarchyTreeNode, params: Record<string, string | number | null>): void {
  node.item.urlParamValue = resolveUrlParamValue(node.item.urlParamName, params);
  if (node.children) {
    for (const child of node.children) {
      updateNodeParameters(child, params);
    }
  }
}

/**
 * Updates an existing array of RuntimeHierarchyTrees with new URL parameters.
 * This is the efficient way to update a cached tree without rebuilding its structure.
 * @param runtimeHierarchies The existing runtime hierarchies to update.
 * @param params The new URL parameters.
 * @returns The same, but modified, array of runtime hierarchies.
 */
export function updateRuntimeHierarchyParameters(
  runtimeHierarchies: RuntimeHierarchyTree[],
  params: Record<string, string | number | null>,
): RuntimeHierarchyTree[] {
  for (const tree of runtimeHierarchies) {
    updateNodeParameters(tree.rootItem, params);
  }
  return runtimeHierarchies;
}

// === INITIAL CREATION LOGIC ====================================================================

/**
 * Recursively converts a static node to a runtime node, copying all properties.
 * @param staticNode The static node to convert.
 * @returns A new RuntimeHierarchyTreeNode.
 */
function convertNodeToRuntime(staticNode: GenericStaticNode): RuntimeHierarchyTreeNode {
  const runtimeItem: RuntimeHierarchyItem = {
    ...staticNode.item,
    urlParamValue: "leaf",
    level: undefined,
  };
  const runtimeChildren = staticNode.children?.map((child) => convertNodeToRuntime(child));
  return {
    item: runtimeItem,
    children: runtimeChildren,
    defaultChild: staticNode.defaultChild,
  };
}

/**
 * Converts a single static HierarchyTree to a RuntimeHierarchyTree.
 * @param staticTree The static tree configuration.
 * @returns An initial RuntimeHierarchyTree without specific parameter values.
 */
export function convertToRuntimeTree(staticTree: HierarchyTree): RuntimeHierarchyTree {
  const runtimeTree: RuntimeHierarchyTree = {
    name: staticTree.name,
    rootItem: convertNodeToRuntime(staticTree.rootItem as unknown as GenericStaticNode),
  };
  initLevels(runtimeTree);
  return runtimeTree;
}

// === COMBINED BUILD FUNCTION ===================================================================

/**
 * Converts static hierarchy configurations to full runtime hierarchies.
 * This function combines the initial creation and the parameter update steps.
 * Use this when you don't have a cached runtime tree available.
 * @param staticHierarchies Array of static HierarchyTree configurations.
 * @param params URL parameters object (e.g., {supplierId: 3, categoryId: 5}).
 * @returns A new array of RuntimeHierarchyTree with urlParamValues and levels set.
 */
export function buildRuntimeHierarchy(
  staticHierarchies: Hierarchy,
  params: Record<string, string | number | null>,
): RuntimeHierarchyTree[] {
  const initialHierarchies = staticHierarchies.map((tree) => convertToRuntimeTree(tree));
  return updateRuntimeHierarchyParameters(initialHierarchies, params);
}

// === HIERARCHY UTILITIES =======================================================================

/**
 * Recursively sets the `level` property on all nodes in a runtime hierarchy tree.
 * This ensures that each node has the correct indentation level for the UI.
 * @param tree The runtime hierarchy tree to process.
 * @returns The same tree instance with levels set.
 */
export function initLevels(tree: RuntimeHierarchyTree): RuntimeHierarchyTree {
  function setNodeLevels(node: RuntimeHierarchyTreeNode, level: number): void {
    node.item.level = level;
    if (node.children && node.children.length > 0) {
      for (const childNode of node.children) {
        setNodeLevels(childNode, level + 1);
      }
    }
  }
  setNodeLevels(tree.rootItem, 0);
  return tree;
}

// === QUERY TREE UTILITIES =======================================================================

/**
 * Internal, recursive helper function to find a node by key only
 * within a single tree. Stops as soon as the first match is found.
 * @param node The starting node.
 * @param key The key to search for.
 * @returns The found node or null.
 */
export function findNodeByKeyRecursive(node: RuntimeHierarchyTreeNode, key: string): RuntimeHierarchyTreeNode | null {
  if (node.item.key === key) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByKeyRecursive(child, key);
      if (found) {
        return found; // Wichtig: Sobald gefunden, sofort zurückgeben und die Suche abbrechen.
      }
    }
  }
  return null;
}

/**
 * Finds the first node in an array of hierarchy trees that matches a given key.
 * This is now the central function for searching by key.
 *
 * @param hierarchies The array of runtime trees to search within.
 * @param key The key of the node to find.
 * @returns The found RuntimeHierarchyTreeNode or null if not found.
 */
export function findNodeByKeyInHierarchies(hierarchies: RuntimeHierarchyTree[], key: string): RuntimeHierarchyTreeNode | null {
  for (const tree of hierarchies) {
    const found = findNodeByKeyRecursive(tree.rootItem, key);
    if (found) {
      return found; // Den ersten Treffer sofort zurückgeben.
    }
  }
  return null;
}

/**
 * Finds a node in a runtime hierarchy tree by its key and level.
 * @param tree The runtime tree to search in.
 * @param key The key to search for.
 * @param level The level to search at.
 * @returns The found node or null if not found.
 */
export function findNodeInTreeByKEy(tree: RuntimeHierarchyTree, key: string, level: number): RuntimeHierarchyTreeNode | null {
  function searchNode(node: RuntimeHierarchyTreeNode): RuntimeHierarchyTreeNode | null {
    if (node.item.key === key && (node.item.level ?? 0) === level) {
      return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = searchNode(child);
        if (found) return found;
      }
    }
    return null;
  }
  return searchNode(tree.rootItem);
}

/**
 * Finds the first node at a specific level in the hierarchy, assuming a linear path.
 * @param tree The runtime tree to search in.
 * @param targetLevel The level to find a node at.
 * @returns The node at that level or null if not found.
 */
export function findFirstNodeAtLevel(tree: RuntimeHierarchyTree, targetLevel: number): RuntimeHierarchyTreeNode | null {
  function searchAtLevel(node: RuntimeHierarchyTreeNode, currentLevel: number): RuntimeHierarchyTreeNode | null {
    if (currentLevel === targetLevel) {
      return node;
    }
    if (node.children && currentLevel < targetLevel) {
      for (const child of node.children) {
        const found = searchAtLevel(child, currentLevel + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return searchAtLevel(tree.rootItem, 0);
}

// === URL AND PATH UTILITIES ====================================================================

/**
 * Resolves an href pattern by replacing placeholders with values from a parameters object.
 * Placeholders are expected in the format `[paramName]`.
 *
 * @param hrefPattern The URL pattern containing placeholders, e.g., "/suppliers/[supplierId]/categories".
 * @param urlParams A record object containing the parsed URL parameters, e.g., { supplierId: 3 }.
 * @returns The resolved URL string.
 * @throws {Error} If a placeholder in the pattern cannot be found in the `urlParams` object.
 */
export function resolveHref(hrefPattern: string, urlParams: Record<string, string | number | null>): string {
  // Regular expression to find all placeholders in the format [paramName]
  const placeholderRegex = /\[(\w+)\]/g;

  // Use .replace() with a replacer function to look up each placeholder
  const resolvedUrl = hrefPattern.replace(placeholderRegex, (match, paramName) => {
    // `match` is the full placeholder (e.g., "[supplierId]")
    // `paramName` is the captured group (e.g., "supplierId")

    if (paramName in urlParams) {
      const value = urlParams[paramName];
      // Ensure we have a valid, non-null value to inject into the URL
      if (value !== null && value !== undefined) {
        return String(value);
      }
    }

    // If the placeholder is not found or its value is null/undefined, throw an error.
    // This indicates a configuration or routing logic error and should be fixed.
    throw new Error(
      `Failed to resolve href pattern "${hrefPattern}". Placeholder "[${paramName}]" not found in provided urlParams: ${JSON.stringify(
        urlParams,
      )}`,
    );
  });

  return resolvedUrl;
}

/**
 * Builds a URL path string from an array of runtime nodes (a navigation path).
 * @param navigationPath An array of nodes representing the navigation path.
 * @returns A complete URL path string, e.g., "/suppliers/3/categories/5".
 */
export function buildUrlFromNavigationPath(navigationPath: RuntimeHierarchyTreeNode[]): string {
  if (navigationPath.length === 0) {
    return "/";
  }
  const urlSegments: string[] = [];
  for (const node of navigationPath) {
    const segment = node.item.key;
    const urlParamValue = node.item.urlParamValue;
    urlSegments.push(segment);
    if (urlParamValue !== "leaf") {
      urlSegments.push(String(urlParamValue));
    }
  }
  return "/" + urlSegments.join("/");
}

/**
 * Builds the authoritative `Navigation Context Path` from a hierarchy tree and a set of URL parameters.
 *
 * @description
 * This function is a cornerstone of the navigation system. It translates the stateless URL parameters
 * (e.g., `{ supplierId: 3, categoryId: 5 }`) into a stateful, ordered path of nodes representing the user's
 * drill-down journey (e.g., `[suppliersNode, categoriesNode]`).
 *
 * The logic is iterative:
 * 1. It starts at the root of the tree. The root is always included in the path.
 * 2. It checks if the `urlParamName` for the current node (e.g., 'supplierId') exists in the `urlParams`.
 * 3. If it exists, an entity for that level has been selected, so the function descends to the next logical child node.
 * 4. If it does not exist, the path cannot go any deeper, and the traversal stops.
 *
 * This resulting path is the single source of truth for the user's location and is used to drive the state of
 * the breadcrumbs, the enabled/disabled state of the sidebar, and the context for subsequent navigations.
 *
 * @example
 * // GIVEN: urlParams = { supplierId: 3 }
 * // RESULT: path = [suppliersNode, categoriesNode]
 * // The path includes 'categories' because a supplier ID was provided, unlocking that level.
 *
 * @example
 * // GIVEN: urlParams = { supplierId: 3, categoryId: 5 }
 * // RESULT: path = [suppliersNode, categoriesNode, offeringsNode]
 *
 * @param {RuntimeHierarchyTree} tree - The complete runtime hierarchy tree to traverse.
 * @param {Record<string, any>} urlParams - The merged URL parameters, which act as the "coordinates" to define the path's depth.
 * @returns {RuntimeHierarchyTreeNode[]} An array of nodes representing the exact path from the root to the deepest point defined by the `urlParams`.
 */
export function buildNavContextPathFromUrl(tree: RuntimeHierarchyTree, urlParams: Record<string, any>): RuntimeHierarchyTreeNode[] {
  log.debug(`Building path for tree '${tree.name}' with params:`, urlParams);
  const path: RuntimeHierarchyTreeNode[] = [];
  let currentNode: RuntimeHierarchyTreeNode | null | undefined = tree.rootItem;

  while (currentNode) {
    // 1. Add the current node to our path.
    path.push(currentNode);

    // 2. Check if the parameter for the *current* node exists.
    // This tells us if we have selected an entity at this level.
    const paramName = currentNode.item.urlParamName;
    const hasEntityForCurrentLevel = urlParams[paramName] !== undefined && paramName !== "leaf";

    if (hasEntityForCurrentLevel) {
      // 3. If an entity is selected, we are allowed to proceed to the next level.
      // We find the next logical child to descend into (e.g., 'categories' or 'offerings').
      // This logic assumes a primary, linear path and ignores secondary branches like 'addresses'.
      const nextNode: RuntimeHierarchyTreeNode | undefined = currentNode.children?.find(
        (child) => child.children || child.item.urlParamName !== "leaf",
      );
      if (nextNode) {
        log.debug(`Found next node`, nextNode);
        currentNode = nextNode;
      } else {
        // Reached the end of a branch with a selected entity. Stop.
        log.debug(`Reached the end of a branch, nextNode == null`);
        currentNode = null;
      }
    } else {
      // 4. If no entity is selected at the current level, the path ends here.
      // We cannot go any deeper.
      log.debug(`No entity is selected at the current level, the path ends here`);
      currentNode = null;
    }
  }

  log.debug(
    `[buildNavContextPathFromUrl] Final path built:`,
    path.map((p) => p.item.key),
  );
  return path;
}

// === DYNAMIC STATE AND VALIDATION ==============================================================

/**
 * Updates the `disabled` state of all nodes in a runtime tree based on the
 * navigation context, correctly implementing the logic from the readme.
 *
 * @param tree The runtime tree to update.
 * @param navigationPath The current navigation path with parameter values.
 * @returns The updated tree with correct disabled states.
 */
export function updateDisabledStates(tree: RuntimeHierarchyTree, navigationPath: RuntimeHierarchyTreeNode[]): RuntimeHierarchyTree {
  const navDepth = navigationPath.length;
  const lastNodeInPath = navDepth > 0 ? navigationPath[navDepth - 1] : null;
  const lastNodeHasEntity = lastNodeInPath ? lastNodeInPath.item.urlParamValue !== "leaf" : false;

  function updateNode(node: RuntimeHierarchyTreeNode): void {
    const nodeLevel = node.item.level ?? 0;
    let isDisabled = true; // Default to disabled

    // Rule 1: Ancestors of the current path are always enabled.
    if (nodeLevel < navDepth) {
      isDisabled = false;
    }

    // Rule 2: Direct children of a selected entity are enabled.
    if (nodeLevel === navDepth && lastNodeHasEntity) {
      isDisabled = false;
    }

    // Rule 3: The absolute root node of the tree is always enabled.
    if (nodeLevel === 0) {
      isDisabled = false;
    }

    node.item.disabled = isDisabled;

    if (node.children) {
      node.children.forEach(updateNode);
    }
  }

  updateNode(tree.rootItem);
  return tree;
}

/**
 * Validates that a runtime tree has a proper structure and values for debugging.
 * @param tree The runtime tree to validate.
 * @returns A validation result with any errors found.
 */
export function validateRuntimeTree(tree: RuntimeHierarchyTree): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  function validateNode(node: RuntimeHierarchyTreeNode, path: string): void {
    if (!node.item.key) errors.push(`${path}: Missing key`);
    if (!node.item.label) errors.push(`${path}: Missing label`);
    if (node.item.level === undefined) errors.push(`${path}: Missing level`);
    if (!node.item.urlParamValue) errors.push(`${path}: Missing urlParamValue`);
    if (node.children) {
      node.children.forEach((child, index) => {
        validateNode(child, `${path}.children[${index}]`);
      });
    }
  }
  validateNode(tree.rootItem, `${tree.name}.rootItem`);
  return { isValid: errors.length === 0, errors };
}

// === URL PARSING UTILITIES =====================================================================

/**
 * Generically parses URL parameters based on the hierarchy structure.
 * It uses the `urlParamName` properties from all nodes to extract values.
 * @param hierarchy The array of all runtime hierarchies.
 * @param params The `params` object from a SvelteKit LoadEvent.
 * @returns A record object mapping `urlParamName` to its value.
 */
export function parseUrlParameters(hierarchy: RuntimeHierarchyTree[], params: Record<string, string>): Record<string, any> {
  const result: Record<string, unknown> = {};
  for (const tree of hierarchy) {
    traverse(tree.rootItem, (node) => {
      const paramName = node.item.urlParamName;
      if (paramName && params[paramName]) {
        const paramValue = params[paramName];
        const numericValue = Number(paramValue);
        result[paramName] = !isNaN(numericValue) ? numericValue : paramValue;
      }
    });
  }
  return result;
}

/**
 * Extracts a leaf page segment from a URL pathname using the hierarchy structure.
 * This avoids hardcoding leaf page names like "attributes" or "links".
 * @param hierarchy The array of all runtime hierarchies.
 * @param pathname The URL pathname string.
 * @returns The key of the found leaf node, or null.
 */
export function extractLeafFromUrl(hierarchy: RuntimeHierarchyTree[], pathname: string): string | null {
  const leafNodes: string[] = [];
  for (const tree of hierarchy) {
    traverse(tree.rootItem, (node) => {
      if (node.item.urlParamName === "leaf") {
        leafNodes.push(node.item.key);
      }
    });
  }
  for (const leafKey of leafNodes) {
    if (pathname.endsWith(`/${leafKey}`)) {
      return leafKey;
    }
  }
  return null;
}

/**
 * A generic traversal utility to apply a callback to every node in a tree.
 * @param node The starting node.
 * @param callback The function to execute for each node.
 */
function traverse(node: RuntimeHierarchyTreeNode, callback: (node: RuntimeHierarchyTreeNode) => void) {
  callback(node);
  if (node.children) {
    for (const child of node.children) {
      traverse(child, callback);
    }
  }
}
