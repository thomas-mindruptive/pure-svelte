<!-- SupplierListPage.svelte -->
<script lang="ts">
  import type { Order, OrderItem_ProdDef_Category, Wholesaler } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/list-page-layout.css";

  // --- API & Strategy Imports ---
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy, ColumnDef } from "$lib/components/grids/Datagrid.types";

  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { page } from "$app/state";
  import { getOrderApi, orderLoadingState } from "$lib/api/client/order";
    import Datagrid from "$lib/components/grids/Datagrid.svelte";

  // === PROPS ====================================================================================

  let { data }: { data: { orders: Promise<Order[]> } } = $props();

  // === STATE ====================================================================================

  let resolvedOrders = $state<Order[]>([]);
  let isLoading = $state(true); // The component always starts in a loading state.
  let loadingOrValidationError = $state<{
    message: string;
    status: number;
  } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === LOAD =====================================================================================

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

      if (!data.orders) {
        const message = `Cannot load orders because data.orders is not defined`;
        log.error(message);
        loadingOrValidationError = { message, status: 0 };
      } else {
        try {
          // Await the promise to get the data.
          if (!aborted) {
            resolvedOrders = await data.orders;
            log.debug(`Orders promise resolved successfully.`);
          }
        } catch (rawError: any) {
          // If the promise rejects, perform the robust error handling.

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
  const orderApi = getOrderApi(client);

  // === EVENTS ===================================================================================

  function handleOrderSelect(order: Order): void {
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
      resolvedOrders = await orderApi.loadOrders();
    }
  }

  function handleOrderCreate() {
    log.info(`Going to DetailPage with "new"`);
    goto(`${page.url.pathname}/new`);
  }

  // === COLUMNS =====

  const columns: ColumnDef<OrderItem_ProdDef_Category>[] = [
    { key: "order_id", header: "Email", accessor: null, sortable: true },
    { key: "product_def", header: "Email", accessor: (p) => p.product_def.title, sortable: true },
  ];

  const getId = (r: Wholesaler) => r.wholesaler_id;

  // ===== GRID STRATEGIES =====

  const deleteStrategy: DeleteStrategy<Order> = {
    execute: handleOrderDelete,
  };

  const rowActionStrategy: RowActionStrategy<Order> = {
    click: handleOrderSelect,
  };
</script>

<!----- TEMPLATE ----->

<div class="list-page-content-wrapper">
  <h1>Suppliers</h1>
  <p>Select a supplier to view their details and manage their product categories.</p>


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
        rows = {resolvedOrders}
        {columns}
        {getId}
        loading = {isLoading || $orderLoadingState}
        gridId="wholesalers"
        entity="wholesaler"
        {deleteStrategy}
        {rowActionStrategy}
        apiLoadFunc = {orderApi.loadOrdersWithWhereAndOrder}
        maxBodyHeight="550px"
      />
    </div>
  {/if}
</div>

<style>
</style>
