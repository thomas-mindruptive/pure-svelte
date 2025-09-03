<!-- src/routes/(browser)/+layout.svelte - FINAL & CORRECTED -->
<script lang="ts">
  import HierarchySidebar from "$lib/components/sidebarAndNav/HierarchySidebar.svelte";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import Breadcrumb from "$lib/components/sidebarAndNav/Breadcrumb.svelte";

  let { data, children } = $props();

  const crumbItems = $derived(data.breadcrumbItems);

  // Die Daten (sidebarItems, activeLevel) kommen aus der +layout.ts
  const sidebarItems = $derived(data.sidebarItems);
  const activeLevel = $derived(data.activeLevel);

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
</style>
