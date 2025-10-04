<!-- SupplierListPage.svelte -->
<script lang="ts">
  import SupplierGrid from "$lib/components/domain/suppliers/SupplierGrid.svelte";
  import { supplierLoadingState, getSupplierApi } from "$lib/api/client/supplier";
  import type { Wholesaler } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/list-page-layout.css";

  // --- API & Strategy Imports ---
  // The ApiClient is the foundation for making SSR-safe fetch requests.
  import { ApiClient } from "$lib/api/client/ApiClient";

  // Types for the strategy pattern used by the generic DataGrid component.
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import { page } from "$app/state";

  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";

  // === PROPS ====================================================================================

  export interface SupplierListPageProps {
     suppliers: Promise<Wholesaler[]>
  }

  // 1. The `data` prop receives the promise streamed from the non-blocking `load` function.
  //    It is NOT the resolved array of suppliers, but the promise that will resolve to it.
  let { data }: { data:  SupplierListPageProps}  = $props();

  // === STATE ====================================================================================

  let resolvedSuppliers = $state<Wholesaler[]>([]);
  let isLoading = $state(true); // The component always starts in a loading state.
  let loadingOrValidationError = $state<{
    message: string;
    status: number;
  } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === LOAD =====================================================================================

  // This `$effect` runs whenever the `data.suppliers`
  //    promise changes (e.g., on initial load or after an `invalidateAll` call).
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
      resolvedSuppliers = []; // Clear old data to prevent stale UI

      if (!data.suppliers) {
        const message = `Cannot load suppliers because data.suppliers is not defined`;
        log.error(message);
        loadingOrValidationError = { message, status: 0 };
      } else {
        try {
          // b. Await the promise to get the data.
          if (!aborted) {
            resolvedSuppliers = await data.suppliers;
            log.debug(`Suppliers promise resolved successfully.`);
          }
        } catch (rawError: any) {
          // c. If the promise rejects, perform the robust error handling.

          if (!aborted) {
            const status = rawError.status ?? 500;
            const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading suppliers.";

            // Set the clean error state for the UI to display.
            loadingOrValidationError = { message, status };

            // Log the full, raw error object for debugging purposes.
            log.error("(SupplierListPage) Promise rejected while loading suppliers", { rawError });
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

  // === API ======================================================================================

  // 3. These functions handle user interactions within the grid. They remain unchanged.
  const client = new ApiClient(fetch);
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

  async function handleSort(sortState: SortDescriptor<Wholesaler>[] | null) {
    resolvedSuppliers = await supplierApi.loadSuppliersWithWhereAndOrder(null, sortState);
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
        loading={isLoading || $supplierLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
        onSort={handleSort}
      />
    </div>
  {/if}
</div>

<style>
</style>
