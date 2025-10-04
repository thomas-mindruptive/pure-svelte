<!-- OrderListPage.svelte -->

<script lang="ts">
  import { Order_Wholesaler_Schema, type Order_Wholesaler } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/list-page-layout.css";

  // --- API & Strategy Imports ---
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy, ColumnDefBase } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";

  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { page } from "$app/state";
  import { getOrderApi, orderLoadingState } from "$lib/api/client/order";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import { safeParseFirstN } from "$lib/domain/domainTypes.utils";
  import { convertToHtml } from "$lib/utils/formatUtils";

  // === PROPS ====================================================================================

  const { data }: { data: { loadEventFetch: typeof fetch } } = $props();

  // === STATE ====================================================================================

  let resolvedOrders = $state<Order_Wholesaler[]>([]);
  let isLoading = $state(true); // The component always starts in a loading state.
  let loadingOrValidationError = $state<{
    message: string;
    status: number;
  } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === API ======================================================================================

  const client = new ApiClient(data.loadEventFetch);
  const orderApi = getOrderApi(client);

  // === LOAD =====================================================================================

  /**
   * ⚠️ NOTE: with this list page, we change the +page.ts -> load -> page.svelte pattern!
   * Reason: We use the "streaming API" approach anyway,
   * i.e. the "load" function only returns promises, not the data itself.
   * => There is no advantage, quite the opposite:
   * We would have to maintain an indirection (= +page.ts).
   */
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
      resolvedOrders = []; // Clear old data to prevent stale UI

      try {
        if (!aborted) {
          resolvedOrders = await orderApi.loadOrderWholesalers();
          const valResult = safeParseFirstN(Order_Wholesaler_Schema, resolvedOrders, 4);
          if (!valResult.success) {
            const msg = `Cannot validate orders: ${convertToHtml(JSON.stringify(valResult.error.issues))}`;
            loadingOrValidationError = { message: msg, status: 500 };
            log.error(msg);
          }
          log.debug(`Orders promise resolved successfully.`, resolvedOrders);
        }
      } catch (rawError: any) {
        if (!aborted) {
          const status = rawError.status ?? 500;
          const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading.";

          // Set the clean error state for the UI to display.
          loadingOrValidationError = { message, status };

          // Log the full, raw error object for debugging purposes.
          log.error("Promise rejected while loading.", { rawError });
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

  // === EVENTS ===================================================================================

  function handleOrderSelect(order: Order_Wholesaler): void {
    log.info(`Navigating to detail for: ${order.order_id}`);
    goto(`${page.url.pathname}/${order.order_id}`);
  }

  async function handleOrderDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting`, { ids });
    let dataChanged = false;

    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      orderApi.deleteOrder,
      {
        domainObjectName: "Order",
        hardDepInfo: "Has hard dependencies. Delete?",
        softDepInfo: "Has soft dependencies. Delete?",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      // Reload and change state.
      resolvedOrders = await orderApi.loadOrderWholesalers();
    }
  }

  function handleOrderCreate() {
    log.info(`Going to DetailPage with "new"`);
    goto(`${page.url.pathname}/new`);
  }

  async function handleSort(sortState: SortDescriptor<Order_Wholesaler>[] | null) {
    resolvedOrders = await orderApi.loadOrderWholesalersWithWhereAndOrder(null, sortState);
  }

  // === DATAGRID DATA ============================================================================

  const columns: ColumnDefBase<typeof Order_Wholesaler_Schema>[] = [{ key: "order_id", header: "ID", accessor: null, sortable: true }];

  const getId = (r: Order_Wholesaler) => r.order_id;

  // ===== DATAGRID STRATEGIES ====================================================================

  const deleteStrategy: DeleteStrategy<Order_Wholesaler> = {
    execute: handleOrderDelete,
  };

  const rowActionStrategy: RowActionStrategy<Order_Wholesaler> = {
    click: handleOrderSelect,
  };
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<div class="list-page-content-wrapper">
  <h1>Orders</h1>

  {#if loadingOrValidationError}
    <div class="component-error-boundary">
      <h3>
        Error Loading (Status: {loadingOrValidationError.status})
      </h3>
      <p>{loadingOrValidationError.message}</p>
    </div>
  {:else}
    <div class="grid-section">
      <button
        class="pc-grid__createbtn"
        onclick={handleOrderCreate}
      >
        Create Order
      </button>
      <Datagrid
        rows={resolvedOrders}
        {columns}
        {getId}
        loading={isLoading || $orderLoadingState}
        gridId="orders"
        entity="order"
        {deleteStrategy}
        {rowActionStrategy}
        onSort={handleSort}
        maxBodyHeight="550px"
      />
    </div>
  {/if}
</div>

<style>
</style>
