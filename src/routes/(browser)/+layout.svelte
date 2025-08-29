<!-- src/routes/(browser)/+layout.svelte -->
<script lang="ts">
  import { log } from '$lib/utils/logger';
  import HierarchySidebar from '$lib/components/browser/HierarchySidebar.svelte';
  import { goto } from '$app/navigation';

  let { data, children } = $props();

  // Die Daten (sidebarItems, activeLevel) kommen aus der +layout.ts
  const { sidebarItems, activeLevel } = data;

  function handleSidebarNavigation(event: CustomEvent<{ key: string }>) {
    const key = event.detail.key;
    log.info(`(Layout) Sidebar navigation requested for key: ${key}`);

    // Diese Funktion muss die URL basierend auf dem aktuellen Kontext anpassen.
    // Beispiel: Wenn wir auf der Supplier-Detailseite sind und 'wholesalers' klicken,
    // muss die supplierId entfernt werden.
    // Dies ist eine vereinfachte Navigation für den Anfang.
    if (key === 'suppliers') {
      goto('/suppliers');
    } else if (key === 'categories' && data.context.supplierId) {
      goto(`/suppliers/${data.context.supplierId}`);
    } else {
      // TODO: Logik für andere Level hinzufügen
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
    {@render children()}
  </main>
</div>

<style>
  .browser-layout {
    display: grid;
    grid-template-columns: 280px 1fr; /* Sidebar-Breite und restlicher Platz */
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
    background: #f8fafc; /* Hintergrund für den Content-Bereich */
  }
</style>