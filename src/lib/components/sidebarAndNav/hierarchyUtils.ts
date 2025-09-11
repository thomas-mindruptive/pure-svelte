import type { 
  HierarchyTree, 
  HierarchyTreeNode, 
  RuntimeHierarchyTree, 
  RuntimeHierarchyTreeNode,
  RuntimeHierarchyItem,
  Hierarchy
} from '$lib/components/sidebarAndNav/HierarchySidebar.types';

// === STATIC TO RUNTIME TRANSFORMATION ===============================================================================

/**
 * Main entry point: converts static hierarchy configurations to runtime hierarchies
 * This is the generic transform function that works for any hierarchy structure
 * 
 * @param staticHierarchies Array of static HierarchyTree configurations
 * @param params URL parameters object (e.g., {supplierId: 3, categoryId: 5})
 * @returns Array of RuntimeHierarchyTree with urlParamValues and levels set
 */
export function buildRuntimeHierarchy(
  staticHierarchies: Hierarchy,
  params: Record<string, string | number | null>
): RuntimeHierarchyTree[] {
  return staticHierarchies.map(staticTree => convertToRuntimeTree(staticTree, params));
}

/**
 * Converts a single static HierarchyTree to RuntimeHierarchyTree
 * 
 * @param staticTree The static tree configuration
 * @param params URL parameters for setting urlParamValues
 * @returns RuntimeHierarchyTree with proper urlParamValues and levels
 */
function convertToRuntimeTree(
  staticTree: HierarchyTree,
  params: Record<string, string | number | null>
): RuntimeHierarchyTree {
  // Step 1: Convert structure and set urlParamValues
  const runtimeTree: RuntimeHierarchyTree = {
    name: staticTree.name,
    rootItem: convertNodeToRuntime(staticTree.rootItem, params)
  };
  
  // Step 2: Set levels using existing initLevels function
  initLevels(runtimeTree);
  
  return runtimeTree;
}

/**
 * Recursively converts static nodes to runtime nodes with urlParamValues
 * 
 * @param staticNode The static node to convert
 * @param params URL parameters for value resolution
 * @returns RuntimeHierarchyTreeNode with urlParamValues set
 */
function convertNodeToRuntime(
  staticNode: HierarchyTreeNode<any, any>,
  params: Record<string, string | number | null>
): RuntimeHierarchyTreeNode {
  // Convert the item with urlParamValue
  const runtimeItem: RuntimeHierarchyItem = {
    ...staticNode.item,
    urlParamValue: resolveUrlParamValue(staticNode.item.urlParamName, params),
    level: undefined // Will be set by initLevels()
  };
  
  // Convert children recursively
  const runtimeChildren = staticNode.children?.map(child => 
    convertNodeToRuntime(child, params)
  );
  
  return {
    item: runtimeItem,
    children: runtimeChildren
  };
}

/**
 * Resolves urlParamValue from parameters based on urlParamName
 * 
 * @param urlParamName The parameter name (e.g., "supplierId", "categoryId", "leaf")
 * @param params The parameters object
 * @returns The resolved value or "leaf" for leaf nodes
 */
function resolveUrlParamValue(
  urlParamName: string,
  params: Record<string, string | number | null>
): string | number | "leaf" {
  if (urlParamName === "leaf") {
    return "leaf";
  }
  
  const value = params[urlParamName];
  return value ?? "leaf"; // Fallback to "leaf" if parameter not found
}

// === DEFAULT CHILD RESOLUTION =======================================================================================

/**
 * Resolves defaultChild string reference to actual RuntimeHierarchyTreeNode
 * This function is used during activeLevel determination
 * 
 * @param node The runtime node that may have a defaultChild
 * @returns The resolved child node or null if not found/applicable
 */
export function resolveDefaultChild(node: RuntimeHierarchyTreeNode): RuntimeHierarchyTreeNode | null {
  // Check if node has a defaultChild defined in its original static structure
  // Note: defaultChild is lost during runtime conversion, so we need a different approach
  // For now, we'll use the first child as fallback, but this should be enhanced
  
  if (!node.children || node.children.length === 0) {
    return null;
  }
  
  // TODO: Enhance this to properly resolve defaultChild from static configuration
  // For now, return first child as a reasonable default
  return node.children[0];
}

