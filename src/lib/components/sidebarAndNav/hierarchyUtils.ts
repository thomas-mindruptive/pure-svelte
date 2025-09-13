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
  // Only attempt to resolve and set a value if the urlParamName is defined on the current node.
  if (node.item.urlParamName) {
    node.item.urlParamValue = resolveUrlParamValue(node.item.urlParamName, params);
  }

  // ALWAYS continue the traversal to process all descendants.
  // This is crucial to find all nested Object nodes in the tree.
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
 * This is a cornerstone of the navigation system. It translates the stateless URL parameters
 * (e.g., `{ supplierId: 3, categoryId: 5 }`) into a stateful, ordered path of nodes representing
 * the user's complete drill-down journey.
 *
 * The logic is specifically designed to traverse the new, explicit "List -> Object -> List" hierarchy structure:
 * 1. It starts at a "List" node (e.g., `suppliers`). This node is added to the path.
 * 2. It then looks for that List's corresponding "Object" child node (e.g., `supplier`).
 * 3. It checks if the `urlParams` contain a value for the Object node's `urlParamName` (e.g., `supplierId`).
 * 4. If a value exists, an entity has been selected. A dynamic version of the "Object" node,
 *    injected with the `urlParamValue` from the URL, is added to the path.
 * 5. The function then descends into the children of that "Object" node to find the *next* "List" node
 *    (e.g., `categories`) and repeats the process.
 * 6. If at any point a URL parameter is missing, the traversal stops, and the path is returned.
 *
 * The resulting path is the single source of truth for the user's location, containing both
 * visible List nodes and hidden Object nodes, which is essential for building breadcrumbs and managing UI state.
 *
 * @param {RuntimeHierarchyTree} tree - The complete runtime hierarchy tree to traverse.
 * @param {Record<string, any>} urlParams - The merged URL parameters, which act as the "coordinates" to define the path's depth.
 * @returns {RuntimeHierarchyTreeNode[]} An array of nodes representing the exact path from the root to the deepest point defined by the `urlParams`.
 */
export function buildNavContextPathFromUrl(tree: RuntimeHierarchyTree, urlParams: Record<string, any>): RuntimeHierarchyTreeNode[] {
	log.debug(`(buildNavContextPathFromUrl) Building path for tree '${tree.name}' with params:`, urlParams);
	const path: RuntimeHierarchyTreeNode[] = [];
	let currentListRoot: RuntimeHierarchyTreeNode | undefined = tree.rootItem;

	// The loop iterates as long as we can find a "List" node to process.
	while (currentListRoot) {
		// 1. Add the current "List" node (e.g., `suppliers`, `categories`) to the path.
		path.push(currentListRoot);
		log.debug(`(buildNavContextPathFromUrl) Added List node to path: '${currentListRoot.item.key}'`);

		// 2. Find this List's corresponding "Object" node, which defines the parameter for this level.
		// We assume the first hidden child is the main object representation for this list.
		const objectNode: RuntimeHierarchyTreeNode | undefined = currentListRoot.children?.find((child) => child.item.display === false);

		if (!objectNode) {
			// This branch has no further drill-down capability (e.g., a leaf or misconfiguration).
			log.debug(`(buildNavContextPathFromUrl) No child Object node found for '${currentListRoot.item.key}'. Stopping traversal.`);
			break;
		}

		// 3. Check if the URL provides a parameter value for this Object node.
		const paramName = objectNode.item.urlParamName;
		if (!paramName) {
			log.warn(`(buildNavContextPathFromUrl) Configuration issue: Object node '${objectNode.item.key}' is missing 'urlParamName'. Stopping traversal.`);
			break;
		}

		const paramValue = urlParams[paramName];
		if (paramValue === undefined || paramValue === null) {
			// The URL does not specify an entity for this level. The path ends here.
			log.debug(`(buildNavContextPathFromUrl) No param value for '${paramName}' in urlParams. Path construction complete.`);
			break;
		}

		// 4. An entity is selected. Create a dynamic version of the "Object" node
		//    with the `urlParamValue` injected and add it to the path.
		const dynamicObjectNode: RuntimeHierarchyTreeNode = {
			...objectNode,
			item: { ...objectNode.item, urlParamValue: paramValue }
		};
		path.push(dynamicObjectNode);
		log.debug(`(buildNavContextPathFromUrl) Added Object node to path: '${dynamicObjectNode.item.key}' with value: ${paramValue}`);

		// 5. Find the next "List" node for the next iteration.
		// It must be a child of the Object node we just processed. We assume the main
		// drill-down path continues through the first child that is itself a "List" (i.e., has children).
		currentListRoot = objectNode.children?.find((child) => child.children && child.children.length > 0);
	}

	log.debug(
		`[buildNavContextPathFromUrl] Final path built:`,
		path.map((p) => `${p.item.key}(${p.item.urlParamValue || ""})`)
	);
	return path;
}

