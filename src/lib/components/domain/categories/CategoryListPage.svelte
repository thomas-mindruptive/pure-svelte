<script lang="ts">
  import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";

  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { QueryPayload, SortDescriptor, WhereCondition, WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import { page } from "$app/state";
  import type { CategoryWithOfferingCount } from "$lib/domain/domainTypes";
  import { getCategoryApi } from "$lib/api/client/category";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import "$lib/components/styles/list-page-layout.css";
  import { getContext } from "svelte";

  // === PROPS ====================================================================================

  export type CategoryGridProps = {
    data: {
      // No more categories Promise! Datagrid controls all loading
      loadEventFetch: typeof fetch;
    };
  };

  let { data }: CategoryGridProps = $props();

  // === STATE =====================================================================================

  let resolvedCategories = $state<CategoryWithOfferingCount[]>([]);
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // Get page-local loading context from layout
  type PageLoadingContext = { isLoading: boolean };
  const pageLoading = getContext<PageLoadingContext>('page-loading');

  // === LOAD ======================================================================================
  // Initial load is now controlled by Datagrid component via onQueryChange
  // No $effect needed - prevents race conditions and duplicate loads

  // === EVENT HANDLERS ===========================================================================

  // 3. These functions handle user interactions within the grid. They remain unchanged.
  const client = new ApiClient(data.loadEventFetch);
  const categoryApi = getCategoryApi(client);

  function handleCategorySelect(category: CategoryWithOfferingCount, options?: { _blankWindow?: boolean }): void {
    const url = `${page.url.pathname}/${category.category_id}`;
    if (options?._blankWindow) {
      log.info(`Opening in new tab for categoryId: ${category.category_id}`);
      window.open(url, "_blank");
    } else {
      log.info(`Navigating to detail for categoryId: ${category.category_id}`);
      goto(url);
    }
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
      resolvedCategories = await categoryApi.loadCategoriesWithOfferingCount();
    }
  }

  function handleCategoryCreate() {
    log.info(`Going to CategloryDetailPage with "new"`);
    goto(`${page.url.pathname}/new`);
  }

  // Track if we've done the first load
  let firstLoadComplete = false;

  async function handleQueryChange(query: {
    filters: WhereCondition<CategoryWithOfferingCount> | WhereConditionGroup<CategoryWithOfferingCount> | null,
    sort: SortDescriptor<CategoryWithOfferingCount>[] | null
  }) {
    log.info(`(CategoryListPage) Query change - filters:`, query.filters, `sort:`, query.sort);

    // Only show loading for subsequent queries, not the first one
    if (firstLoadComplete) {
      pageLoading.isLoading = true;
    }
    loadingOrValidationError = null;

    try {
      // Use loadCategoriesWithOfferingCount to get the offering counts
      const queryPartial: Partial<QueryPayload<CategoryWithOfferingCount>> = {};
      if (query.filters) queryPartial.where = query.filters;
      if (query.sort) queryPartial.orderBy = query.sort;

      resolvedCategories = await categoryApi.loadCategoriesWithOfferingCount(queryPartial);
      log.info(`(CategoryListPage) Received ${resolvedCategories.length} categories`);

      // First load is done, clear the initial loading state
      if (!firstLoadComplete) {
        firstLoadComplete = true;
        log.info("(CategoryListPage) First load complete");
      }
    } catch (rawError: any) {
      // Robust error handling from the original $effect
      const status = rawError.status ?? 500;
      const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading categories.";

      // Set the clean error state for the UI to display
      loadingOrValidationError = { message, status };

      // Log the full error for debugging
      log.error("(CategoryListPage) Error loading categories", { rawError });
    } finally {
      pageLoading.isLoading = false;
    }
  }

  // === GRID STRATEGIES ==========================================================================

  const deleteStrategy: DeleteStrategy<CategoryWithOfferingCount> = {
    execute: handleCategoryDelete,
  };

  const rowActionStrategy: RowActionStrategy<CategoryWithOfferingCount> = {
    click: handleCategorySelect,
  };
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<div class="list-page-content-wrapper">
  <h1>Categories</h1>

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
