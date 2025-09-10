import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { HierarchyTree, HierarchyTreeNode, Hierarchy } from '$lib/components/sidebarAndNav/HierarchySidebar.types';

// === TYPES ====================================================================================

/**
 * Represents the current navigation state for hierarchy trees
 * Contains object references to the active tree and path through it
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
  
  /** Map storing paths for all trees to preserve context when switching */
  treePaths: Map<string, HierarchyTreeNode[]>;
}

/**
 * Serializable version of NavigationState for sessionStorage persistence
 * Uses tree names and node keys instead of object references
 */
interface SerializableNavigationState {
  activeTreeName: string | null;
  activePath: string[]; // node keys in order
  treePaths: Record<string, string[]>; // tree name -> array of node keys
}

// === INITIAL STATE ============================================================================

const initialState: NavigationState = {
  activeTree: null,
  activePath: [],
  treePaths: new Map()
};

// === NODE UTILITIES ============================================================================

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

// === PERSISTENCE UTILITIES ===================================================================

/**
 * Serializes NavigationState to a format suitable for sessionStorage
 * Converts object references to string identifiers that can survive page reloads
 * 
 * @param state The current NavigationState to serialize
 * @returns Serializable representation using strings instead of object refs
 */
function serializeNavigationState(state: NavigationState): SerializableNavigationState {
  const treePathsObj: Record<string, string[]> = {};
  
  // Convert Map to plain object for JSON serialization
  // Each tree path becomes an array of node keys in order
  for (const [treeName, path] of state.treePaths.entries()) {
    treePathsObj[treeName] = path.map(node => node.item.key);
  }
  
  return {
    activeTreeName: state.activeTree?.name ?? null,
    activePath: state.activePath.map(node => node.item.key),
    treePaths: treePathsObj
  };
}

/**
 * Creates a flat lookup map for all nodes in a tree
 * Groups nodes by their keys, then by their levels to handle potential duplicates
 * 
 * @param tree The tree to create a lookup map for
 * @returns Nested map: key -> level -> node
 */
function createNodeLookup(tree: HierarchyTree): Map<string, Map<number, HierarchyTreeNode>> {
  const lookup = new Map<string, Map<number, HierarchyTreeNode>>();
  
  /**
   * Recursively traverse tree and collect all nodes
   * Each node is indexed by its key and level for unique identification
   */
  function collectNodes(node: HierarchyTreeNode): void {
    const key = node.item.key;
    const level = getNodeLevel(node);
    
    // Ensure we have a map for this key
    if (!lookup.has(key)) {
      lookup.set(key, new Map());
    }
    
    // Store the node at its specific level
    lookup.get(key)!.set(level, node);
    
    // Recursively process children
    if (node.items) {
      for (const child of node.items) {
        collectNodes(child);
      }
    }
  }
  
  collectNodes(tree.rootItem);
  return lookup;
}

/**
 * Finds a node by key and level using the lookup map
 * 
 * @param lookup The node lookup map created by createNodeLookup()
 * @param key The node key to find
 * @param level The specific level to look at
 * @returns The node if found, null otherwise
 */
function findNodeByKeyAndLevel(
  lookup: Map<string, Map<number, HierarchyTreeNode>>, 
  key: string, 
  level: number
): HierarchyTreeNode | null {
  const nodesWithKey = lookup.get(key);
  if (!nodesWithKey) {
    return null;
  }
  
  return nodesWithKey.get(level) ?? null;
}

/**
 * Deserializes NavigationState from sessionStorage format
 * Resolves string keys back to actual HierarchyTreeNode object references
 * 
 * @param serialized The serialized state from sessionStorage
 * @param hierarchy The current hierarchy to resolve nodes from
 * @returns NavigationState with proper object references
 */
function deserializeNavigationState(
  serialized: SerializableNavigationState, 
  hierarchy: Hierarchy
): NavigationState {
  const treePaths = new Map<string, HierarchyTreeNode[]>();
  
  // Find the active tree by name
  const activeTree = hierarchy.find(tree => tree.name === serialized.activeTreeName) ?? null;
  
  // Restore all tree paths by resolving keys to nodes
  for (const [treeName, nodeKeys] of Object.entries(serialized.treePaths)) {
    const tree = hierarchy.find(t => t.name === treeName);
    if (tree && nodeKeys.length > 0) {
      // Resolve this tree's path
      const resolvedPath = resolveKeysToPath(tree, nodeKeys);
      if (resolvedPath.length > 0) {
        treePaths.set(treeName, resolvedPath);
      }
    }
  }
  
  // Restore active path
  const activePath = activeTree ? resolveKeysToPath(activeTree, serialized.activePath) : [];
  
  return {
    activeTree,
    activePath,
    treePaths
  };
}

/**
 * Resolves an array of node keys to actual HierarchyTreeNode references
 * Uses the assumption that keys represent a valid path through the hierarchy
 * 
 * @param tree The tree to resolve nodes from
 * @param nodeKeys Array of node keys in path order
 * @returns Array of resolved nodes (may be shorter if some keys couldn't be resolved)
 */
