import { writable } from 'svelte/store';
import type { HierarchyTree, HierarchyTreeNode } from '$lib/components/sidebarAndNav/HierarchySidebar.types';
import { log } from '$lib/utils/logger';

// === TYPES ====================================================================================

/**
 * Represents the current navigation state for hierarchy trees
 * Lives in memory only - reset on browser reload
 */
export interface NavigationState {
  /** Currently active tree (null if no tree selected) */
  activeTree: HierarchyTree | null;
  
  /** 
   * Path through the active tree (from root to current position)
   * Array positions correspond to hierarchy levels: path[0] = level 0, path[1] = level 1, etc.
   * ASSUMPTION: All nodes have their levels properly set via initLevels()
   */
  activePath: HierarchyTreeNode[];
  
  /** 
   * Map storing paths for all trees to preserve context when switching
   * Key: tree.name, Value: array of nodes representing the path in that tree
   */
  treePaths: Map<string, HierarchyTreeNode[]>;
}

// === INITIAL STATE ============================================================================

const initialState: NavigationState = {
  activeTree: null,
  activePath: [],
  treePaths: new Map()
};

// === EXPORTED STORE ===========================================================================

/**
 * Simple navigation state store for hierarchy trees
 * No persistence - state is lost on browser reload
 */
export const navigationState = writable<NavigationState>(initialState);

// === UTILITY FUNCTIONS ========================================================================

/**
 * Compares two nodes for equality using both key and level
 * This ensures uniqueness even if keys are duplicated at different levels
 * 
 * @param node1 First node to compare
 * @param node2 Second node to compare
 * @returns true if both key and level match
 */
function nodesEqual(node1: HierarchyTreeNode, node2: HierarchyTreeNode): boolean {
  return node1.item.key === node2.item.key && 
         (node1.item.level ?? 0) === (node2.item.level ?? 0);
}

/**
 * Gets the hierarchy level of a node
 * ASSUMPTION: Levels are set correctly via initLevels() function
 * Levels should be: 0 (root), 1 (first child level), 2 (second child level), etc.
 * 
 * @param node The node to get the level for
 * @returns The hierarchy level (defaults to 0 if not set)
 */
function getNodeLevel(node: HierarchyTreeNode): number {
  return node.item.level ?? 0;
}

// === CORE NAVIGATION FUNCTIONS ================================================================

/**
 * Core navigation function: selects a node with context preservation logic
 * This implements the correct back-navigation and context preservation behavior
 * 
 * CONTEXT PRESERVATION RULES:
 * 1. If clicking the same node that's already at that level → navigate TO that level (back navigation)
 * 2. If clicking a different node at an existing level → reset all deeper levels  
 * 3. If extending to a new level → add the node to the path
 * 
 * ASSUMPTION: node.item.level is correctly set and corresponds to array position
 * 
 * @param node The node that was selected/clicked
 */
export function selectNode(node: HierarchyTreeNode): void {
  navigationState.update(state => {
    // Can't navigate without an active tree
    if (!state.activeTree) {
      log.error('No active tree - cannot select node');
      return state;
    }
    
    const currentPath = [...state.activePath];
    const nodeLevel = getNodeLevel(node);
    
    // CASE 1: Node is at an existing level in the current path
    if (nodeLevel < currentPath.length) {
      const existingNodeAtLevel = currentPath[nodeLevel];
      
      // CASE 1A: Same node at same level → navigate TO this level (back navigation)
      if (nodesEqual(existingNodeAtLevel, node)) {
        // User clicked a level they're already at - truncate to that level
        // This enables back navigation: /suppliers/3/categories/5 → click "suppliers" → /suppliers/3
        const newPath = currentPath.slice(0, nodeLevel + 1);
        
        log.debug(`Back navigation to level ${nodeLevel}, truncating deeper levels`);
        
        // Update the tree paths map to remember this change
        const updatedTreePaths = new Map(state.treePaths);
        updatedTreePaths.set(state.activeTree.name, newPath);
        
        return {
          ...state,
          activePath: newPath,
          treePaths: updatedTreePaths
        };
      }
      
      // CASE 1B: Different node at existing level → reset deeper levels
      else {
        // Create new path: keep everything up to this level, add new node, remove deeper levels
        const newPath = currentPath.slice(0, nodeLevel); // Keep path up to (but not including) this level
        newPath.push(node); // Add the new node at this level
        // Everything deeper is automatically removed by slice()
        
        log.debug(`Different node at level ${nodeLevel}, resetting deeper levels`);
        
        // Update the tree paths map to remember this change
        const updatedTreePaths = new Map(state.treePaths);
        updatedTreePaths.set(state.activeTree.name, newPath);
        
        return {
          ...state,
          activePath: newPath,
          treePaths: updatedTreePaths
        };
      }
    }
    
    // CASE 2: Node extends the path to a new level
    else if (nodeLevel === currentPath.length) {
      // User is navigating deeper - add this node to the end of the path
      const newPath = [...currentPath, node];
      
      log.debug(`Extending path to level ${nodeLevel}`);
      
      // Update the tree paths map
      const updatedTreePaths = new Map(state.treePaths);
      updatedTreePaths.set(state.activeTree.name, newPath);
      
      return {
        ...state,
        activePath: newPath,
        treePaths: updatedTreePaths
      };
    }
    
    // CASE 3: Gap in levels (shouldn't happen with proper UI, but handle gracefully)
    else {
      log.error(`Navigation level gap detected: current depth ${currentPath.length}, selected level ${nodeLevel}`);
      
      // Create a path up to the selected level
      // Fill missing levels would be dangerous, so just truncate and add the node
      const newPath = currentPath.slice(0, nodeLevel);
      newPath.push(node);
      
      const updatedTreePaths = new Map(state.treePaths);
      updatedTreePaths.set(state.activeTree.name, newPath);
      
      return {
        ...state,
        activePath: newPath,
        treePaths: updatedTreePaths
      };
    }
  });
}

