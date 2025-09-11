<!-- HierarchySidebar - Flattened Rendering with Tree References -->

<script lang="ts">
  import "$lib/components/styles/sidebar.css";
  import { log } from "$lib/utils/logger";
  import type { HierarchyItem, Hierarchy, HierarchyTree, HierarchyTreeNode } from "./HierarchySidebar.types";

  // === TYPES ====================================================================================

  /**
   * Callback function type for when a user selects an item in the sidebar
   */
  export type SelectCallback = (tree: HierarchyTree, node: HierarchyTreeNode) => void;

  /**
   * Flattened representation of a hierarchy item for rendering
   * Contains all display properties plus references to the original tree structure
   */
  type FlattenedItem = {
    // Display properties (copied from HierarchyItem)
    key: HierarchyItem['key'];
    label: HierarchyItem['label'];
    count?: HierarchyItem['count'];
    disabled?: HierarchyItem['disabled'];
    level: HierarchyItem['level'];
    href: HierarchyItem['href'];
    
    // References to original tree structure
    treeRef: HierarchyTree;
    nodeRef: HierarchyTreeNode;
    hasChildren: boolean;
  };

  /**
   * Component props interface
   */
  export type HierarchySidebarProps = {
    hierarchy?: Hierarchy;
    active?: string | null;
    ariaLabel?: string;
    onselect?: SelectCallback;
    shouldRenderHierarchyRootTitle: boolean;
  };

  // === PROPS ====================================================================================

  const {
    hierarchy = [] as Hierarchy,
    active = null as string | null,
    ariaLabel = "Navigation",
    onselect,
    shouldRenderHierarchyRootTitle
  }: HierarchySidebarProps = $props();

  // === UTILITY FUNCTIONS =======================================================================

  /**
   * Recursively flattens a tree node and its children into a flat array
   * Each flattened item maintains references to the original tree structure
   */
  function flattenTreeNode(
    node: HierarchyTreeNode, 
    tree: HierarchyTree
  ): FlattenedItem[] {
    const result: FlattenedItem[] = [];
    
    // Add the current node to the flattened list
    result.push({
      key: node.item.key,
      label: node.item.label,
      count: node.item.count,
      disabled: node.item.disabled,
      level: node.item.level,
      href: node.item.href,
      treeRef: tree,
      nodeRef: node,
      hasChildren: Boolean(node.children && node.children.length > 0)
    });

    // Recursively flatten children if they exist
    if (node.children) {
      for (const childNode of node.children) {
        result.push(...flattenTreeNode(childNode, tree));
      }
    }

    return result;
  }

  /**
   * Flattens the entire hierarchy into a flat array for rendering
   * Preserves tree structure references for navigation logic
   */
  function flattenHierarchy(hierarchy: Hierarchy): FlattenedItem[] {
    const result: FlattenedItem[] = [];
    
    for (const tree of hierarchy) {
      // Flatten the root item and all its descendants
      result.push(...flattenTreeNode(tree.rootItem, tree));
    }
    
    return result;
  }

  // === DERIVED STATE ============================================================================

  /**
   * Flattened items for rendering - recalculated when hierarchy changes
   */
  const flattenedItems = $derived(flattenHierarchy(hierarchy));

  // === EVENT HANDLERS ===========================================================================

  /**
   * Handles item selection, passing both tree and node references to the callback
   */
  function handleSelect(tree: HierarchyTree, node: HierarchyTreeNode) {
    log.debug("Sidebar item selected", { tree: tree.name, nodeKey: node.item.key });
    
    try {
      onselect?.(tree, node);
    } catch (error: unknown) {
      log.error("Selection callback failed:", error);
      // Don't throw - keep UI responsive
    }
  }
</script>

<!-- TEMPLATE ==================================================================================== -->

<nav class="hb" aria-label={ariaLabel}>
  {#each hierarchy as tree (tree.name)}
    <div class="hb__tree">
      <!-- Tree title (optional) -->
      {#if shouldRenderHierarchyRootTitle && tree.name}
        <h3 class="hb__root-title">{tree.name}</h3>
      {/if}

      <!-- Flattened tree items -->
      <ul class="hb__list">
        {#each flattenedItems.filter(item => item.treeRef === tree) as item (item.key)}
          <li class="hb__li">
            <button
              type="button"
              class="hb__item {active === item.key ? 'is-active' : ''}"
              disabled={!!item.disabled}
              aria-current={active === item.key ? "page" : undefined}
              style="padding-left: {(item.level ?? 0) * 14}px"
              onclick={() => !item.disabled && handleSelect(item.treeRef, item.nodeRef)}
            >
              <!-- Expand indicator for items with children -->
              {#if item.hasChildren}
                <span class="hb__expand-indicator" aria-hidden="true">▶</span>
              {:else}
                <span class="hb__expand-spacer" aria-hidden="true"></span>
              {/if}

              <!-- Item label -->
              <span class="hb__label">{item.label}</span>

              <!-- Optional count badge -->
              {#if item.count != null}
                <span class="hb__count">{item.count}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<!-- STYLES ====================================================================================== -->

<style>
  .hb__expand-indicator,
  .hb__expand-spacer {
    width: 16px;
    display: inline-block;
    text-align: center;
    font-size: 10px;
    margin-right: 4px;
    color: var(--color-muted, #64748b);
  }

  .hb__expand-spacer {
    /* Empty space for items without children */
  }

  .hb__item {
    display: flex;
    align-items: center;
    width: 100%;
    /* Rest of existing styles remain the same */
  }

  .hb__label {
    flex: 1;
  }

  .hb__count {
    margin-left: auto;
    /* Existing count styles */
  }
</style>