// === DYNAMIC STATE AND VALIDATION ==============================================================

/**
 * Updates the `disabled` state of all nodes in a runtime tree based on the
 * current navigation context path, correctly implementing "Context Preservation".
 *
 * @description
 * This function traverses the entire tree and decides which nodes should be clickable
 * in the UI (like the sidebar). It defaults all nodes to disabled and then enables
 * them based on a set of rules that reflect the user's current context.
 *
 * The rules are:
 * 1. The root node of the tree is always enabled.
 * 2. Any node that is part of the provided `navigationPath` is enabled.
 * 3. Any direct child of the *last* node in the `navigationPath` is also enabled,
 *    allowing the user to proceed to the next logical step.
 *
 * @param tree - The runtime tree to update.
 * @param navigationPath - The current, fully reconciled navigation path.
 * @returns The updated tree with correct disabled states.
 */
export function updateDisabledStates(tree: RuntimeHierarchyTree, navigationPath: RuntimeHierarchyTreeNode[]): RuntimeHierarchyTree {
	log.debug(`Updating disabled states with path of length ${navigationPath.length}`);

	const lastNodeInPath = navigationPath.length > 0 ? navigationPath[navigationPath.length - 1] : null;

	// A recursive helper function to process each node.
	function updateNode(node: RuntimeHierarchyTreeNode): void {
		let isDisabled = true; // Rule 0: Default to disabled.

		// Rule 1: The root node is always enabled.
		if (node.item.level === 0) {
			isDisabled = false;
		}
		// Rule 2: Any node within the active navigation path is enabled.
		// A simple array lookup is perfectly efficient for a short path.
		else if (navigationPath.includes(node)) {
			isDisabled = false;
		}
		// Rule 3: Any direct child of the last node in the path is enabled.
		else if (lastNodeInPath && lastNodeInPath.children?.includes(node)) {
			isDisabled = false;
		}

		node.item.disabled = isDisabled;

		// Recurse through all children.
		if (node.children) {
			node.children.forEach(updateNode);
		}
	}

	// Start the process from the root of the tree.
	updateNode(tree.rootItem);

	log.debug(`Finished updating states.`);
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
 *
 * @description
 * This function traverses all provided hierarchy trees to find every node that has a
 * `urlParamName` defined (which, in the data-driven model, are the hidden "Object" nodes).
 * For each one found, it extracts the corresponding value from the `params` object provided
 * by SvelteKit's `load` event. It also intelligently converts numeric string values to numbers.
 * The result is a clean key-value map of the active parameters for the current URL.
 *
 * @param {RuntimeHierarchyTree[]} hierarchies - The array of all runtime hierarchies to scan.
 * @param {Record<string, string>} params - The `params` object from a SvelteKit LoadEvent.
 * @returns {Record<string, any>} A record object mapping `urlParamName` to its value (e.g., { supplierId: 3, categoryId: 5 }).
 */
export function parseUrlParameters(hierarchies: RuntimeHierarchyTree[], params: Record<string, string>): Record<string, any> {
	log.debug(`(parseUrlParameters) Parsing SvelteKit params:`, params);
	const result: Record<string, unknown> = {};

	for (const tree of hierarchies) {
		// Use the generic traverse utility to visit every node in the tree.
		traverse(tree.rootItem, (node) => {
			const paramName = node.item.urlParamName;

			// Act only if the node is configured to have a URL parameter AND a value for it exists in the URL.
			if (paramName && params[paramName] !== undefined) {
				const paramValue = params[paramName];
				const numericValue = Number(paramValue);

				// Store the value, converting it to a number if it's a valid one.
				result[paramName] = !isNaN(numericValue) ? numericValue : paramValue;
			}
		});
	}

	log.debug(`(parseUrlParameters) Parsed result:`, result);
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
