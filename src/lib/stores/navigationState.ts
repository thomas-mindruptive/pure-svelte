import { writable } from 'svelte/store';
import type { HierarchyTree, RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from '$lib/components/sidebarAndNav/HierarchySidebar.types';
import { log } from '$lib/utils/logger';

// ================================================================================================
// NAVIGATION STATE ARCHITECTURE & FLOW DOCUMENTATION
// ================================================================================================

/**
 * TERM DEFINITIONS:
 * 
 * 1. **URL/Route** - Browser address bar, determines which Page Component is loaded
 * 2. **NavigationContext** - Stored parameter IDs in RuntimeHierarchyTreeNode[].urlParamValue  
 * 3. **Navigation** - URL change that triggers +layout.ts load()
 * 4. **Level/Tier** - Hierarchy level in sidebar (0=suppliers, 1=categories, etc.)
 * 5. **Context Preservation** - NavigationContext remains unchanged despite URL change
 * 6. **Context Reset** - NavigationContext is overwritten, only when different element on same level
 * 
 * CORE NAVIGATION FLOW EXAMPLES:
 * 
 * 1. "Select Level N" (supplier 3, navigation tree: "suppliers"):
 *    - URL: `/suppliers/3`
 *    - activeTree.paths: `[{node: suppliersNode, item.urlParamValue: 3}]`
 * 
 * 2. "Click N+1" (categories 5, navigation tree: "offerings"):
 *    - URL: `/suppliers/3/categories/5`
 *    - activeTree.paths: `[{node: suppliersNode, urlParamValue: 3}, {node: categoriesNode, urlParamValue: 5}]`
 * 
 * 3. "Click back to N" (supplier 3, navigation tree: "categories"):
 *    - URL: `/suppliers/3
 *    - activeTree.paths: `[{...}, {...}]` (REMAINS unchanged)
 *    - This is Context Preservation => the navigation tree "underneeth" stays aktivated. 
 * 
 * 3.a. "Click N+1" again (categories 5, navigation tree: "offerings"):
 *    - URL: `/suppliers/3/categories/5
 *    - activeTree.paths: `[{...}, {...}]` (REMAINS unchanged)
 *    - This is Context Preservation => the navigation tree "underneeth" stays aktivated. 
 * 
 * 4. "Select new object at Level N" (supplier 7):
 *    - URL: `/suppliers/7`
 *    - activeTree.paths: `[{node: suppliersNode, urlParamValue: 7}]`
 *    - category path element disappears from paths → Context Reset atglevel N
 * 
 *    5. "Reset everything from N+1":
 *       - All paths entries with level > N are removed
 *       - Only supplier 7 remains, categories+offerings path elements gone
 * 
 * 4a. "Select new object at Level N+1" (supplier 5 stays the same, category 8 is new):
 *    - URL: `/suppliers/7/categories/8`
 *    - activeTree.paths: `[{node: suppliersNode, urlParamValue: 5}, {node: categoriesNode, urlParamValue: 8}]`
 *    - Supplier 5 + category 8 remain in activeTree.paths, potentially existing offerings path elements gone  → Context Reset at level N+1 
 * 
 *    5a. "Reset everything from N+1":
 *       - All paths entries with level > N are removed
 *       - Only supplier 7 remains, categories+offerings gone
 * 
 * SELECTNODE() LOGIC RULES:
 * - Same entity/object clicked in UI (e.g. "suppliers/5" through the SuppliersListPage) = Context Preservation (no change to NavigationContext)
 * - Different entity/object clicked in UI = Context Reset for deeper levels only
 * - Navigation always follows, but NavigationContext may or may not change
 */

// ================================================================================================
// TYPES
// ================================================================================================

/**
 * Navigation state for a specific tree, containing both the tree structure
 * and the current navigation path with parameter values
 */
export type NavigationPathTree = {
  tree: RuntimeHierarchyTree;
  paths: RuntimeHierarchyTreeNode[];
}

/**
 * Complete navigation state for the application
 * Supports multiple trees with independent navigation contexts
 */
export interface NavigationState {
  /** Currently active tree (null if no tree selected) */
  activeTree: NavigationPathTree | null;
  
  /** 
   * Map storing NavigationPathTrees for all trees to preserve context when switching
   * Key: HierarchyTree object reference, Value: NavigationPathTree for that tree
   */
  allTrees: Map<HierarchyTree, NavigationPathTree>;
}

// ================================================================================================
// INITIAL STATE
// ================================================================================================

const initialState: NavigationState = {
  activeTree: null,
  allTrees: new Map()
};

// ================================================================================================
// EXPORTED STORE
// ================================================================================================

/**
 * Navigation state store for hierarchy trees with runtime parameter support
 * Handles context preservation and multi-tree navigation
 */
export const navigationState = writable<NavigationState>(initialState);

// ================================================================================================
// UTILITY FUNCTIONS
// ================================================================================================

/**
 * Compares two nodes for equality using both key and level
 * This ensures uniqueness even if keys are duplicated at different levels
 * 
 * @param node1 First node to compare
 * @param node2 Second node to compare
 * @returns true if both key and level match
 */
function nodesEqual(node1: RuntimeHierarchyTreeNode, node2: RuntimeHierarchyTreeNode): boolean {
  return node1.item.key === node2.item.key && 
         (node1.item.level ?? 0) === (node2.item.level ?? 0);
}

/**
 * Gets the hierarchy level of a node
 * Levels should be set correctly via initLevels() function
 * Levels are: 0 (root), 1 (first child level), 2 (second child level), etc.
 * 
 * @param node The node to get the level for
 * @returns The hierarchy level (defaults to 0 if not set)
 */
function getNodeLevel(node: RuntimeHierarchyTreeNode): number {
  return node.item.level ?? 0;
}

// ================================================================================================
// CORE NAVIGATION FUNCTIONS
// ================================================================================================

/**
 * Core navigation function: selects a node with context preservation logic
 * Implements the correct navigation behavior based on the flow documentation above
 * 
 * CONTEXT PRESERVATION RULES:
 * 1. If clicking the same node that's already at that level → Context Preservation (no change)
 * 2. If clicking a different entity at an existing level  (e.g. select new "supplier") → Context Reset for deeper levels
 * 3. If extending to a new level → add the node to the path
 * 
 * @param node The node that was selected/clicked
 */
export function selectNode(node: RuntimeHierarchyTreeNode): void {
  navigationState.update(state => {
    // Can't navigate without an active tree
    if (!state.activeTree) {
      log.error('No active tree - cannot select node');
      return state;
    }
    
    const currentPath = [...state.activeTree.paths];
    const nodeLevel = getNodeLevel(node);
    
    // CASE 1: Node is at an existing level in the current path
    if (nodeLevel < currentPath.length) {
      const existingNodeAtLevel = currentPath[nodeLevel];
      
      // CASE 1A: Same node at same level → Context Preservation
      if (nodesEqual(existingNodeAtLevel, node)) {
        // User clicked a level they're already at - preserve all context
        // This is the core Context Preservation behavior
        log.debug(`Context preservation for level ${nodeLevel}, no changes made`);
        return state; // No changes to NavigationContext
      }
      
      // CASE 1B: Different node at existing level → Context Reset for deeper levels
      else {
        // Create new path: keep everything up to this level, add new node, remove deeper levels
        const newPath = currentPath.slice(0, nodeLevel); // Keep path up to (but not including) this level
        newPath.push(node); // Add the new node at this level
        // Everything deeper is automatically removed by slice()
        
        log.debug(`Different node at level ${nodeLevel}, resetting deeper levels`);
        
        // Update the tree context
        const updatedActiveTree = {
          ...state.activeTree,
          paths: newPath
        };
        
        // Update the tree paths map
        const updatedAllTrees = new Map(state.allTrees);
        updatedAllTrees.set(state.activeTree.tree, updatedActiveTree);
        
        return {
          ...state,
          activeTree: updatedActiveTree,
          allTrees: updatedAllTrees
        };
      }
    }
    
    // CASE 2: Node extends the path to a new level
    else if (nodeLevel === currentPath.length) {
      // User is navigating deeper - add this node to the end of the path
      const newPath = [...currentPath, node];
      
      log.debug(`Extending path to level ${nodeLevel}`);
      
      // Update the tree context
      const updatedActiveTree = {
        ...state.activeTree,
        paths: newPath
      };
      
      // Update the tree paths map
      const updatedAllTrees = new Map(state.allTrees);
      updatedAllTrees.set(state.activeTree.tree, updatedActiveTree);
      
      return {
        ...state,
        activeTree: updatedActiveTree,
        allTrees: updatedAllTrees
      };
    }
    
    // CASE 3: Gap in levels (shouldn't happen with proper UI, but handle gracefully)
    else {
      log.error(`Navigation level gap detected: current depth ${currentPath.length}, selected level ${nodeLevel}`);
      
      // Create a path up to the selected level
      const newPath = currentPath.slice(0, nodeLevel);
      newPath.push(node);
      
      const updatedActiveTree = {
        ...state.activeTree,
        paths: newPath
      };
      
      const updatedAllTrees = new Map(state.allTrees);
      updatedAllTrees.set(state.activeTree.tree, updatedActiveTree);
      
      return {
        ...state,
        activeTree: updatedActiveTree,
        allTrees: updatedAllTrees
      };
    }
  });
}

/**
 * Sets the active tree and optionally a specific path within it
 * Used when switching between different trees or setting an initial navigation state
 * 
 * @param tree The RuntimeHierarchyTree to make active
 * @param paths Optional paths to set within the tree (defaults to empty)
 */
export function setActiveTreePath(tree: RuntimeHierarchyTree, paths: RuntimeHierarchyTreeNode[] = []): void {
  navigationState.update(state => {
    log.debug(`Setting active tree: ${tree.name}, paths length: ${paths.length}`);
    
    // Store the current tree state (if any)
    const updatedAllTrees = new Map(state.allTrees);
    if (state.activeTree) {
      updatedAllTrees.set(state.activeTree.tree, state.activeTree);
      log.debug(`Stored state for previous tree: ${state.activeTree.tree.name}`);
    }
    
    // Create NavigationPathTree for the new active tree
    const newActiveTree: NavigationPathTree = {
      tree,
      paths: [...paths]
    };
    
    return {
      ...state,
      activeTree: newActiveTree,
      allTrees: updatedAllTrees
    };
  });
}

/**
 * Switches to a different tree, restoring its previously saved path if available
 * This allows users to switch between trees without losing their navigation context
 * 
 * @param staticTree The static HierarchyTree to switch to (used as key for lookup)
 */
export function switchToTree(staticTree: HierarchyTree): void {
  navigationState.update(state => {
    log.debug(`Switching to tree: ${staticTree.name}`);
    
    // Store current tree state
    const updatedAllTrees = new Map(state.allTrees);
    if (state.activeTree) {
      updatedAllTrees.set(state.activeTree.tree, state.activeTree);
      log.debug(`Stored state for previous tree: ${state.activeTree.tree.name}, paths: ${state.activeTree.paths.length}`);
    }
    
    // Restore the saved state for the new tree (or create empty if none exists)
    const restoredTree = state.allTrees.get(staticTree);
    log.debug(`Restored state for new tree: ${staticTree.name}, paths: ${restoredTree?.paths.length ?? 0}`);
    
    return {
      ...state,
      activeTree: restoredTree || null,
      allTrees: updatedAllTrees
    };
  });
}

/**
 * Resets the navigation state completely
 * Clears all trees, paths, and stored context
 */
export function resetNavigationState(): void {
  log.debug('⚠️ Resetting navigation state');
  navigationState.set(initialState);
}

// ================================================================================================
// QUERY FUNCTIONS
// ================================================================================================

/**
 * Gets the currently active node (the deepest node in the active path)
 * Returns null if no path is currently active
 * 
 * @param state The current navigation state
 * @returns The active node or null
 */
export function getCurrentActiveNode(state: NavigationState): RuntimeHierarchyTreeNode | null {
  return state.activeTree && state.activeTree.paths.length > 0 
    ? state.activeTree.paths[state.activeTree.paths.length - 1] 
    : null;
}

/**
 * Checks if a specific node is anywhere in the current active path
 * Useful for determining active states in UI components
 * 
 * @param state The current navigation state  
 * @param node The node to check for
 * @returns true if the node is in the active path
 */
export function isNodeInActivePath(state: NavigationState, node: RuntimeHierarchyTreeNode): boolean {
  return state.activeTree ? state.activeTree.paths.some(pathNode => nodesEqual(pathNode, node)) : false;
}

/**
 * Gets the node at a specific level in the active path
 * Returns null if the path doesn't reach that deep
 * 
 * @param state The current navigation state
 * @param level The level to get the node for (0 = root, 1 = first child level, etc.)
 * @returns The node at that level or null
 */
export function getNodeAtLevel(state: NavigationState, level: number): RuntimeHierarchyTreeNode | null {
  return state.activeTree && level < state.activeTree.paths.length 
    ? state.activeTree.paths[level] 
    : null;
}

/**
 * Gets the current navigation depth (number of levels deep in the active path)
 * 
 * @param state The current navigation state
 * @returns The depth (0 = no active path, 1 = root only, etc.)
 */
export function getNavigationDepth(state: NavigationState): number {
  return state.activeTree ? state.activeTree.paths.length : 0;
}

/**
 * Gets all stored tree paths for debugging purposes
 * 
 * @param state The current navigation state
 * @returns Object with tree names as keys and path info as values
 */
export function getStoredTreePaths(state: NavigationState): Record<string, { depth: number; lastNode: string | null }> {
  const result: Record<string, { depth: number; lastNode: string | null }> = {};
  
  for (const [tree, pathTree] of state.allTrees.entries()) {
    result[tree.name] = {
      depth: pathTree.paths.length,
      lastNode: pathTree.paths.length > 0 ? pathTree.paths[pathTree.paths.length - 1].item.key : null
    };
  }
  
  return result;
}