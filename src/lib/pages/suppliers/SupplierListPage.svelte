<script lang="ts">
  // --- Component & Type Imports ---
  // The SupplierGrid is the primary UI component for displaying the data.
  import SupplierGrid from "$lib/components/domain/suppliers/SupplierGrid.svelte";
  // We need the supplierLoadingState to show loading for on-page actions like 'delete'.
  import {
    supplierLoadingState,
    getSupplierApi,
  } from "$lib/api/client/supplier";
  import type { Wholesaler } from "$lib/domain/domainTypes";

  // --- SvelteKit & Utility Imports ---
  // `goto` is used for programmatic navigation (e.g., after clicking a row).
  import { goto } from "$app/navigation";
  // The application's standard logger.
  import { log } from "$lib/utils/logger";
  // UI feedback helpers for success/error messages and confirmation dialogs.
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from "$lib/stores/confirmation";

  // --- API & Strategy Imports ---
  // The ApiClient is the foundation for making SSR-safe fetch requests.
  import { ApiClient } from "$lib/api/client/ApiClient";
  // Types for the strategy pattern used by the generic DataGrid component.
  import type {
    ID,
    DeleteStrategy,
    RowActionStrategy,
  } from "$lib/components/grids/Datagrid.types";
  import { page } from "$app/stores";

  // --- PROPS ---
  // 1. The `data` prop receives the promise streamed from the non-blocking `load` function.
  //    It is NOT the resolved array of suppliers, but the promise that will resolve to it.
  let { data } = $props<{ data: { suppliers: Promise<Wholesaler[]> } }>();

  // --- LOCAL COMPONENT STATE ---
  // These top-level `let` variables are made reactive by Svelte 5.
  // They will hold the resolved state of the promise.
  let resolvedSuppliers = $state<Wholesaler[]>([]);
  let isLoading = $state(true); // The component always starts in a loading state.
  // A structured object to hold a clean, UI-friendly error if the promise rejects.
  let loadingError = $state<{ message: string; status: number } | null>(null);

  // --- ASYNCHRONOUS LOGIC HANDLING ---
  // 2. This `$effect` is the core of the solution. It runs whenever the `data.suppliers`
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
      loadingError = null;
      resolvedSuppliers = []; // Clear old data to prevent stale UI

      try {
        // b. Await the promise to get the data.
        if (!aborted) {
          resolvedSuppliers = await data.suppliers;
          log.debug(`Suppliers promise resolved successfully.`);
        }
      } catch (rawError: any) {
        // c. If the promise rejects, perform the robust error handling.
        //    This logic was previously in the `load` function.
        if (!aborted) {
          const status = rawError.status ?? 500;
          const message =
            rawError.body?.message ||
            rawError.message ||
            "An unknown error occurred while loading suppliers.";

          // Set the clean error state for the UI to display.
          loadingError = { message, status };

          // Log the full, raw error object for debugging purposes.
          log.error(
            "(SupplierListPage) Promise rejected while loading suppliers",
            { rawError },
          );
        }
      } finally {
        // Always set loading to false when the process is complete (success or fail).
        if (!aborted) {
          isLoading = false;
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

  // ===== EVENT HANDLERS =====

  // 3. These functions handle user interactions within the grid. They remain unchanged.
  const client = new ApiClient(fetch);
  const supplierApi = getSupplierApi(client);

  function handleSupplierSelect(supplier: Wholesaler): void {
    log.info(
      `(SupplierListPage) Navigating to detail for supplierId: ${supplier.wholesaler_id}`,
    );
    goto(`/suppliers/${supplier.wholesaler_id}`);
  }

  async function handleSupplierDelete(ids: ID[]): Promise<void> {
    log.info(`(SupplierListPage) Deleting suppliers`, { ids });
    let dataChanged = false;

    for (const id of ids) {
      const numericId = Number(id);
      const result = await supplierApi.deleteSupplier(numericId, false);

      if (result.success) {
        addNotification(
          `Supplier "${result.data.deleted_resource.name}" deleted.`,
          "success",
        );
        dataChanged = true;
      } else if ("cascade_available" in result && result.cascade_available) {
        const dependencies = (result.dependencies as string[]).join(", ");
        const confirmed = await requestConfirmation(
          `Supplier has dependencies: ${dependencies}. Delete with all related data?`,
          "Confirm Cascade Delete",
        );

        if (confirmed) {
          const cascadeResult = await supplierApi.deleteSupplier(
            numericId,
            true,
          );
          if (cascadeResult.success) {
            addNotification("Supplier and related data deleted.", "success");
            dataChanged = true;
          }
        }
      } else {
        addNotification(`Could not delete supplier (ID: ${id}).`, "error");
      }
    }

    if (dataChanged) {
      goto("/suppliers", { invalidateAll: true });
    }
  }

  function handleSupplierCreate() {
    log.info(`Going to SupplierDetailPage with "new"`);
    goto(`${$page.url.pathname}/new`);
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

<div class="page-content-wrapper">
  <h1>Suppliers</h1>
  <p>
    Select a supplier to view their details and manage their product categories.
  </p>

  <!-- 
    4. The template is now extremely simple and clean. It is purely presentational,
       containing no complex logic. It just renders the current state.
  -->
  {#if loadingError}
    <div class="component-error-boundary">
      <h3>Error Loading Suppliers (Status: {loadingError.status})</h3>
      <p>{loadingError.message}</p>
    </div>
  {:else}
    <div class="grid-section">
      <button class="pc-grid__createbtn" onclick={handleSupplierCreate}
        >Create Supplier</button
      >
      <SupplierGrid
        rows={resolvedSuppliers}
        loading={isLoading || $supplierLoadingState}
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
