<!-- SupplierListPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { getSupplierApi } from "$lib/api/client/supplier";
  import SupplierGrid from "$lib/components/domain/suppliers/SupplierGrid.svelte";
  import type { Wholesaler } from "$lib/domain/domainTypes";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/list-page-layout.css";
  // --- API & Strategy Imports ---
  // The ApiClient is the foundation for making SSR-safe fetch requests.
  import { ApiClient } from "$lib/api/client/apiClient";
  // Types for the strategy pattern used by the generic DataGrid component.
  import { page } from "$app/state";
  import type {
    SortDescriptor,
    WhereCondition,
    WhereConditionGroup
  } from "$lib/backendQueries/queryGrammar";
  import type { DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";

  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { stringsToNumbers } from "$lib/utils/typeConversions";

   // === PROPS ====================================================================================

  export interface SupplierListPageProps {
    // No more suppliers Promise! Datagrid controls all loading
    loadEventFetch: typeof fetch;
  }

  // The `data` prop only has fetch for API client
  let { data }: { data: SupplierListPageProps } = $props();

  // === STATE ====================================================================================

  let resolvedSuppliers = $state<Wholesaler[]>([]);
  let isLoading = $state(false); // Start with false - Datagrid will trigger loading
  let loadingOrValidationError = $state<{
    message: string;
    status: number;
  } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === LOAD =====================================================================================
  // Initial load is now controlled by Datagrid component via onQueryChange
  // No $effect needed - prevents race conditions and duplicate loads

  // === API ======================================================================================

  // 3. These functions handle user interactions within the grid. They remain unchanged.
  const client = new ApiClient(data.loadEventFetch);
  const supplierApi = getSupplierApi(client);

  // === EVENTS ===================================================================================

  function handleSupplierSelect(supplier: Wholesaler): void {
    log.info(`(SupplierListPage) Navigating to detail for supplierId: ${supplier.wholesaler_id}`);
    goto(`${page.url.pathname}/${supplier.wholesaler_id}`);
  }

  async function handleSupplierDelete(ids: ID[]): Promise<void> {
    log.info(`(SupplierListPage) Deleting suppliers`, { ids });
    let dataChanged = false;

    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      supplierApi.deleteSupplier,
      {
        domainObjectName: "Supplier",
        hardDepInfo: "Supplier has hard dependencies. Delete?",
        softDepInfo: "Supplier has soft dependencies. Delete?",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      // Reload and change state.
      resolvedSuppliers = await supplierApi.loadSuppliers();
    }
  }

  function handleSupplierCreate() {
    log.info(`Going to SupplierDetailPage with "new"`);
    goto(`${page.url.pathname}/new`);
  }

  async function handleQueryChange(query: {
    filters: WhereCondition<Wholesaler> | WhereConditionGroup<Wholesaler> | null,
    sort: SortDescriptor<Wholesaler>[] | null
  }) {
    log.info(`(SupplierListPage) Query change - filters:`, query.filters, `sort:`, query.sort);

    // Page tracks loading for error handling (Grid has its own loading state)
    isLoading = true;
    loadingOrValidationError = null;
    // DON'T clear resolvedSuppliers = [] - causes Grid to re-render and triggers loop!
    // Keep old data visible until new data arrives

    try {
      resolvedSuppliers = await supplierApi.loadSuppliersWithWhereAndOrder(query.filters, query.sort);
      log.info(`(SupplierListPage) Received ${resolvedSuppliers.length} suppliers`);
    } catch (rawError: any) {
      const status = rawError.status ?? 500;
      const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading suppliers.";

      loadingOrValidationError = { message, status };
      log.error("(SupplierListPage) Error loading suppliers", { rawError });
    } finally {
      isLoading = false;
    }
  }

  // ===== GRID STRATEGIES =====

  const deleteStrategy: DeleteStrategy<Wholesaler> = {
    execute: handleSupplierDelete,
  };

  const rowActionStrategy: RowActionStrategy<Wholesaler> = {
    click: handleSupplierSelect,
  };
</script>

<!----- TEMPLATE ----->

<div class="list-page-content-wrapper">
  <h1>Suppliers</h1>
  <p>Select a supplier to view their details and manage their product categories.</p>

  <!-- 
    4. The template is now extremely simple and clean. It is purely presentational,
       containing no complex logic. It just renders the current state.
  -->
  {#if loadingOrValidationError}
    <div class="component-error-boundary">
      <h3>
        Error Loading Suppliers (Status: {loadingOrValidationError.status})
      </h3>
      <p>{loadingOrValidationError.message}</p>
    </div>
  {:else}
    <div class="grid-section">
      <button
        class="pc-grid__createbtn"
        onclick={handleSupplierCreate}
      >
        Create Supplier
      </button>
      <SupplierGrid
        rows={resolvedSuppliers}
        {deleteStrategy}
        {rowActionStrategy}
        onQueryChange={handleQueryChange}
      />
    </div>
  {/if}
</div>

<style>
</style>
