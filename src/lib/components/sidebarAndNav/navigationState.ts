import { writable } from 'svelte/store';
import type { 
  RuntimeHierarchyTree, 
  RuntimeHierarchyTreeNode 
} from '$lib/components/sidebarAndNav/HierarchySidebar.types';
import { log } from '$lib/utils/logger';

// === NAVIGATION STATE ARCHITECTURE & FLOW DOCUMENTATION ========================================================

/**
 * COMPREHENSIVE NAVIGATION SYSTEM DOCUMENTATION
 * 
 * This NavigationState implements the complete hierarchy navigation system as documented in status.md.
 * The system separates URL/Route from NavigationContext to enable Context Preservation during navigation.
 * 
 * =====================================================================================================
 * TERM DEFINITIONS (from status.md):
 * =====================================================================================================
 * 
 * 1. **URL/Route** - Browser address bar, determines which Page Component is loaded
 * 2. **NavigationContext** - Stored parameter IDs in `activeTree.paths[].urlParamValue`
 * 3. **Navigation** - URL change that triggers +layout.ts load()
 * 4. **Level/Tier** - Hierarchy level in sidebar (0=suppliers, 1=categories, etc.)
 * 5. **Context Preservation** - NavigationContext remains unchanged despite URL change
 * 6. **Context Reset** - NavigationContext overwritten when different entity selected on same level
 * 7. **Sidebar markiert** - UI highlight showing current position
 * 8. **Enabled tree** - Clickable sidebar elements based on NavigationContext
 * 9. **Entity Selection** - User selects specific entity in DataGrid/Liste (e.g. Supplier 3)
 * 10. **Sidebar Navigation** - User clicks level element in sidebar (e.g. "categories")
 * 11. **defaultChild** - Automatically marked child-level during Entity Selection
 * 
 * =====================================================================================================
 * CORE NAVIGATION FLOW (from navigation.readme.md examples):
 * =====================================================================================================
 * 
 * Step 2: User selects Supplier 3 (Entity Selection)
 * - URL: `/suppliers/3` (SupplierDetailPage with Categories DataGrid)
 * - NavigationContext: `[{node: suppliersNode, urlParamValue: 3}]`
 * - Sidebar marked: "categories" (automatically via defaultChild)
 * - Enabled tree: suppliers > categories, addresses
 * 
 * Step 4: User clicks "categories" in Sidebar (Back-Navigation)
 * - URL: `/suppliers/3/categories` (Categories List)
 * - NavigationContext: **UNCHANGED** (Context Preservation)
 * - Sidebar marked: "categories"
 * - Enabled tree: suppliers > categories > offerings > attributes, links + addresses
 * 
 * Step 6: User selects Supplier 7 (Entity Selection, Context Reset)
 * - URL: `/suppliers/7`
 * - NavigationContext: `[{node: suppliersNode, urlParamValue: 7}]` (Context Reset)
 * - Sidebar marked: "categories" (automatically via defaultChild)
 * - Enabled tree: suppliers > categories, addresses
 * 
 * =====================================================================================================
 * SELECTNODE() LOGIC RULES (Critical Implementation):
 * =====================================================================================================
 * 
 * The selectNode() function must distinguish between two fundamentally different user actions:
 * 
 * A) **Entity Selection** (DataGrid clicks):
 *    - Changes urlParamValue for a level
 *    - Triggers Context Reset for deeper levels if entity changed
 *    - Triggers Context Preservation if same entity
 *    - Automatic sidebar marking via defaultChild
 * 
 * B) **Sidebar Navigation** (Sidebar clicks):
 *    - No entity change, only level navigation
 *    - Always Context Preservation
 *    - URL changes but NavigationContext preserved
 * 
 * Context Preservation Rules:
 * 1. Same entity at same level → Context Preservation (no NavigationContext change)
 * 2. Different entity at same level → Context Reset for deeper levels only
 * 3. Navigation to new level → Extend NavigationContext
 * 
 * =====================================================================================================
 * ARCHITECTURE NOTES:
 * =====================================================================================================
 * 
 * This system uses RuntimeHierarchyTreeNode which contains:
 * - Static structure (key, label, level, urlParamName)
 * - Runtime values (urlParamValue, disabled state)
 * 
 * The NavigationPathTree combines:
 * - tree: RuntimeHierarchyTree (complete structure)
 * - paths: RuntimeHierarchyTreeNode[] (current navigation path with urlParamValues)
 * 
 * Multiple trees are supported via Map<RuntimeHierarchyTree, NavigationPathTree> for tree switching
 * with independent NavigationContexts per tree.
 */

