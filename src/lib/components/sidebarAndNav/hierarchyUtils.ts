import type { HierarchyTree, HierarchyTreeNode } from '$lib/components/sidebarAndNav/HierarchySidebar.types';

// === LEVEL INITIALIZATION UTILITY =============================================================

/**
 * Recursively sets the level property on all nodes in a hierarchy tree
 * This ensures that each node has the correct level for the NavigationState logic
 * 
 * Level meanings:
 * - Level 0: Root node (e.g., "suppliers")  
 * - Level 1: First child level (e.g., "categories")
 * - Level 2: Second child level (e.g., "offerings") 
 * - Level 3+: Deeper child levels (e.g., "attributes", "links")
 * 
 * @param tree The hierarchy tree to process
 * @returns The same tree with levels properly set on all nodes
 */
export function initLevels(tree: HierarchyTree): HierarchyTree {
  /**
   * Recursively sets levels starting from the given node
   * 
   * @param node The current node to set level for
   * @param level The level to assign to this node
   */
  function setNodeLevels(node: HierarchyTreeNode, level: number): void {
    // Set the level on this node's item
    node.item.level = level;
    
    // Recursively set levels on all children (if any)
    if (node.items && node.items.length > 0) {
      for (const childNode of node.items) {
        setNodeLevels(childNode, level + 1);
      }
    }
  }
  
  // Start setting levels from the root node at level 0
  setNodeLevels(tree.rootItem, 0);
  
  return tree;
}

// === URL BUILDING UTILITIES ===================================================================

/**
 * Builds a URL path from a navigation path using the hierarchy structure
 * Uses the urlParamName properties to determine parameter names
 * 
 * @param navigationPath Array of nodes representing the navigation path
 * @param urlParams Object containing the parameter values (supplierId, categoryId, etc.)
 * @returns Complete URL path string
 * 
 * @example
 * // navigationPath = [suppliersNode, categoriesNode, offeringsNode]
 * // urlParams = { supplierId: 123, categoryId: 456, offeringId: 789 }
 * // → "/suppliers/123/categories/456/offerings/789"
 */
export function buildUrlFromNavigationPath(
  navigationPath: HierarchyTreeNode[],
  urlParams: Record<string, string | number | null>
): string {
  if (navigationPath.length === 0) {
    return "/";
  }
  
  const urlSegments: string[] = [];
  
  // Build URL by traversing the navigation path
  for (const node of navigationPath) {
    const segment = node.item.key; // e.g., "suppliers", "categories"
    const urlParamName = node.item.urlParamName; // e.g., "supplierId", "categoryId"
    
    // Add the segment (e.g., "suppliers")
    urlSegments.push(segment);
    
    // Add the parameter value if available and if this node expects one
    if (urlParamName && urlParams[urlParamName] !== undefined && urlParams[urlParamName] !== null) {
      urlSegments.push(String(urlParams[urlParamName]));
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
 * @param urlParams Current URL parameters
 * @returns href string for the target node
 * 
 * @example
 * // User is at: /suppliers/123/categories/456/offerings/789
 * // buildHrefForNode(categoriesNode, currentPath, urlParams) 
 * // → "/suppliers/123/categories/456" (preserves context up to categories level)
 */
export function buildHrefForNode(
  targetNode: HierarchyTreeNode,
  currentNavigationPath: HierarchyTreeNode[],
  urlParams: Record<string, string | number | null>
): string {
  const targetLevel = targetNode.item.level ?? 0;
  
  // Build path up to and including the target level
  const pathToTarget = currentNavigationPath.slice(0, targetLevel);
  
  // Add the target node at its level
  pathToTarget.push(targetNode);
  
  return buildUrlFromNavigationPath(pathToTarget, urlParams);
}

// === NODE UTILITIES =============================================================================

/**
 * Finds a node in the hierarchy by key and level
 * Used to locate nodes that correspond to URL parameters
 */
export function findNodeInTree(tree: HierarchyTree, key: string, level: number): HierarchyTreeNode | null {
  function searchNode(node: HierarchyTreeNode): HierarchyTreeNode | null {
    if (node.item.key === key && (node.item.level ?? 0) === level) {
      return node;
    }
    
    if (node.items) {
      for (const child of node.items) {
        const found = searchNode(child);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  return searchNode(tree.rootItem);
}