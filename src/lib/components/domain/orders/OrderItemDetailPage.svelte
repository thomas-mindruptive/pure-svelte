<!-- src/lib/components/domain/orders/OrderItemDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  // Component Imports
  import "$lib/components/styles/detail-page-layout.css";
  // API & Type Imports
  import { ApiClient } from "$lib/api/client/ApiClient";
  import {
    OrderItem_ProdDef_Category_Schema,
    OrderSchema,
    type Order,
    type OrderItem,
    type OrderItem_ProdDef_Category,
    type WholesalerItemOffering_ProductDef_Category_Supplier_Nested,
  } from "$lib/domain/domainTypes";

  import { getOrderApi } from "$lib/api/client/order";
  import { getOrderItemApi, orderItemLoadingState } from "$lib/api/client/orderItem";
  import { getSupplierApi } from "$lib/api/client/supplier";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { stringifyForHtml } from "$lib/utils/formatUtils";
  import { error } from "@sveltejs/kit";
  import OrderItemForm from "./OrderItemForm.svelte";

  // === PROPS ====================================================================================

  let {
    data,
  }: {
    data: {
      orderId: number;
      orderItemId: number | null;
      isCreateMode: boolean;
      isOrdersRoute: boolean;
      isSuppliersRoute: boolean;
      loadEventFetch: typeof fetch;
      params: Record<string, number | string>;
    };
  } = $props();

  // === STATE ====================================================================================

  let order = $state<Order | null>(null);
  let orderItem = $state<OrderItem_ProdDef_Category | null>(null);
  let availableOfferings = $state<WholesalerItemOffering_ProductDef_Category_Supplier_Nested[]>([]);
  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});

  // === API =====================================================================================

  const client = new ApiClient(data.loadEventFetch);
  const orderApi = getOrderApi(client);
  const orderItemApi = getOrderItemApi(client);
  const supplierApi = getSupplierApi(client);

  // === LOAD =====================================================================================

  // This is the core of the async pattern. It runs whenever the `data` prop changes.
  $effect(() => {
    log.info("$effect triggered", { orderId: data.orderId, orderItemId: data.orderItemId, isCreateMode: data.isCreateMode });
    let aborted = false;

    const processPromises = async () => {
      log.info("processPromises started");
      isLoading = true;

      try {
        // Load order to get wholesaler_id (needed in both CREATE and EDIT mode)
        order = await orderApi.loadOrder(data.orderId);
        const orderValidationResult = OrderSchema.safeParse(order);
        if (orderValidationResult.error) {
          errors.order = zodToValidationErrorTree(orderValidationResult.error);
          log.error(`Error validating order:`, errors.order);
        }

        if (data.isCreateMode) {
          orderItem = null;
        } else {
          // Load order item in EDIT mode
          orderItem = await orderItemApi.loadOrderItem(data.orderItemId!);
          const orderItemValidationResult = OrderItem_ProdDef_Category_Schema.safeParse(orderItem);
          if (orderItemValidationResult.error) {
            errors.orderItem = zodToValidationErrorTree(orderItemValidationResult.error);
            log.error(`Error validating order item:`, errors.orderItem);
          }
        }

        // Load available offerings for the order's supplier
        if (order?.wholesaler_id) {
          availableOfferings = await supplierApi.loadOfferingsForSupplier(order.wholesaler_id);
          log.info(`Loaded ${availableOfferings.length} offerings for supplier ${order.wholesaler_id}`);
        }

        if (aborted) return;
      } catch (rawError: any) {
        // Throw error for severe problems!
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load order item details.";
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

  async function handleFormSubmitted(info: { data: OrderItem; result: unknown }) {
    addNotification(`Order item saved successfully.`, "success");

    if (data.isCreateMode) {
      log.info("Submit successful in CREATE mode. Returning to order detail page...");

      // Get the new ID from the event data.
      const newOrderItemId = info.data?.order_item_id;

      if (newOrderItemId) {
        // Navigate back to order detail page
        const orderDetailUrl = `/orders/${data.orderId}`;
        await goto(orderDetailUrl, { invalidateAll: true });
      } else {
        log.error("Could not redirect after create: new order_item_id is missing from response.", { data: info.data });
        addNotification("Could not redirect, returning to order detail.", "error");
      }
    } else {
      // FormShell has already updated its state.
      log.info("Submit successful in EDIT mode. Remaining on page.");
    }
  }

  async function handleFormSubmitError(info: { data: OrderItem; error: unknown }) {
    log.error(`Form submit error`, info.error);
    addNotification(`Form submit error: ${info.error}`, "error");
  }

  async function handleFormCancelled(info: { data: OrderItem; reason?: string }) {
    log.debug(`Form cancelled`);
    addNotification(`Form cancelled.`, "info");
    // Navigate back to order detail page
    await goto(`/orders/${data.orderId}`);
  }

  async function handleFormChanged(event: { data: Record<string, any> }) {
    log.debug(`Form changed`);
  }
</script>

<!-- TEMPLATE  with conditional rendering based on loading state -->
{#if Object.keys(errors).length > 0}
  <div class="component-error-boundary">
    <h3>Errors</h3>
    <p>{@html stringifyForHtml(errors)}</p>
  </div>
{:else if isLoading}
  <div class="detail-page-layout">Loading details...</div>
{:else}
  <!-- The main UI is only rendered on success, using the `resolvedData` state. -->
  <div class="detail-page-layout">
    <!-- Section 1: Order item details form -->
    <div class="form-section">
      <OrderItemForm
        isCreateMode={data.isCreateMode}
        initial={orderItem}
        order={order!}
        {availableOfferings}
        disabled={$orderItemLoadingState}
        onSubmitted={handleFormSubmitted}
        onCancelled={handleFormCancelled}
        onSubmitError={handleFormSubmitError}
        onChanged={handleFormChanged}
      />
    </div>
  </div>
{/if}

<style>
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
</style>
