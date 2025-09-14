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
  import type { RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types.js";
  import { resolveHref } from "$lib/components/sidebarAndNav/hierarchyUtils.js";
  import "$lib/components/styles/loadingIndicator.css";

  const { data, children } = $props();

  // === DERIVED STATE FROM LOAD FUNCTION ===
  const crumbItems = $derived(data.breadcrumbItems);
  // NOTE: data.hierarchy now contains ALL hierarchies. We need to pass only the active one
  // or let the sidebar component handle it. For now, we assume it expects all.
  const hierarchy = $derived(data.hierarchy);
  const activeNode = $derived(data.activeNode);
  const urlParams = $derived(data.urlParams);

  // === LOADING INDICATOR ===
  const isAnythingLoading = derived(
    [supplierLoadingState, categoryLoadingState, offeringLoadingState, attributeLoadingState, productDefinitionLoadingState],
    ([$supplierLoading, $categoryLoading, $offeringLoading, $attributeLoading, $productDefLoading]) => {
      return $supplierLoading || $categoryLoading || $offeringLoading || $attributeLoading || $productDefLoading;
    },
  );

  	$effect(() => {
		log.debug("Layout props:", {crumbItems, activeNode, urlParams, hierarchy});
	});

  // === NAVIGATION HANDLER ===

  /**
   * Handles sidebar and breadcrumb navigation clicks.
   *
   * @description
   * This function follows the new, simplified architecture:
   * 1. It resolves the declarative `href` pattern from the node's configuration.
   * 2. It calls `goto()`, which triggers the main `load` function to handle all context
   *    reconciliation and state updates. The `setActiveViewNode` intent is no longer needed.
   *
   * @param node The runtime node that was selected by the user.
   */
  function handleSidebarNavigation(node: RuntimeHierarchyTreeNode) {
    log.info(`UI navigation requested for node: '${node.item.key}'`);

    try {
      if (node.item.disabled) {
        log.warn(`Navigation aborted for disabled node: '${node.item.key}'`);
        return;
      }

      if (node.item.href) {
        // Resolve the declarative href pattern using the current context's params.
        const finalHref = resolveHref(node.item.href, urlParams);
        log.debug(`Resolved href from pattern '${node.item.href}' to '${finalHref}', navigating...`);

        // Trigger the navigation. The `load` function will now take over.
        goto(finalHref);
      } else {
        log.warn(`Navigation aborted for node: '${node.item.key}' (no href pattern defined)`);
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
      active={activeNode}
      onselect={handleSidebarNavigation}
      shouldRenderHierarchyRootTitle={false}
    />
  </aside>

  <main class="main-content">
    <header class="main-header">
      <div class="breadcrumbs-wrapper">
        <Breadcrumb
          items={crumbItems}
          onselect={handleSidebarNavigation}
        />
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

  .page-content-wrapper {
    overflow-y: auto;
    padding: 1.5rem;
  }
</style>
