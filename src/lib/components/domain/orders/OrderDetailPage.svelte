<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";

  // Component Imports
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/grid-section.css";
  import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";
  import SupplierCategoriesGrid from "$lib/components/domain/suppliers/SupplierCategoriesGrid.svelte";
  import CategoryAssignment from "$lib/components/domain/suppliers/CategoryAssignment.svelte";

  // API & Type Imports
  import { supplierLoadingState } from "$lib/api/client/supplier";
  import {
    type ProductCategory,
    type WholesalerCategory_Category,
    type WholesalerCategory,
    type Wholesaler,
    type Order,
    type OrderItem_ProdDef_Category,
    OrderItem_ProdDef_Category_Schema,
    OrderSchema,
    type Order_Wholesaler,
  } from "$lib/domain/domainTypes";
  import { z } from "zod";
  import { categoryLoadingState } from "$lib/api/client/category";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";

  import { assertDefined } from "$lib/utils/assertions";
  import { cascadeDelete, cascadeDeleteAssignments, type CompositeID } from "$lib/api/client/cascadeDelete";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { getOrderApi, orderLoadingState } from "$lib/api/client/order";
  import { error } from "@sveltejs/kit";
    import { page } from "$app/state";
    import OrderForm from "./OrderForm.svelte";

  // === PROPS ====================================================================================

  let { data }: { data: { orderId: number; isCreateMode: boolean; loadEventFetch: typeof fetch } } = $props();

  // === STATE ====================================================================================

  let order = $state<Order | null>(null);
  let orderItems = $state<OrderItem_ProdDef_Category[] | null>(null);
  let isLoading = $state(true);
  let loadingError = $state<{ message: string; status?: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === API =====================================================================================

  const client = new ApiClient(data.loadEventFetch);
  const orderApi = getOrderApi(client);

  // === LOAD =====================================================================================

  // This is the core of the async pattern. It runs whenever the `data` prop changes.
  $effect(() => {
    let aborted = false;

    const processPromises = async () => {
      // 1. Reset state for each new load.
      isLoading = true;
      loadingError = null;

      try {
        if (data.isCreateMode) {
          [order, orderItems] = await Promise.all([orderApi.loadOrder(data.orderId), orderApi.loadOrderItemsForOrder(data.orderId)]);
          const orderValidationResult = OrderSchema.safeParse(order);
          const orderItemsValidationResult = z.array(OrderItem_ProdDef_Category_Schema).safeParse(orderItems);
          if (!(orderValidationResult.success && orderItemsValidationResult)) {
            const msg = `Validation failed: ${JSON.stringify(orderValidationResult.error?.issues, null, 4)},\n${JSON.stringify(orderItemsValidationResult.error?.issues, null, 4)}`;
            log.error(msg);
            throw error(500, msg);
          }
        }
        if (aborted) return;
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load order details.";
        loadingError = { message, status };
        log.error("Promise processing failed", {
          rawError,
        });
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

  async function handleFormSubmitted(info: { data: Wholesaler; result: unknown }) {
    addNotification(`Supplier saved successfully.`, "success");

    if (data.isCreateMode) {
      log.info("Submit successful in CREATE mode. Navigating to edit page...");

      // Get the new ID from the event data.
      // Thanks to our FormShell fix, info.data is the complete object from the API.
      const newSupplierId = info.data?.wholesaler_id;

      if (newSupplierId) {
        // Build the new "edit mode" URL.
        const newUrl = `/suppliers/${newSupplierId}`;

        // Navigate to the new URL to switch to edit mode.
        // invalidateAll is crucial to re-run the load function with the new ID.
        await goto(newUrl, { invalidateAll: true });
      } else {
        // This is a fallback case in case the API response was malformed.
        log.error("Could not redirect after create: new wholesaler_id is missing from response.", { data: info.data });
        addNotification("Could not redirect to edit page, returning to list.", "error");
        // Do not go to suppliers because we are in an invalid state.
      }
    } else {
      // FormShell has already updated its state.
      log.info("Submit successful in EDIT mode. Remaining on page.");
      // If it was an update, we do nothing else. The user stays on the current edit page.
    }
  }

  async function handleFormSubmitError(info: { data: Wholesaler; error: unknown }) {
    log.error(`Form submit error`, info.error);
    addNotification(`Form submit error: ${info.error}`, "error");
  }

  async function handleFormCancelled(info: { data: Wholesaler; reason?: string }) {
    log.debug(`Form cancelled`);
    addNotification(`Form cancelled.`, "info");
  }

  async function handleFormChanged(event: { data: Record<string, any> }) {
    log.debug(`Form changed`);
  }

  // ===== HELPERS =====

  /**
   * Reload categories and set them into the state.
   */
  async function reloadOrderItems() {
    assertDefined(order, "order");
    log.info("Re-fetching order items ...");
    orderItems = await  orderApi.loadOrderItemsForOrder(order.order_id),
    log.info("Local state updated.");
  }

  // ===== BUSINESS LOGIC =====

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
   * Navigates to the next hierarchy level (offerings for a category).
   */
  function handleOrderItemSelect(order: Order_Wholesaler) {
    goto(`${page.url.pathname}/oderitems/${order.order_id}`);
  }

  // Strategy objects for the CategoryGrid component.
  const deleteStrategy: DeleteStrategy<Order_Wholesaler> = {
    execute: handleOrdersDelete,
  };
  const rowActionStrategy: RowActionStrategy<Order_Wholesaler> = {
    click: handleOrderItemSelect,
  };
</script>

<!-- TEMPLATE  with conditional rendering based on loading state -->
{#if loadingError}
  <div class="component-error-boundary">
    <h3>Error Loading Supplier (Status: {loadingError.status})</h3>
    <p>{loadingError.message}</p>
  </div>
{:else if isLoading || !order}
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

    <!-- Section 3: Grid of assigned categories -->

    <div class="grid-section">
      {#if order}
        <h2>Order Items</h2>
        <SupplierCategoriesGrid
          rows={resolvedData.assignedCategories}
          loading={$categoryLoadingState}
          {deleteStrategy}
          {rowActionStrategy}
        />
      {:else}
        <p>Order items will be available after supplier has been saved.</p>
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