function resolveKeysToPath(tree: HierarchyTree, nodeKeys: string[]): HierarchyTreeNode[] {
  if (nodeKeys.length === 0) {
    return [];
  }
  
  const lookup = createNodeLookup(tree);
  const result: HierarchyTreeNode[] = [];
  
  // Resolve each key to a node at the expected level
  // Level corresponds to position in the keys array: keys[0] = level 0, keys[1] = level 1, etc.
  for (let i = 0; i < nodeKeys.length; i++) {
    const key = nodeKeys[i];
    const expectedLevel = i; // ASSUMPTION: levels are 0, 1, 2, 3...
    
    const node = findNodeByKeyAndLevel(lookup, key, expectedLevel);
    if (!node) {
      // Can't resolve this key at expected level - stop here
      // Return partial path up to this point
      break;
    }
    
    result.push(node);
  }
  
  return result;
}

// === STORE CREATION ===========================================================================

/**
 * Extended writable store interface with hierarchy initialization method
 */
interface NavigationStateStore extends Writable<NavigationState> {
  initializeFromHierarchy: (hierarchy: Hierarchy) => void;
}

/**
 * Creates a persistent navigation state store that automatically saves/restores from sessionStorage
 * The store must be initialized with a hierarchy before it can restore from storage
 * 
 * @param key The sessionStorage key to use for persistence
 * @param startValue The initial state to use before initialization
 * @returns Extended store with initialization method
 */
function createNavigationStateStore(
  key: string, 
  startValue: NavigationState
): NavigationStateStore {
  
  const store = writable<NavigationState>(startValue);
  let currentHierarchy: Hierarchy = [];
  
  // Subscribe to state changes and automatically persist to sessionStorage
  store.subscribe(state => {
    if (browser && currentHierarchy.length > 0) {
      try {
        const serialized = serializeNavigationState(state);
        window.sessionStorage.setItem(key, JSON.stringify(serialized));
      } catch (error) {
        console.warn('Failed to persist navigation state to sessionStorage:', error);
      }
    }
  });
  
  return {
    ...store,
    
    /**
     * Initialize the store from sessionStorage using the provided hierarchy
     * This must be called once the hierarchy is available (typically in +layout.ts)
     * After initialization, the store will automatically persist changes
     * 
     * @param hierarchy The current hierarchy to use for resolving stored paths
     */
    initializeFromHierarchy(hierarchy: Hierarchy): void {
      currentHierarchy = hierarchy;
      
      // Try to restore from sessionStorage
      if (browser) {
        const stored = window.sessionStorage.getItem(key);
        if (stored) {
          try {
            const serialized = JSON.parse(stored) as SerializableNavigationState;
            const deserialized = deserializeNavigationState(serialized, hierarchy);
            store.set(deserialized);
            return;
          } catch (error) {
            console.warn('Failed to restore navigation state from sessionStorage:', error);
          }
        }
      }
      
      // Fallback to initial state if restoration fails
      store.set(startValue);
    }
  };
}

// === EXPORTED STORE ===========================================================================

export const navigationState = createNavigationStateStore('sb:hierarchyNavigationState', initialState);

// === HELPER FUNCTIONS =========================================================================

/**
 * Core navigation function: selects a node with context preservation logic
 * This implements the same logic as the original +layout.ts but in a generic way
 * 
 * CONTEXT PRESERVATION RULES:
 * 1. If clicking the same node that's already at that level → preserve deeper context (no change)
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
      console.warn('No active tree - cannot select node');
      return state;
    }
    
    const currentPath = [...state.activePath];
    const nodeLevel = getNodeLevel(node);
    
    // CASE 1: Node is at an existing level in the current path
    if (nodeLevel < currentPath.length) {
      const existingNodeAtLevel = currentPath[nodeLevel];
      
      // CASE 1A: Same node at same level → preserve deeper context
      if (nodesEqual(existingNodeAtLevel, node)) {
        // No change needed - user clicked the same node they're already at
        // This preserves any deeper navigation context
        return state;
      }
      
      // CASE 1B: Different node at existing level → reset deeper levels
      else {
        // Create new path: keep everything up to this level, add new node, remove deeper levels
        const newPath = currentPath.slice(0, nodeLevel); // Keep path up to (but not including) this level
        newPath.push(node); // Add the new node at this level
        // Everything deeper is automatically removed by slice()
        
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
      console.warn(`Navigation level gap detected: current depth ${currentPath.length}, selected level ${nodeLevel}`);
      
      // Create a path up to the selected level, filling gaps if necessary
      const newPath = currentPath.slice(0, nodeLevel); // Truncate to before this level
      // Fill any gaps with nulls would be dangerous, so just add the node
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
    // Store the current path for the previously active tree (if any)
    const updatedTreePaths = new Map(state.treePaths);
    if (state.activeTree && state.activePath.length > 0) {
      updatedTreePaths.set(state.activeTree.name, [...state.activePath]);
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
    // Store current path for the previously active tree
    const updatedTreePaths = new Map(state.treePaths);
    if (state.activeTree && state.activePath.length > 0) {
      updatedTreePaths.set(state.activeTree.name, [...state.activePath]);
    }
    
    // Restore the saved path for the new tree (or start with empty path)
    const restoredPath = state.treePaths.get(tree.name) ?? [];
    
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