/**
 * Sets the active tree and optionally a specific path within it
 * Used when switching between different trees or setting an initial navigation state
 * 
 * @param tree The tree to make active
 * @param path Optional path to set within the tree (defaults to empty)
 */
export function setActiveTreePath(tree: HierarchyTree, path: HierarchyTreeNode[] = []): void {
  navigationState.update(state => {
    log.debug(`Setting active tree: ${tree.name}, path length: ${path.length}`);
    
    // Store the current path for the previously active tree (if any)
    const updatedTreePaths = new Map(state.treePaths);
    if (state.activeTree && state.activePath.length > 0) {
      updatedTreePaths.set(state.activeTree.name, [...state.activePath]);
      log.debug(`Stored path for previous tree: ${state.activeTree.name}`);
    }
    
    return {
      ...state,
      activeTree: tree,
      activePath: [...path],
      treePaths: updatedTreePaths
    };
  });
}

/**
 * Switches to a different tree, restoring its previously saved path if available
 * This allows users to switch between trees without losing their navigation context
 * 
 * @param tree The tree to switch to
 */
export function switchToTree(tree: HierarchyTree): void {
  navigationState.update(state => {
    log.debug(`Switching to tree: ${tree.name}`);
    
    // Store current path for the previously active tree
    const updatedTreePaths = new Map(state.treePaths);
    if (state.activeTree && state.activePath.length > 0) {
      updatedTreePaths.set(state.activeTree.name, [...state.activePath]);
      log.debug(`Stored path for previous tree: ${state.activeTree.name}, depth: ${state.activePath.length}`);
    }
    
    // Restore the saved path for the new tree (or start with empty path)
    const restoredPath = state.treePaths.get(tree.name) ?? [];
    log.debug(`Restored path for new tree: ${tree.name}, depth: ${restoredPath.length}`);
    
    return {
      ...state,
      activeTree: tree,
      activePath: restoredPath,
      treePaths: updatedTreePaths
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

// === QUERY FUNCTIONS ==========================================================================

/**
 * Gets the currently active node (the deepest node in the active path)
 * Returns null if no path is currently active
 * 
 * @param state The current navigation state
 * @returns The active node or null
 */
export function getCurrentActiveNode(state: NavigationState): HierarchyTreeNode | null {
  return state.activePath.length > 0 
    ? state.activePath[state.activePath.length - 1] 
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
export function isNodeInActivePath(state: NavigationState, node: HierarchyTreeNode): boolean {
  return state.activePath.some(pathNode => nodesEqual(pathNode, node));
}

/**
 * Gets the node at a specific level in the active path
 * Returns null if the path doesn't reach that deep
 * 
 * @param state The current navigation state
 * @param level The level to get the node for (0 = root, 1 = first child level, etc.)
 * @returns The node at that level or null
 */
export function getNodeAtLevel(state: NavigationState, level: number): HierarchyTreeNode | null {
  return level < state.activePath.length ? state.activePath[level] : null;
}

/**
 * Gets the current navigation depth (number of levels deep in the active path)
 * 
 * @param state The current navigation state
 * @returns The depth (0 = no active path, 1 = root only, etc.)
 */
export function getNavigationDepth(state: NavigationState): number {
  return state.activePath.length;
}

/**
 * Gets all stored tree paths for debugging purposes
 * 
 * @param state The current navigation state
 * @returns Object with tree names as keys and path info as values
 */
export function getStoredTreePaths(state: NavigationState): Record<string, { depth: number; lastNode: string | null }> {
  const result: Record<string, { depth: number; lastNode: string | null }> = {};
  
  for (const [treeName, path] of state.treePaths.entries()) {
    result[treeName] = {
      depth: path.length,
      lastNode: path.length > 0 ? path[path.length - 1].item.key : null
    };
  }
  
  return result;
}