// === TYPES =======================================================================================================

/**
 * Navigation state for a specific tree, containing both the tree structure
 * and the current navigation path with parameter values.
 * 
 * This represents the complete NavigationContext for one hierarchy tree.
 */
export type NavigationPathTree = {
  /** The complete runtime tree structure with urlParamValues and levels set */
  tree: RuntimeHierarchyTree;
  /** Current navigation path representing the NavigationContext with parameter IDs */
  paths: RuntimeHierarchyTreeNode[];
}

/**
 * Complete navigation state for the application.
 * Supports multiple trees with independent NavigationContexts and tree switching.
 * 
 * Memory-only design: no persistence, state reset on browser reload.
 * Uses RuntimeHierarchyTree consistently for all tree references.
 */
export interface NavigationState {
  /** Currently active tree with its NavigationContext (null if no tree selected) */
  activeTree: NavigationPathTree | null;
  
  /** 
   * Map storing NavigationPathTrees for all trees to preserve context when switching.
   * Key: RuntimeHierarchyTree object reference (consistent with NavigationPathTree.tree)
   * Value: NavigationPathTree containing runtime tree + navigation paths
   * 
   * This enables tree switching without losing NavigationContext:
   * - Switch from suppliers to products → save supplier NavigationContext
   * - Switch back to suppliers → restore supplier NavigationContext
   */
  allTrees: Map<RuntimeHierarchyTree, NavigationPathTree>;
}

// === INITIAL STATE ===========================================================================================

const initialState: NavigationState = {
  activeTree: null,
  allTrees: new Map()
};

// === EXPORTED STORE ==========================================================================================

/**
 * Navigation state store for hierarchy trees with runtime parameter support.
 * Handles Context Preservation, Context Reset, and multi-tree navigation.
 * 
 * Memory-only design provides simplicity and performance benefits:
 * - No serialization complexity
 * - No sync issues between storage and memory
 * - Fast state access and updates
 * - Acceptable trade-off: state lost on browser reload
 */
export const navigationState = writable<NavigationState>(initialState);

// === UTILITY FUNCTIONS =======================================================================================

/**
 * Compares two runtime nodes for equality using both key and level.
 * This ensures uniqueness even if keys are duplicated at different levels.
 * 
 * Used in selectNode() logic to determine if the same node was clicked.
 * 
 * @param node1 First node to compare
 * @param node2 Second node to compare
 * @returns true if both key and level match (same logical node)
 */
function nodesEqual(node1: RuntimeHierarchyTreeNode, node2: RuntimeHierarchyTreeNode): boolean {
  return node1.item.key === node2.item.key && 
         (node1.item.level ?? 0) === (node2.item.level ?? 0);
}

/**
 * Gets the hierarchy level of a runtime node.
 * Levels should be set correctly via initLevels() function in hierarchyUtils.
 * 
 * Level semantics:
 * - Level 0: Root node (e.g., "suppliers")
 * - Level 1: First child level (e.g., "categories") 
 * - Level 2: Second child level (e.g., "offerings")
 * - Level 3+: Deeper child levels (e.g., "attributes", "links")
 * 
 * @param node The runtime node to get the level for
 * @returns The hierarchy level (defaults to 0 if not set)
 */
function getNodeLevel(node: RuntimeHierarchyTreeNode): number {
  return node.item.level ?? 0;
}

/**
 * Compares urlParamValues to determine if the same entity is selected.
 * This is critical for Entity Selection vs Context Preservation logic.
 * 
 * @param existingNode Node currently in NavigationContext
 * @param newUrlParamValue New entity value being selected
 * @returns true if same entity (Context Preservation), false if different (Context Reset)
 */
function isSameEntity(existingNode: RuntimeHierarchyTreeNode, newUrlParamValue: string | number | "leaf"): boolean {
  return existingNode.item.urlParamValue === newUrlParamValue;
}

// === CORE NAVIGATION FUNCTIONS ===============================================================================

