<!-- OrderListPage.svelte -->

<script lang="ts">
  import { Order_Wholesaler_Schema, type Order_Wholesaler } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/list-page-layout.css";

  // --- API & Strategy Imports ---
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { ID, DeleteStrategy, RowActionStrategy, ColumnDef } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor, WhereCondition, WhereConditionGroup } from "$lib/backendQueries/queryGrammar";

  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { page } from "$app/state";
  import { getOrderApi, orderLoadingState } from "$lib/api/client/order";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import { safeParseFirstN } from "$lib/domain/domainTypes.utils";
  import { convertToHtml, isoDateStringToLocale } from "$lib/utils/formatUtils";

  // === PROPS ====================================================================================

  const { data }: { data: { loadEventFetch: typeof fetch } } = $props();

  // === STATE ====================================================================================

  let resolvedOrders = $state<Order_Wholesaler[]>([]);
  let isLoading = $state(false); // Start with false - Datagrid will trigger loading
  let loadingOrValidationError = $state<{
    message: string;
    status: number;
  } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === API ======================================================================================

  const client = new ApiClient(data.loadEventFetch);
  const orderApi = getOrderApi(client);

  // === LOAD =====================================================================================
  // Initial load is now controlled by Datagrid component via onQueryChange
  // No $effect needed - prevents race conditions and duplicate loads

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

  async function handleQueryChange(query: {
    filters: WhereCondition<Order_Wholesaler> | WhereConditionGroup<Order_Wholesaler> | null,
    sort: SortDescriptor<Order_Wholesaler>[] | null
  }) {
    log.info(`(OrderListPage) Query change - filters:`, query.filters, `sort:`, query.sort);

    // Reset state before loading
    isLoading = true;
    loadingOrValidationError = null;
    resolvedOrders = []; // Clear old data to prevent stale UI

    try {
      const orders = await orderApi.loadOrderWholesalersWithWhereAndOrder(
        query.filters as WhereConditionGroup<Order_Wholesaler> | null,
        query.sort
      );

      // IMPORTANT: Validate the first 4 orders with safeParseFirstN
      const valResult = safeParseFirstN(Order_Wholesaler_Schema, orders, 4);
      if (!valResult.success) {
        const msg = `Cannot validate orders: ${convertToHtml(JSON.stringify(valResult.error.issues))}`;
        loadingOrValidationError = { message: msg, status: 500 };
        log.error(msg);
      } else {
        resolvedOrders = orders;
        log.info(`(OrderListPage) Received ${orders.length} valid orders`);
      }
    } catch (rawError: any) {
      // Robust error handling from the original $effect
      const status = rawError.status ?? 500;
      const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading orders.";

      // Set the clean error state for the UI to display
      loadingOrValidationError = { message, status };

      // Log the full error for debugging
      log.error("(OrderListPage) Error loading orders", { rawError });
    } finally {
      isLoading = false;
    }
  }

  // === DATAGRID DATA ============================================================================

  const columns: ColumnDef<typeof Order_Wholesaler_Schema>[] = [
    { key: "w.name", header: "Wholesaler", accessor: (order) => order.wholesaler.name, sortable: true },
    { key: "ord.order_id", header: "ID", accessor: null, sortable: true },
    { key: "ord.order_date", header: "Date", accessor: (order) => isoDateStringToLocale(order.order_date), sortable: true },
  ];

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
        onQueryChange={handleQueryChange}
        maxBodyHeight="550px"
      />
    </div>
  {/if}
</div>

<style>
</style>
