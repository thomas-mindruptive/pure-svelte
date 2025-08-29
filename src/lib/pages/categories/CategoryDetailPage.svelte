<!-- src/lib/pages/categories/CategoryDetailPage.svelte -->
<script lang="ts">
  import { log } from '$lib/utils/logger';
  import { addNotification } from '$lib/stores/notifications';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  // Komponenten
  import OfferingGrid from '$lib/components/domain/offerings/OfferingGrid.svelte';

  // API & Typen
  import { categoryLoadingState, deleteOffering } from '$lib/api/client/category';
  import type { ProductCategory, WholesalerItemOffering_ProductDef_Category } from '$lib/domain/types';
  import type { DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';

  // Daten aus der `load`-Funktion
  type LoadData = {
    category: ProductCategory;
    offerings: WholesalerItemOffering_ProductDef_Category[];
    assignmentComment?: string;
    assignmentLink?: string;
  };
  let { data } = $props<{ data: LoadData }>();

  /**
   * Handler zum Löschen von Angeboten.
   */
  async function handleOfferingDelete(ids: ID[]): Promise<void> {
    log.info(`(CategoryDetailPage) Deleting offerings`, { ids });
    let dataChanged = false;

    for (const id of ids) {
      const numericId = Number(id);
      const result = await deleteOffering(numericId); // Kaskadierung wird hier noch nicht behandelt
      
      if (result.success) {
        addNotification(`Offering (ID: ${numericId}) deleted successfully.`, 'success');
        dataChanged = true;
      } else {
        addNotification(`Failed to delete offering (ID: ${numericId}).`, 'error');
      }
    }

    if (dataChanged) {
      // Lade die Seite neu, um die Angebotsliste zu aktualisieren
      await goto($page.url.href, { invalidateAll: true });
    }
  }

  /**
   * Navigiert zur nächsten Hierarchieebene (Angebots-Details).
   */
  function handleOfferingSelect(offering: WholesalerItemOffering_ProductDef_Category) {
    log.info(`(CategoryDetailPage) Navigating to offering detail for offeringId: ${offering.offering_id}`);
    // Hinweis: Die Ziel-URL für Angebots-Details ist im README noch nicht final definiert.
    // Wir nehmen hier eine plausible Struktur an:
    goto(`${$page.url.pathname}/offerings/${offering.offering_id}`);
  }

  // Strategie-Objekte für das OfferingGrid
  const deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category> = {
    execute: handleOfferingDelete
  };

  const rowActionStrategy: RowActionStrategy<WholesalerItemOffering_ProductDef_Category> = {
    click: handleOfferingSelect
  };
</script>

<div class="page-layout">
  <div class="header-section">
    <h1>Offerings in "{data.category.name}"</h1>
    <p>{data.category.description || 'No description available for this category.'}</p>
    {#if data.assignmentComment}
      <p class="comment">
        <strong>Supplier Notes:</strong> {data.assignmentComment}
      </p>
    {/if}
  </div>

  <div class="grid-section">
    <OfferingGrid
      rows={data.offerings}
      loading={$categoryLoadingState}
      {deleteStrategy}
      {rowActionStrategy}
    />
  </div>
</div>

<style>
  .page-layout {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .header-section {
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
  }
  h1 {
    margin: 0;
  }
  p {
    margin: 0.5rem 0 0 0;
    color: var(--color-muted);
    max-width: 80ch;
  }
  .comment {
    font-style: italic;
    margin-top: 0.75rem;
    border-left: 3px solid var(--color-primary);
    padding-left: 1rem;
    background-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
  }
  .grid-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
</style>