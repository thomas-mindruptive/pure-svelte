<!-- src/routes/(browser)/+layout.svelte - FINAL & CORRECTED -->
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

  let { data, children } = $props();

  const crumbItems = $derived(data.breadcrumbItems);

  // Data (sidebarItems, activeLevel) comes froem +layout.ts
  const sidebarItems = $derived(data.sidebarItems);
  const activeLevel = $derived(data.activeLevel);

  // ===== LOADING INDICATOR =====

  const isAnythingLoading = derived(
    [
      supplierLoadingState,
      categoryLoadingState,
      offeringLoadingState,
      attributeLoadingState,
      productDefinitionLoadingState,
    ],
    ([
      $supplierLoading,
      $categoryLoading,
      $offeringLoading,
      $attributeLoading,
      $productDefLoading,
    ]) => {
      // Wenn irgendeine der Aktionen in der gesamten App läuft, ist dies true.
      return (
        $supplierLoading ||
        $categoryLoading ||
        $offeringLoading ||
        $attributeLoading ||
        $productDefLoading
      );
    },
  );
  isAnythingLoading

  // ===== NAVIGATION =====

  /**
   * Navigiert zur ausgewählten Seite.
   * Die Logik ist jetzt datengesteuert und verwendet die 'href' Eigenschaft,
   * die in der `+layout.ts` für jedes Item dynamisch erstellt wird.
   */
  function handleSidebarNavigation(event: CustomEvent<{ key: string }>) {
    const selectedKey = event.detail.key;
    const selectedItem = sidebarItems.find((item) => item.key === selectedKey);

    log.info(`(Layout) Sidebar navigation requested for key: ${selectedKey}`);

    // Navigiere nur, wenn das Item existiert, nicht deaktiviert ist und einen gültigen Link hat.
    if (
      selectedItem &&
      !selectedItem.disabled &&
      selectedItem.href &&
      selectedItem.href !== "#"
    ) {
      goto(selectedItem.href);
    } else {
      log.warn(`(Layout) Navigation aborted for key: ${selectedKey}`, {
        item: selectedItem,
      });
    }
  }
</script>

<!----- TEMPLATE ----->

<div class="browser-layout">
  <aside class="sidebar">
    <HierarchySidebar
      items={sidebarItems}
      active={activeLevel}
      onselect={handleSidebarNavigation}
    />
  </aside>

  <main class="main-content">
    <Breadcrumb items={crumbItems} />

    {#if $isAnythingLoading}
      <div class="global-loading-indicator">
        <div class="spinner"></div>
        <span>Loading...</span>
      </div>
    {/if}
    
    {@render children()}
  </main>
</div>

<style>
  .browser-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }
  .sidebar {
    background: var(--pc-grid-header-bg, #f8fafc);
    border-right: 1px solid var(--pc-grid-border, #e2e8f0);
    overflow-y: auto;
  }
  .main-content {
    overflow-y: auto;
    background: #f8fafc;
  }

  .global-loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center; /* Zentriert den Inhalt */
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background-color: color-mix(in srgb, var(--color-primary) 10%, transparent); 
    border-bottom: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent); /* Subtile Trennlinie */
    color: var(--color-primary);
    font-weight: 500;
    position: sticky; /* Hält den Indikator oben */
    top: 0;
    left: 0;
    width: 100%;
    z-index: 100; /* Stellt sicher, dass er über dem Seiteninhalt liegt */
    box-shadow: 0 2px 4px rgba(0,0,0,0.05); /* Leichter Schatten für Tiefe */
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
