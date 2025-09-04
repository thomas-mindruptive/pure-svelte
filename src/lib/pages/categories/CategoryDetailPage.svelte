<!-- src/lib/pages/categories/CategoryDetailPage.svelte -->
<script lang="ts">
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  // Komponenten;
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";

  // API & Typen
  import {
    categoryLoadingState,
    getCategoryApi,
  } from "$lib/api/client/category";
  import type {
    ProductCategory,
    WholesalerItemOffering_ProductDef_Category,
  } from "$lib/domain/domainTypes";

  import { ApiClient } from "$lib/api/client/ApiClient";
  import type {
    ID,
    DeleteStrategy,
    RowActionStrategy,
  } from "$lib/components/grids/Datagrid.types";

  // Daten aus der `load`-Funktion
  type LoadData = {
    category: ProductCategory;
    offerings: WholesalerItemOffering_ProductDef_Category[];
    assignmentComment?: string;
    assignmentLink?: string;
  };
  let { data } = $props<{ data: LoadData }>();
  log.info("(CategoryDetailPage) Loaded data:", data);
  if (!data.category) {
    log.error("(CategoryDetailPage) data.category is undefined.", data);
  }

  /**
   * Handler zum Löschen von Angeboten.
   */
  async function handleOfferingDelete(ids: ID[]): Promise<void> {
    log.info(`(CategoryDetailPage) Deleting offerings`, { ids });
    let dataChanged = false;

    // 1. Create an ApiClient instance with client `fetch`.
    const client = new ApiClient(fetch);

    // 2. Get the supplier-specific API methods from the factory.
    const categoryApi = getCategoryApi(client);

    for (const id of ids) {
      const numericId = Number(id);
      const result = await categoryApi.deleteOffering(numericId); // Kaskadierung wird hier noch nicht behandelt

      if (result.success) {
        addNotification(
          `Offering (ID: ${numericId}) deleted successfully.`,
          "success",
        );
        dataChanged = true;
      } else {
        addNotification(
          `Failed to delete offering (ID: ${numericId}).`,
          "error",
        );
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
  function handleOfferingSelect(
    offering: WholesalerItemOffering_ProductDef_Category,
  ) {
    log.info(
      `(CategoryDetailPage) Navigating to offering detail for offeringId: ${offering.offering_id}`,
    );
    // Hinweis: Die Ziel-URL für Angebots-Details ist im README noch nicht final definiert.
    // Wir nehmen hier eine plausible Struktur an:
    goto(`${$page.url.pathname}/offerings/${offering.offering_id}`);
  }

  /**
   * Create new offering.
   */
  function handleOfferingCreate() {
    log.info(`Going to OfferDetailPage with "new"`);
    goto(`${$page.url.pathname}/offerings/new`);
  }

  // Strategie-Objekte für das OfferingGrid
  const deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category> =
    {
      execute: handleOfferingDelete,
    };

  const rowActionStrategy: RowActionStrategy<WholesalerItemOffering_ProductDef_Category> =
    {
      click: handleOfferingSelect,
    };
</script>

{#if data?.category}
  <div class="detail-page-layout">
    <div class="detail-header-section">
      <h1>Offerings in "{data.category.name}"</h1>
      <p>
        {data.category.description ||
          "No description available for this category."}
      </p>
      {#if data.assignmentComment}
        <p class="comment">
          <strong>Supplier Notes:</strong>
          {data.assignmentComment}
        </p>
      {/if}
    </div>

    <div class="grid-section">
      <button class="pc-grid__createbtn" onclick={handleOfferingCreate}
        >Create Offering</button
      >
      <OfferingGrid
        rows={data.offerings}
        loading={$categoryLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
      />
    </div>
  </div>

  <style>
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
      background-color: color-mix(
        in srgb,
        var(--color-primary) 5%,
        transparent
      );
    }
    .grid-section {
      background: var(--color-background);
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }
  </style>
{:else}
  <div>Loading...</div>
{/if}
