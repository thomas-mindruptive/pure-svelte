<script lang="ts">
  import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";

  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor, WhereCondition, WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import { page } from "$app/state";
  import type { ProductCategory } from "$lib/domain/domainTypes";
  import { getCategoryApi } from "$lib/api/client/category";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import "$lib/components/styles/list-page-layout.css";

  // === PROPS ====================================================================================

  export type CategoryGridProps = {
    data: {
      // No more categories Promise! Datagrid controls all loading
      loadEventFetch: typeof fetch;
    };
  };

  let { data }: CategoryGridProps = $props();

  // === STATE =====================================================================================

  let resolvedCategories = $state<ProductCategory[]>([]);
  let isLoading = $state(false); // Start with false - Datagrid will trigger loading
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === LOAD ======================================================================================
  // Initial load is now controlled by Datagrid component via onQueryChange
  // No $effect needed - prevents race conditions and duplicate loads

  // === EVENT HANDLERS ===========================================================================

  // 3. These functions handle user interactions within the grid. They remain unchanged.
  const client = new ApiClient(data.loadEventFetch);
  const categoryApi = getCategoryApi(client);

  function handleCategorySelect(category: ProductCategory): void {
    log.info(`Navigating to detail for categoryId: ${category.category_id}`);
    goto(`${page.url.pathname}/${category.category_id}`);
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
    goto(`${page.url.pathname}/new`);
  }

  async function handleQueryChange(query: {
    filters: WhereCondition<ProductCategory> | WhereConditionGroup<ProductCategory> | null,
    sort: SortDescriptor<ProductCategory>[] | null
  }) {
    log.info(`(CategoryListPage) Query change - filters:`, query.filters, `sort:`, query.sort);

    // Reset state before loading
    isLoading = true;
    loadingOrValidationError = null;
    // DON'T clear resolvedCategories = [] - causes Grid to re-render and triggers loop!

    try {
      // API expects WhereConditionGroup | null, we have WhereCondition | WhereConditionGroup | null
      // Cast to match API expectation (WhereCondition gets wrapped in a group internally)
      resolvedCategories = await categoryApi.loadCategoriesWithWhereAndOrder(
        query.filters as WhereConditionGroup<ProductCategory> | null,
        query.sort
      );
      log.info(`(CategoryListPage) Received ${resolvedCategories.length} categories`);
    } catch (rawError: any) {
      // Robust error handling from the original $effect
      const status = rawError.status ?? 500;
      const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading categories.";

      // Set the clean error state for the UI to display
      loadingOrValidationError = { message, status };

      // Log the full error for debugging
      log.error("(CategoryListPage) Error loading categories", { rawError });
    } finally {
      isLoading = false;
    }
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
        {deleteStrategy}
        {rowActionStrategy}
        onQueryChange={handleQueryChange}
      />
    </div>
  {/if}
</div>

<style>
</style>