/**
 * **CRITICAL FUNCTION**: Core navigation logic implementing Context Preservation vs Context Reset.
 * 
 * This function handles both Entity Selection and Sidebar Navigation based on the flow documented
 * in status.md. The logic distinguishes between these two fundamentally different user actions.
 * 
 * =====================================================================================================
 * USAGE PATTERNS:
 * =====================================================================================================
 * 
 * A) **Entity Selection** (e.g., user clicks Supplier 3 in DataGrid):
 *    ```typescript
 *    selectNode(suppliersNode, 3); // Entity Selection with new urlParamValue
 *    ```
 * 
 * B) **Sidebar Navigation** (e.g., user clicks "categories" in sidebar):
 *    ```typescript
 *    selectNode(categoriesNode); // Sidebar Navigation, no urlParamValue change
 *    ```
 * 
 * =====================================================================================================
 * CONTEXT PRESERVATION vs CONTEXT RESET LOGIC:
 * =====================================================================================================
 * 
 * Case 1: Node at existing level in current path
 *   1A: Same entity (urlParamValue unchanged) → Context Preservation
 *   1B: Different entity (urlParamValue changed) → Context Reset for deeper levels
 * 
 * Case 2: Node extends path to new level → Add to NavigationContext
 * 
 * Case 3: Level gap (error handling) → Graceful fallback
 * 
 * @param node The RuntimeHierarchyTreeNode that was selected/clicked
 * @param newUrlParamValue Optional new entity value for Entity Selection. If not provided, 
 *                         treats as Sidebar Navigation (Context Preservation)
 */