/**
 * Enhanced version that takes the original static node for proper defaultChild resolution
 * 
 * @param runtimeNode The runtime node
 * @param staticNode The original static node with defaultChild information
 * @returns The resolved default child node or null
 */
export function resolveDefaultChildFromStatic(
  runtimeNode: RuntimeHierarchyTreeNode,
  staticNode: HierarchyTreeNode<any, any>
): RuntimeHierarchyTreeNode | null {
  if (!staticNode.defaultChild || !runtimeNode.children) {
    return null;
  }
  
  // Find the child node with matching key
  const defaultChild = runtimeNode.children.find(child => 
    child.item.key === staticNode.defaultChild
  );
  
  if (!defaultChild) {
    console.warn(`Default child "${staticNode.defaultChild}" not found in runtime node "${runtimeNode.item.key}"`);
    return null;
  }
  
  return defaultChild;
}

// === LEVEL INITIALIZATION (EXISTING FUNCTION - UPDATED FOR RUNTIME TREES) ==========================================

/**
 * Recursively sets the level property on all nodes in a runtime hierarchy tree
 * This ensures that each node has the correct level for NavigationState logic
 * 
 * Level meanings:
 * - Level 0: Root node (e.g., "suppliers")  
 * - Level 1: First child level (e.g., "categories")
 * - Level 2: Second child level (e.g., "offerings") 
 * - Level 3+: Deeper child levels (e.g., "attributes", "links")
 * 
 * @param tree The runtime hierarchy tree to process
 * @returns The same tree with levels properly set on all nodes
 */
export function initLevels(tree: RuntimeHierarchyTree): RuntimeHierarchyTree {
  /**
   * Recursively sets levels starting from the given node
   * 
   * @param node The current node to set level for
   * @param level The level to assign to this node
   */
  function setNodeLevels(node: RuntimeHierarchyTreeNode, level: number): void {
    // Set the level on this node's item
    node.item.level = level;
    
    // Recursively set levels on all children (if any)
    if (node.children && node.children.length > 0) {
      for (const childNode of node.children) {
        setNodeLevels(childNode, level + 1);
      }
    }
  }
  
  // Start setting levels from the root node at level 0
  setNodeLevels(tree.rootItem, 0);
  
  return tree;
}

// === URL BUILDING UTILITIES (EXISTING FUNCTIONS - WORK WITH RUNTIME TREES) =============================================

/**
 * Builds a URL path from a navigation path using runtime hierarchy nodes
 * Uses the urlParamValue properties to determine parameter values
 * 
 * @param navigationPath Array of runtime nodes representing the navigation path
 * @returns Complete URL path string
 * 
 * @example
 * // navigationPath = [suppliersNode, categoriesNode, offeringsNode]
 * // with urlParamValues = [3, 5, 9]
 * // → "/suppliers/3/categories/5/offerings/9"
 */
export function buildUrlFromNavigationPath(navigationPath: RuntimeHierarchyTreeNode[]): string {
  if (navigationPath.length === 0) {
    return "/";
  }
  
  const urlSegments: string[] = [];
  
  // Build URL by traversing the navigation path
  for (const node of navigationPath) {
    const segment = node.item.key; // e.g., "suppliers", "categories"
    const urlParamValue = node.item.urlParamValue; // e.g., 3, 5, 9
    
    // Add the segment (e.g., "suppliers")
    urlSegments.push(segment);
    
    // Add the parameter value if it's not a leaf
    if (urlParamValue !== "leaf") {
      urlSegments.push(String(urlParamValue));
    }
  }
  
  return "/" + urlSegments.join("/");
}

/**
 * Builds an href for a specific node based on current navigation context
 * This creates a URL that represents navigating to the level of the given node
 * while preserving context from higher levels
 * 
 * @param targetNode The node to build an href for
 * @param currentNavigationPath The current navigation path for context
 * @returns href string for the target node
 * 
 * @example
 * // User is at: /suppliers/3/categories/5/offerings/9
 * // buildHrefForNode(categoriesNode, currentPath) 
 * // → "/suppliers/3/categories/5" (preserves context up to categories level)
 */
