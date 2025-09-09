<script lang="ts">

  import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";


  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from "$lib/stores/confirmation";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type {
    ID,
    DeleteStrategy,
    RowActionStrategy,
  } from "$lib/components/grids/Datagrid.types";
  import { page } from "$app/stores";
  import type { ProductCategory } from "$lib/domain/domainTypes";
  import { categoryLoadingState, getCategoryApi } from "$lib/api/client/category";

  // === PROPS ====================================================================================

  let { data }: { data: { suppliers: Promise<ProductCategory[]> } } = $props<{
    data: { suppliers: Promise<ProductCategory[]> };
  }>();

  // === STATE =====================================================================================

  let resolvedCategories = $state<ProductCategory[]>([]);
  let isLoading = $state(true); // The component always starts in a loading state.
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);

  // === LOAD ======================================================================================

  $effect(() => {
    // For Svelte cleanup funtion!
    let aborted = false;

    // We define a self-contained async function to handle the promise lifecycle.
    // This is a robust pattern for managing async operations inside an effect.
    log.debug(`Before processPromise`);
    const processPromise = async () => {
      // a. Reset the state each time a new promise is processed.
      isLoading = true;
      loadingOrValidationError = null;
      resolvedCategories = []; // Clear old data to prevent stale UI

      if (!data.suppliers) {
        const message = `Cannot load suppliers because data.suppliers is not defined`;
        log.error(message);
        loadingOrValidationError = { message, status: 0 };
      } else {
        try {
          // b. Await the promise to get the data.
          if (!aborted) {
            resolvedCategories = await data.suppliers;
            log.debug(`Suppliers promise resolved successfully.`);
          }
        } catch (rawError: any) {
          // c. If the promise rejects, perform the robust error handling.

          if (!aborted) {
            const status = rawError.status ?? 500;
            const message =
              rawError.body?.message ||
              rawError.message ||
              "An unknown error occurred while loading suppliers.";

            // Set the clean error state for the UI to display.
            loadingOrValidationError = { message, status };

            // Log the full, raw error object for debugging purposes.
            log.error(
              "(SupplierListPage) Promise rejected while loading suppliers",
              { rawError }
            );
          }
        } finally {
          // Always set loading to false when the process is complete (success or fail).
          if (!aborted) {
            isLoading = false;
          }
        }
      }
    };

    // Execute the promise handling function.
    processPromise();

    // Cleanup function
    return () => {
      aborted = true;
    };
  });

  // === EVENT HANDLERS ===========================================================================

  // 3. These functions handle user interactions within the grid. They remain unchanged.
  const client = new ApiClient(fetch);
  const categoryApi = getCategoryApi(client);

  function handleCategorySelect(category: ProductCategory): void {
    log.info(
      `Navigating to detail for supplierId: ${category.category_id}`
    );
    goto(`/categories/${category.category_id}`);
  }

  async function handleCategoryDelete(ids: ID[]): Promise<void> {
    log.info(`(SupplierListPage) Deleting suppliers`, { ids });
    let dataChanged = false;

    for (const id of ids) {
      const numericId = Number(id);
      const result = await categoryApi.deleteCategory(numericId, false);

      if (result.success) {
        addNotification(
          `Category "${result.data.deleted_resource.name}" deleted.`,
          "success"
        );
        dataChanged = true;
      } else if ("cascade_available" in result && result.cascade_available) {
        const dependencies = (result.dependencies as string[]).join(", ");
        const confirmed = await requestConfirmation(
          `Category has dependencies: ${dependencies}. Delete with all related data?`,
          "Confirm Cascade Delete"
        );

        if (confirmed) {
          const cascadeResult = await categoryApi.deleteCategory(
            numericId,
            true
          );
          if (cascadeResult.success) {
            addNotification("Category and related data deleted.", "success");
            dataChanged = true;
          }
        }
      } else {
        addNotification(`Could not delete category (ID: ${id}).`, "error");
      }
    }

    // TODO: Stay on page, just reload categories!!! See OfferingDetailAttributes -> Delete attribute.
    if (dataChanged) {
      goto("/categories", { invalidateAll: true });
    }
  }

  function handleCategoryCreate() {
    log.info(`Going to CategloryDetailPage with "new"`);
    goto(`${$page.url.pathname}/new`);
  }

  // === GRID STRATEGIES ==========================================================================

  const deleteStrategy: DeleteStrategy<ProductCategory> = {
    execute: handleCategoryDelete,
  };

  const rowActionStrategy: RowActionStrategy<ProductCategory> = {
    click: handleCategorySelect,
  };
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<div class="page-content-wrapper">
  <h1>Suppliers</h1>
  <p>
    Select a supplier to view their details and manage their product categories.
  </p>

  <!-- 
    4. The template is now extremely simple and clean. It is purely presentational,
       containing no complex logic. It just renders the current state.
  -->
  {#if loadingOrValidationError}
    <div class="component-error-boundary">
      <h3>Error Loading Suppliers (Status: {loadingOrValidationError.status})</h3>
      <p>{loadingOrValidationError.message}</p>
    </div>
  {:else}
    <div class="grid-section">
      <button class="pc-grid__createbtn" onclick={handleCategoryCreate}
        >Create Supplier</button
      >
      <CategoryGrid
        rows={resolvedCategories}
        loading={isLoading || $categoryLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
      />
    </div>
  {/if}
</div>

<style>
  /* These styles define the layout for this specific page component. */
  .page-content-wrapper {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }
  h1 {
    margin: 0;
  }
  p {
    margin: 0;
    color: var(--color-muted);
  }
</style>
