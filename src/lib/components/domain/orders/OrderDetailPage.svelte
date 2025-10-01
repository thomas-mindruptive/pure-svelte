<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  // Component Imports
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";
  // API & Type Imports
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ColumnDefBase, DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import {
    OrderItem_ProdDef_Category_Schema,
    OrderSchema,
    type Order,
    type Order_Wholesaler,
    type OrderItem_ProdDef_Category,
    type Wholesaler,
  } from "$lib/domain/domainTypes";
  import { z } from "zod";

  import { page } from "$app/state";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { getOrderApi, orderLoadingState } from "$lib/api/client/order";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import { assertDefined } from "$lib/utils/assertions";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { error } from "@sveltejs/kit";
  import OrderForm from "./OrderForm.svelte";
  import { safeParseFirstN, toErrorRecord, type ValErrorRecord } from "$lib/domain/domainTypes.utils";
  import { stringifyForHtml } from "$lib/utils/formatUtils";

  // === PROPS ====================================================================================

  let { data }: { data: { orderId: number; isCreateMode: boolean; loadEventFetch: typeof fetch } } = $props();

  // === STATE ====================================================================================

  let order = $state<Order | null>(null);
  let orderItems = $state<OrderItem_ProdDef_Category[] | null>(null);
  let isLoading = $state(true);
  //let loadingError = $state<{ message: string; status?: number } | null>(null);
  const errors = $state<Record<string, ValErrorRecord>>({});
  const allowForceCascadingDelte = $state(true);

  // === API =====================================================================================

  const client = new ApiClient(data.loadEventFetch);
  const orderApi = getOrderApi(client);

  // === LOAD =====================================================================================

  // This is the core of the async pattern. It runs whenever the `data` prop changes.
  $effect(() => {
    log.info("$effect triggered", { orderId: data.orderId, isCreateMode: data.isCreateMode });
    let aborted = false;

    const processPromises = async () => {
      log.info("processPromises started");
      isLoading = true;

      try {
        if (data.isCreateMode) {
          order = null; 
          orderItems = [];
        } else {
          /**
           * NOTE: We collect val errors but we throw in case of other errors, see "catch".  
           */
          [order, orderItems] = await Promise.all([orderApi.loadOrder(data.orderId), orderApi.loadOrderItemsForOrder(data.orderId)]);
          const orderValidationResult = OrderSchema.safeParse(order);
          const orderItemsValidationResult = safeParseFirstN(OrderItem_ProdDef_Category_Schema, orderItems, 3); // z.array(OrderItem_ProdDef_Category_Schema).safeParse(orderItems);
          if (orderValidationResult.error) {
            errors.order = toErrorRecord(orderValidationResult.error);
            log.error(`Error validating order:`, errors.order);
          }
          if (orderItemsValidationResult.error) {
            errors.orderItems = toErrorRecord(orderItemsValidationResult.error);
            log.error(`Error validating order items:`, errors.orderItems);
          }
        }
        if (aborted) return;

      } catch (rawError: any) {
        // Throw error for severe problems!
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load order details.";
        log.error("Promise processing failed", { rawError });
        throw error(status, message);
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    processPromises();
    return () => {
      aborted = true;
    };
  });

  // === EVENTS & STRATEGIES ======================================================================

  async function handleFormSubmitted(info: { data: Order; result: unknown }) {
    addNotification(`Order saved successfully.`, "success");

    if (data.isCreateMode) {
      log.info("Submit successful in CREATE mode. Navigating to edit page...");

      // Get the new ID from the event data.
      // Thanks to our FormShell fix, info.data is the complete object from the API.
      const newOrderId = info.data?.order_id;

      if (newOrderId) {
        // Build the new "edit mode" URL.
        const newUrl = `/orders/${newOrderId}`;

        // Navigate to the new URL to switch to edit mode.
        // invalidateAll is crucial to re-run the load function with the new ID.
        await goto(newUrl, { invalidateAll: true });
      } else {
        // This is a fallback case in case the API response was malformed.
        log.error("Could not redirect after create: new order_id is missing from response.", { data: info.data });
        addNotification("Could not redirect to edit page, returning to list.", "error");
        // Do not go to orders because we are in an invalid state.
      }
    } else {
      // FormShell has already updated its state.
      log.info("Submit successful in EDIT mode. Remaining on page.");
      // If it was an update, we do nothing else. The user stays on the current edit page.
    }
  }

  async function handleFormSubmitError(info: { data: Order; error: unknown }) {
    log.error(`Form submit error`, info.error);
    addNotification(`Form submit error: ${info.error}`, "error");
  }

  async function handleFormCancelled(info: { data: Order; reason?: string }) {
    log.debug(`Form cancelled`);
    addNotification(`Form cancelled.`, "info");
  }

  async function handleFormChanged(event: { data: Record<string, any> }) {
    log.debug(`Form changed`);
  }

  // ===== HELPERS =====

  /**
   * Reload order items and set them into the state.
   */
  async function reloadOrderItems() {
    assertDefined(order, "order");
    log.info("Re-fetching order items ...");
    ((orderItems = await orderApi.loadOrderItemsForOrder(order.order_id)), log.info("Local state updated."));
  }

  // ===== BUSINESS LOGIC =====

  async function handleOrderItemCreate() {
    log.info(`Navigating to create new order item.`);
    goto(`${page.url.pathname}/orderitems/new`);
  }

  async function handleOrdersDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting orders`, { ids });
    let dataChanged = false;

    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      orderApi.deleteOrder,
      {
        domainObjectName: "Order",
        hardDepInfo: "Has hard dependencies. Delete?",
        softDepInfo: "Has has soft dependencies. Delete?",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      // Reload and change state.
      reloadOrderItems();
    }
  }

  /**
   * Navigates to the next hierarchy level.
   */
  function handleOrderItemSelect(order: Order_Wholesaler) {
    goto(`${page.url.pathname}/oderitems/${order.order_id}`);
  }

  // === DATAGRID DATA =====

  const columns: ColumnDefBase<typeof OrderItem_ProdDef_Category_Schema>[] = [
    { key: "pc.name", header: "Product Category", accessor: (orderItem) => orderItem.category.name, sortable: true },
    { key: "wio.price", header: "Price", accessor: (orderItem) => orderItem.offering.price, sortable: true },
    { key: "wio.comment", header: "Comment", accessor: (orderItem) => orderItem.offering.comment, sortable: true },
    { key: "wio.size", header: "Size", accessor: (orderItem) => orderItem.offering.size, sortable: true },
    { key: "wio.dimensions", header: "Size", accessor: (orderItem) => orderItem.offering.dimensions, sortable: true },
  ];

  const getId = (r: Wholesaler) => r.wholesaler_id;

  // === DATAGRID STRATEGIES =====

  // Strategy objects for the CategoryGrid component.
  const deleteStrategy: DeleteStrategy<Order_Wholesaler> = {
    execute: handleOrdersDelete,
  };
  const rowActionStrategy: RowActionStrategy<Order_Wholesaler> = {
    click: handleOrderItemSelect,
  };
</script>

<!-- TEMPLATE  with conditional rendering based on loading state -->
{#if (Object.keys(errors).length > 0)}
  <div class="component-error-boundary">
    <h3>Errors</h3>
    <p>{@html stringifyForHtml(errors)}</p>
  </div>
{:else if isLoading }
  <div class="detail-page-layout">Loading details...</div>
{:else}
  <!-- The main UI is only rendered on success, using the `resolvedData` state. -->
  <div class="detail-page-layout">
    <!-- Section 1: Supplier details form -->
    <div class="form-section">
      <OrderForm
        isCreateMode={data.isCreateMode}
        initial={order}
        disabled={$orderLoadingState}
        onSubmitted={handleFormSubmitted}
        onCancelled={handleFormCancelled}
        onSubmitError={handleFormSubmitError}
        onChanged={handleFormChanged}
      />
    </div>

    <!-- Section 3: Grid  -->

    <div class="grid-section">
      {#if data.isCreateMode}
        <p>Order items will be available after order has been saved.</p>
      {:else}
        <h2>Order Items</h2>
        <div class="grid-section">
          <button
            class="pc-grid__createbtn"
            onclick={handleOrderItemCreate}
          >
            Create Order Item
          </button>
          <Datagrid
            rows={orderItems!}
            {columns}
            {getId}
            loading={isLoading || $orderLoadingState}
            gridId="wholesalers"
            entity="wholesaler"
            {deleteStrategy}
            {rowActionStrategy}
            apiLoadFunc={orderApi.loadOrdersWithWhereAndOrder}
            maxBodyHeight="550px"
          />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
  .grid-section {
    padding: 1.5rem;
  }
  h2 {
    margin-top: 0;
  }
  p {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--color-muted);
  }
</style>