export function selectNode(
  node: RuntimeHierarchyTreeNode, 
  newUrlParamValue?: string | number | "leaf"
): void {
  navigationState.update(state => {
    // Validation: Can't navigate without an active tree
    if (!state.activeTree) {
      log.error('NavigationState: No active tree - cannot select node');
      return state;
    }
    
    const currentPath = [...state.activeTree.paths];
    const nodeLevel = getNodeLevel(node);
    
    log.debug(`NavigationState: selectNode called`, {
      nodeKey: node.item.key,
      nodeLevel,
      newUrlParamValue,
      currentPathLength: currentPath.length,
      isEntitySelection: newUrlParamValue !== undefined
    });
    
    // =============================================================================================
    // CASE 1: Node is at an existing level in the current path
    // =============================================================================================
    if (nodeLevel < currentPath.length) {
      const existingNodeAtLevel = currentPath[nodeLevel];
      
      // CASE 1A: Sidebar Navigation (no urlParamValue provided) → Context Preservation
      if (newUrlParamValue === undefined) {
        // User clicked a sidebar element for level navigation
        // This is always Context Preservation - NavigationContext remains unchanged
        log.debug(`NavigationState: Sidebar navigation to level ${nodeLevel}, Context Preservation`);
        return state; // No changes to NavigationContext
      }
      
      // CASE 1B: Entity Selection - check if same or different entity
      else {
        // User selected an entity (e.g., clicked Supplier 7 in DataGrid)
        if (isSameEntity(existingNodeAtLevel, newUrlParamValue)) {
          // Same entity selected → Context Preservation
          log.debug(`NavigationState: Same entity selected at level ${nodeLevel}, Context Preservation`);
          return state; // No changes to NavigationContext
        } else {
          // Different entity selected → Context Reset for deeper levels
          log.debug(`NavigationState: Different entity selected at level ${nodeLevel}, Context Reset for deeper levels`);
          
          // Create updated node with new urlParamValue
          const updatedNode: RuntimeHierarchyTreeNode = {
            ...node,
            item: {
              ...node.item,
              urlParamValue: newUrlParamValue
            }
          };
          
          // Build new path: keep everything up to this level, add updated node, remove deeper levels
          const newPath = currentPath.slice(0, nodeLevel); // Keep path up to (excluding) this level
          newPath.push(updatedNode); // Add the updated node at this level
          // Everything deeper is automatically removed by slice() → Context Reset
          
          // Update the NavigationPathTree
          const updatedActiveTree: NavigationPathTree = {
            ...state.activeTree,
            paths: newPath
          };
          
          // Store the updated tree state
          const updatedAllTrees = new Map(state.allTrees);
          updatedAllTrees.set(state.activeTree.tree, updatedActiveTree);
          
          return {
            ...state,
            activeTree: updatedActiveTree,
            allTrees: updatedAllTrees
          };
        }
      }
    }
    
    // =============================================================================================
    // CASE 2: Node extends the path to a new level
    // =============================================================================================
    else if (nodeLevel === currentPath.length) {
      // User is navigating deeper into the hierarchy
      log.debug(`NavigationState: Extending path to level ${nodeLevel}`);
      
      // For new levels, we need a urlParamValue (Entity Selection)
      if (newUrlParamValue === undefined) {
        log.warn(`NavigationState: No urlParamValue provided for new level ${nodeLevel}`);
        // For Sidebar Navigation to new levels, preserve existing urlParamValue
        newUrlParamValue = node.item.urlParamValue;
      }
      
      // Create node with proper urlParamValue
      const extendedNode: RuntimeHierarchyTreeNode = {
        ...node,
        item: {
          ...node.item,
          urlParamValue: newUrlParamValue
        }
      };
      
      const newPath = [...currentPath, extendedNode];
      
      // Update the NavigationPathTree
      const updatedActiveTree: NavigationPathTree = {
        ...state.activeTree,
        paths: newPath
      };
      
      // Store the updated tree state
      const updatedAllTrees = new Map(state.allTrees);
      updatedAllTrees.set(state.activeTree.tree, updatedActiveTree);
      
      return {
        ...state,
        activeTree: updatedActiveTree,
        allTrees: updatedAllTrees
      };
    }
    
    // =============================================================================================
    // CASE 3: Gap in levels (error handling - shouldn't happen with proper UI)
    // =============================================================================================
    else {
      log.error(`NavigationState: Level gap detected - current depth ${currentPath.length}, selected level ${nodeLevel}`);
      
      // Graceful fallback: create path up to selected level
      const newPath = currentPath.slice(0, nodeLevel);
      
      const gapFillerNode: RuntimeHierarchyTreeNode = {
        ...node,
        item: {
          ...node.item,
          urlParamValue: newUrlParamValue ?? node.item.urlParamValue
        }
      };
      
      newPath.push(gapFillerNode);
      
      const updatedActiveTree: NavigationPathTree = {
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
 * Sets the active tree and optionally a specific path within it.
 * Used during initial navigation state setup and tree switching.
 * 
 * This function is called from +layout.ts after URL parsing to establish
 * the NavigationContext based on the current route.
 * 
 * @param runtimeTree The RuntimeHierarchyTree to make active
 * @param paths Optional paths to set within the tree (defaults to empty)
 */
export function setActiveTreePath(runtimeTree: RuntimeHierarchyTree, paths: RuntimeHierarchyTreeNode[] = []): void {
  navigationState.update(state => {
    log.debug(`NavigationState: Setting active tree: ${runtimeTree.name}, paths length: ${paths.length}`);
    
    // Store the current tree state before switching (if any)
    const updatedAllTrees = new Map(state.allTrees);
    if (state.activeTree) {
      updatedAllTrees.set(state.activeTree.tree, state.activeTree);
      log.debug(`NavigationState: Stored state for previous tree: ${state.activeTree.tree.name}`);
    }
    
    // Create NavigationPathTree for the new active tree
    const newActiveTree: NavigationPathTree = {
      tree: runtimeTree,
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
 * Switches to a different tree, restoring its previously saved NavigationContext if available.
 * This enables seamless multi-tree navigation without losing context.
 * 
 * Example: User switches from supplier hierarchy to product hierarchy, then back to suppliers.
 * The supplier NavigationContext (e.g., Supplier 3, Category 5) is preserved and restored.
 * 
 * @param runtimeTree The RuntimeHierarchyTree to switch to (used as Map key for lookup)
 */
export function switchToTree(runtimeTree: RuntimeHierarchyTree): void {
  navigationState.update(state => {
    log.debug(`NavigationState: Switching to tree: ${runtimeTree.name}`);
    
    // Store current tree state before switching
    const updatedAllTrees = new Map(state.allTrees);
    if (state.activeTree) {
      updatedAllTrees.set(state.activeTree.tree, state.activeTree);
      log.debug(`NavigationState: Stored state for previous tree: ${state.activeTree.tree.name}, paths: ${state.activeTree.paths.length}`);
    }
    
    // Restore the saved NavigationPathTree for the target tree (or null if none exists)
    const restoredTree = state.allTrees.get(runtimeTree) || null;
    log.debug(`NavigationState: Restored state for new tree: ${runtimeTree.name}, paths: ${restoredTree?.paths.length ?? 0}`);
    
    return {
      ...state,
      activeTree: restoredTree,
      allTrees: updatedAllTrees
    };
  });
}

/**
 * Resets the navigation state completely.
 * Clears all trees, paths, and stored NavigationContexts.
 * 
 * Used for complete state reset (e.g., user logout, major navigation changes).
 */
export function resetNavigationState(): void {
  log.debug('NavigationState: ⚠️ Resetting navigation state completely');
  navigationState.set(initialState);
}

// === QUERY FUNCTIONS =========================================================================================

/**
 * Gets the currently active node (the deepest node in the active path).
 * Returns null if no NavigationContext is currently active.
 * 
 * This represents the "current position" in the hierarchy navigation.
 * 
 * @param state The current navigation state
 * @returns The active node or null if no active path
 */
export function getCurrentActiveNode(state: NavigationState): RuntimeHierarchyTreeNode | null {
  return state.activeTree && state.activeTree.paths.length > 0 
    ? state.activeTree.paths[state.activeTree.paths.length - 1] 
    : null;
}

/**
 * Checks if a specific node is anywhere in the current active path.
 * Useful for determining active states in UI components (e.g., sidebar highlighting).
 * 
 * @param state The current navigation state  
 * @param node The node to check for
 * @returns true if the node is in the active NavigationContext
 */
export function isNodeInActivePath(state: NavigationState, node: RuntimeHierarchyTreeNode): boolean {
  return state.activeTree ? state.activeTree.paths.some(pathNode => nodesEqual(pathNode, node)) : false;
}

/**
 * Gets the node at a specific level in the active path.
 * Returns null if the NavigationContext doesn't reach that deep.
 * 
 * Used for level-specific UI logic and navigation path analysis.
 * 
 * @param state The current navigation state
 * @param level The level to get the node for (0 = root, 1 = first child level, etc.)
 * @returns The node at that level or null if path doesn't reach that deep
 */
export function getNodeAtLevel(state: NavigationState, level: number): RuntimeHierarchyTreeNode | null {
  return state.activeTree && level < state.activeTree.paths.length 
    ? state.activeTree.paths[level] 
    : null;
}

/**
 * Gets the current navigation depth (number of levels deep in the active path).
 * Represents how "deep" the user has navigated into the hierarchy.
 * 
 * @param state The current navigation state
 * @returns The depth (0 = no active path, 1 = root only, etc.)
 */
export function getNavigationDepth(state: NavigationState): number {
  return state.activeTree ? state.activeTree.paths.length : 0;
}

/**
 * Gets all stored tree NavigationContexts for debugging and inspection.
 * Useful for development debugging and understanding tree switching behavior.
 * 
 * @param state The current navigation state
 * @returns Object with tree names as keys and NavigationContext info as values
 */
export function getStoredTreePaths(state: NavigationState): Record<string, { depth: number; lastNode: string | null }> {
  const result: Record<string, { depth: number; lastNode: string | null }> = {};
  
  for (const [runtimeTree, pathTree] of state.allTrees.entries()) {
    result[runtimeTree.name] = {
      depth: pathTree.paths.length,
      lastNode: pathTree.paths.length > 0 ? pathTree.paths[pathTree.paths.length - 1].item.key : null
    };
  }
  
  return result;
}

// === DEVELOPMENT VALIDATION ==================================================================================

/**
 * Validates NavigationState consistency for development debugging.
 * Checks for common issues like missing trees, invalid paths, or inconsistent state.
 * 
 * @param state The navigation state to validate
 * @returns Validation result with any issues found
 */
export function validateNavigationState(state: NavigationState): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check active tree consistency
  if (state.activeTree) {
    if (!state.activeTree.tree) {
      errors.push('Active tree missing tree structure');
    }
    
    if (!Array.isArray(state.activeTree.paths)) {
      errors.push('Active tree paths is not an array');
    }
    
    // Validate path levels are sequential
    state.activeTree.paths.forEach((node, index) => {
      const expectedLevel = index;
      const actualLevel = node.item.level ?? 0;
      
      if (actualLevel !== expectedLevel) {
        warnings.push(`Path level mismatch at index ${index}: expected ${expectedLevel}, got ${actualLevel}`);
      }
    });
  }
  
  // Check for orphaned trees in allTrees
  for (const [runtimeTree, pathTree] of state.allTrees.entries()) {
    if (!pathTree.tree || !pathTree.paths) {
      errors.push(`Invalid NavigationPathTree for tree: ${runtimeTree.name}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}