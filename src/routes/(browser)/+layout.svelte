<!-- File: src/routes/(browser)/+layout.svelte -->
<script lang="ts">
  import HierarchySidebar from "$lib/components/sidebarAndNav/HierarchySidebar.svelte";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import Breadcrumb from "$lib/components/sidebarAndNav/Breadcrumb.svelte";
  import { attributeLoadingState } from "$lib/api/client/attribute.js";
  import { categoryLoadingState } from "$lib/api/client/category.js";
  import { offeringLoadingState } from "$lib/api/client/offering.js";
  import { productDefinitionLoadingState } from "$lib/api/client/productDefinition.js";
  import { supplierLoadingState } from "$lib/api/client/supplier.js";
  import { derived } from "svelte/store";
  import { fade } from "svelte/transition";
  import type { RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types.js";
  import { selectNode, setActiveViewKey } from "$lib/components/sidebarAndNav/navigationState.js";
  // Step 1: Import the new resolver function
  import { resolveHref } from "$lib/components/sidebarAndNav/hierarchyUtils.js";

  let { data, children } = $props();

  // === DERIVED STATE FROM LOAD FUNCTION ===
  const crumbItems = $derived(data.breadcrumbItems);
  const hierarchy = $derived(data.hierarchy);
  const activeLevel = $derived(data.activeLevel);
  // Step 2: Access the urlParams provided by the load function
  const urlParams = $derived(data.urlParams);

  // === LOADING INDICATOR ===
  const isAnythingLoading = derived(
    [supplierLoadingState, categoryLoadingState, offeringLoadingState, attributeLoadingState, productDefinitionLoadingState],
    ([$supplierLoading, $categoryLoading, $offeringLoading, $attributeLoading, $productDefLoading]) => {
      return $supplierLoading || $categoryLoading || $offeringLoading || $attributeLoading || $productDefLoading;
    },
  );

  // === NAVIGATION HANDLER ===

  /**
   * Handles sidebar navigation clicks using the new configuration-driven approach.
   * It resolves the href pattern from the hierarchy config with the current URL params.
   * @param tree The runtime tree of the selected item.
   * @param node The runtime node that was selected.
   */
  function handleSidebarNavigation(tree: RuntimeHierarchyTree, node: RuntimeHierarchyTreeNode) {
    log.info(`(Layout) Sidebar navigation requested for tree: '${tree.name}', node: '${node.item.key}'`);

    try {
      // Update the central navigation state. This is for context preservation logic.
      selectNode(node);

      if (node.item.disabled) {
        log.warn(`(Layout) Navigation aborted for disabled node key: '${node.item.key}'`);
        return;
      }

      // Step 3: Resolver logic
      if (node.item.href) {
        // 1. Explicitly signal the intended view to the state store.
        setActiveViewKey(node.item.key);

        // 2. Resolve the href pattern using the current urlParams from the load function.
        const finalHref = resolveHref(node.item.href, urlParams);
        log.debug(`Resolved href from pattern '${node.item.href}' to '${finalHref}', navigating...`);
        goto(finalHref);
      } else {
        // This case should ideally not happen if the config is complete.
        // It serves as a fallback or for nodes that are intentionally not navigable.
        log.warn(`Navigation aborted for node key: '${node.item.key}' (no href pattern defined in config)`);
      }
    } catch (error) {
      log.error("Failed to handle sidebar navigation:", error);
    }
  }
</script>

<!-- TEMPLATE (unchanged) -->
<div class="browser-layout">
  <aside class="sidebar">
    <HierarchySidebar
      {hierarchy}
      active={activeLevel}
      onselect={handleSidebarNavigation}
      shouldRenderHierarchyRootTitle={false}
    />
  </aside>

  <main class="main-content">
    <header class="main-header">
      <div class="breadcrumbs-wrapper">
        <Breadcrumb items={crumbItems} />
      </div>

      {#if $isAnythingLoading}
        <div
          class="loader-wrapper"
          transition:fade={{ duration: 150, delay: 200 }}
        >
          <div class="spinner"></div>
        </div>
      {/if}
    </header>

    <div class="page-content-wrapper">
      {@render children()}
    </div>
  </main>
</div>

<!-- STYLES (unchanged) -->
<style>
  .browser-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }
  .sidebar {
    background: var(--pc-grid-header-bg, #f8fafc);
    border-right: 1px solid var(--pc-grid-border, #e2e8f0);
    overflow-y: auto;
    white-space: nowrap;
  }
  .main-content {
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    background: #f8fafc;
  }
  .main-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 2rem;
    padding: 0 1.5rem;
    border-bottom: 1px solid var(--pc-grid-border, #e2e8f0);
    background-color: white;
    min-height: 54px;
  }
  .breadcrumbs-wrapper {
    flex-grow: 0;
    min-width: 0;
    flex-shrink: 1;
  }
  .loader-wrapper {
    flex-shrink: 0;
    background-color: var(--color-primary);
    border-radius: 50%;
    padding: 5px;
  }
  .spinner {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 4px solid var(--color-background);
    border-right-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .page-content-wrapper {
    overflow-y: auto;
    padding: 1.5rem;
  }
</style>
