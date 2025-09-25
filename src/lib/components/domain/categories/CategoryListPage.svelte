<script lang="ts">
  import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";

  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import { page } from "$app/stores";
  import type { ProductCategory } from "$lib/domain/domainTypes";
  import { categoryLoadingState, getCategoryApi } from "$lib/api/client/category";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import "$lib/components/styles/list-page-layout.css";

  // === PROPS ====================================================================================

  export type CategoryGridProps = {
    data: { categories: Promise<ProductCategory[]> };
  };

  let { data }: CategoryGridProps = $props();

  // === STATE =====================================================================================

  let resolvedCategories = $state<ProductCategory[]>([]);
  let isLoading = $state(true); // The component always starts in a loading state.
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

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

      if (!data.categories) {
        const message = `Cannot load categories because data.categories is not defined`;
        log.error(message);
        loadingOrValidationError = { message, status: 0 };
      } else {
        try {
          // b. Await the promise to get the data.
          if (!aborted) {
            resolvedCategories = await data.categories;
            log.debug(`Categroies promise resolved successfully.`);
          }
        } catch (rawError: any) {
          // c. If the promise rejects, perform the robust error handling.

          if (!aborted) {
            const status = rawError.status ?? 500;
            const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading categories.";

            // Set the clean error state for the UI to display.
            loadingOrValidationError = { message, status };

            // Log the full, raw error object for debugging purposes.
            log.error("(CategoryListPage) Promise rejected while loading categories", { rawError });
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
    log.info(`Navigating to detail for categoryId: ${category.category_id}`);
    goto(`/categories/${category.category_id}`);
  }

  async function handleCategoryDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting categories`, { ids });
    let dataChanged = false;

    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      categoryApi.deleteCategory,
      {
        domainObjectName: "Product Category",
        hardDepInfo: "Has hard dependencies. Delete?",
        softDepInfo: "Has soft dependencies. Delete?",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      resolvedCategories = await categoryApi.loadCategories();
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

<div class="list-page-content-wrapper">
  <h1>Categories</h1>
  <p>Select a category to view their details and manage their products.</p>

  <!-- 
    4. The template is now extremely simple and clean. It is purely presentational,
       containing no complex logic. It just renders the current state.
  -->
  {#if loadingOrValidationError}
    <div class="component-error-boundary">
      <h3>Error Loading Categories (Status: {loadingOrValidationError.status})</h3>
      <p>{loadingOrValidationError.message}</p>
    </div>
  {:else}
    <div class="grid-section">
      <button
        class="pc-grid__createbtn"
        onclick={handleCategoryCreate}
      >
        Create Category
      </button>
      <CategoryGrid
        rows={resolvedCategories}
        loading={isLoading || $categoryLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
        apiLoadFunc={categoryApi.loadCategoriesWithWhereAndOrder}
      />
    </div>
  {/if}
</div>

<style>
</style>