export function buildHrefForNode(
  targetNode: RuntimeHierarchyTreeNode,
  currentNavigationPath: RuntimeHierarchyTreeNode[]
): string {
  const targetLevel = targetNode.item.level ?? 0;
  
  // Build path up to and including the target level
  const pathToTarget = currentNavigationPath.slice(0, targetLevel);
  
  // Add the target node at its level
  pathToTarget.push(targetNode);
  
  return buildUrlFromNavigationPath(pathToTarget);
}

// === NODE UTILITIES (EXISTING FUNCTIONS - UPDATED FOR RUNTIME TREES) ===============================================

/**
 * Finds a node in the runtime hierarchy by key and level
 * Used to locate nodes that correspond to URL parameters
 * 
 * @param tree The runtime tree to search in
 * @param key The key to search for
 * @param level The level to search at
 * @returns The found node or null
 */
export function findNodeInTree(
  tree: RuntimeHierarchyTree, 
  key: string, 
  level: number
): RuntimeHierarchyTreeNode | null {
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
 * Finds a node at a specific level in the hierarchy
 * Assumes a linear hierarchy structure (first child at each level)
 * 
 * @param tree The runtime tree to search in
 * @param targetLevel The level to find a node at
 * @returns The node at that level or null
 */
export function findNodeAtLevel(
  tree: RuntimeHierarchyTree, 
  targetLevel: number
): RuntimeHierarchyTreeNode | null {
  function searchAtLevel(node: RuntimeHierarchyTreeNode, currentLevel: number): RuntimeHierarchyTreeNode | null {
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

// === DYNAMIC DISABLED STATE CALCULATION =============================================================================

/**
 * Updates the disabled state of all nodes in a runtime tree based on navigation context
 * This is called after URL parsing to set proper enabled/disabled states
 * 
 * @param tree The runtime tree to update
 * @param navigationPath The current navigation path with parameter values
 * @returns The updated tree with proper disabled states
 */
export function updateDisabledStates(
  tree: RuntimeHierarchyTree,
  navigationPath: RuntimeHierarchyTreeNode[]
): RuntimeHierarchyTree {
  function updateNodeDisabledState(node: RuntimeHierarchyTreeNode, pathIndex: number): void {
    // Node is enabled if:
    // 1. It's in the current navigation path (has a parameter value)
    // 2. It's a direct child of a node in the navigation path
    // 3. It's a leaf node with a parent that has parameters
    
    const nodeLevel = node.item.level ?? 0;
    const hasParameterAtLevel = pathIndex < navigationPath.length && 
                               navigationPath[pathIndex]?.item.level === nodeLevel;
    
    if (hasParameterAtLevel) {
      // Node is in the navigation path - enabled
      node.item.disabled = false;
    } else if (nodeLevel <= navigationPath.length) {
      // Node is at or below the navigation depth - potentially enabled
      node.item.disabled = false;
    } else {
      // Node is beyond current navigation depth - disabled
      node.item.disabled = true;
    }
    
    // Recursively update children
    if (node.children) {
      for (const child of node.children) {
        updateNodeDisabledState(child, pathIndex);
      }
    }
  }
  
  updateNodeDisabledState(tree.rootItem, 0);
  return tree;
}

// === VALIDATION UTILITIES ===========================================================================================

/**
 * Validates that a runtime tree has proper structure and values
 * Used for development debugging and testing
 * 
 * @param tree The runtime tree to validate
 * @returns Validation result with any errors found
 */
export function validateRuntimeTree(tree: RuntimeHierarchyTree): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  function validateNode(node: RuntimeHierarchyTreeNode, path: string): void {
    // Check required properties
    if (!node.item.key) {
      errors.push(`${path}: Missing key`);
    }
    
    if (!node.item.label) {
      errors.push(`${path}: Missing label`);
    }
    
    if (node.item.level === undefined) {
      errors.push(`${path}: Missing level`);
    }
    
    if (!node.item.urlParamValue) {
      errors.push(`${path}: Missing urlParamValue`);
    }
    
    // Validate children
    if (node.children) {
      node.children.forEach((child, index) => {
        validateNode(child, `${path}.children[${index}]`);
      });
    }
  }
  
  validateNode(tree.rootItem, `${tree.name}.rootItem`);
  
  return {
    isValid: errors.length === 0,
    errors
  };
}