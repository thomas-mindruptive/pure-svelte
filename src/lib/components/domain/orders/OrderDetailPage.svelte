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
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import type { ColumnDef, DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import {
      OrderItem_ProdDef_Category_Schema,
      OrderSchema,
      WholesalerSchema,
      type Order_Wholesaler,
      type OrderItem_ProdDef_Category,
      type Wholesaler,
  } from "$lib/domain/domainTypes";

  import { page } from "$app/state";
  import { isApiValidationError } from "$lib/api/api.types";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { getOrderApi, orderLoadingState } from "$lib/api/client/order";
  import { getOrderItemApi } from "$lib/api/client/orderItem";
  import { getSupplierApi } from "$lib/api/client/supplier";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { stringifyForHtml } from "$lib/utils/formatUtils";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { buildChildUrl, buildSiblingUrl, getParentPath } from "$lib/utils/url";
  import { error } from "@sveltejs/kit";
  import OrderForm from "./OrderForm.svelte";

  // === PROPS ====================================================================================

  let {
    data,
  }: {
    data: {
      orderId: number;
      isCreateMode: boolean;
      isOrdersRoute: boolean;
      isSuppliersRoute: boolean;
      loadEventFetch: typeof fetch;
      params: Record<string, number | string>;
    };
  } = $props();

  // === STATE ====================================================================================

  let order = $state<Order_Wholesaler | null>(null);
  let orderItems = $state<OrderItem_ProdDef_Category[] | null>(null);
  let availableWholesalers = $state<Wholesaler[]>([]);
  let wholeSalerOfSuppliersRoute = $state<Wholesaler | null>(null);
  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});
  const allowForceCascadingDelte = $state(true);

  // === API =====================================================================================

  // The following code is executed only ONCE whe the component is mounted => this is OK.
  if (!data.loadEventFetch) {
    throw error(500, `OrderDetailPage: data.loadEventFetch must be defined.`);
  }
  const client = new ApiClient(data.loadEventFetch);
  const orderApi = getOrderApi(client);
  const orderItemApi = getOrderItemApi(client);
  const supplierApi = getSupplierApi(client);

  // === LOAD =====================================================================================

  // This is the core of the async pattern. It runs whenever the `data` prop changes.
  $effect(() => {
    log.info("$effect triggered", { data });
    let aborted = false;

    const processPromises = async () => {
      log.info("processPromises started");
      isLoading = true;

      try {
        // Load wholesalers for the form (needed in both CREATE and EDIT mode)
        availableWholesalers = await supplierApi.loadSuppliers();
        const wholesalersValidationResult = safeParseFirstN(WholesalerSchema, availableWholesalers, 3);
        if (wholesalersValidationResult.error) {
          errors.wholesalers = zodToValidationErrorTree(wholesalersValidationResult.error);
          log.error(`Error validating wholesalers:`, errors.wholesalers);
        }

        if (data.isCreateMode) {
          order = null;
          orderItems = [];

          // Suppliers route => User cannot use the "suppliers" combobox,
          // because supplier id is given by URL param.
          // => Load the supplier from the URL param.
          if (data.isSuppliersRoute) {
            const supplierId = Number(data.params.supplierId);
            if (isNaN(supplierId)) {
              errors.params = { supplierId: { errors: [`URL param "supplierId" must be set if "isSuppliersRoute"`] } };
            } else {
              wholeSalerOfSuppliersRoute = await supplierApi.loadSupplier(supplierId);
            }
          }
        } else {
          /**
           * NOTE: We collect validation errors but we throw in case of other errors, see "catch".
           */
          [order, orderItems] = await Promise.all([
            orderApi.loadOrderWholesaler(data.orderId),
            orderApi.loadOrderItemsForOrder(data.orderId),
          ]);
          const orderValidationResult = OrderSchema.safeParse(order);
          const orderItemsValidationResult = safeParseFirstN(OrderItem_ProdDef_Category_Schema, orderItems, 3);
          if (orderValidationResult.error) {
            errors.order = zodToValidationErrorTree(orderValidationResult.error);
            log.error(`Error validating order:`, errors.order);
          }
          if (orderItemsValidationResult.error) {
            errors.orderItems = zodToValidationErrorTree(orderItemsValidationResult.error);
            log.error(`Error validating order items:`, errors.orderItems);
          }
        }
        if (aborted) return;
      } catch (rawError: unknown) {
        // ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
        // We process the promises async!
        // => Do not throw error here because it ends up in Nirwana.
        // Instead, add them to the validation errors, which will be shown in the UI.
        //
        // TODO: Change other pages, too!
        // ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
        if (aborted) return;

        // Type-safe error handling with App.Error
        if (isApiValidationError(rawError)) {
          errors.loadError = rawError.valTree;
          log.error("Promise processing failed", rawError);
        } else {
          // Fallback for non-App.Error errors
          const fallbackMsg = rawError instanceof Error ? rawError.message : "Failed to load order details.";
          errors.loadError = {
            errors: [fallbackMsg],
          };
          log.error("Promise processing failed", { rawError });
        }
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

  async function handleFormSubmitted(info: { data: Order_Wholesaler; result: unknown }) {
    addNotification(`Order saved successfully.`, "success");

    if (data.isCreateMode) {
      log.info("Submit successful in CREATE mode. Navigating to edit page...");

      // Get the new ID from the event data.
      // Thanks to our FormShell fix, info.data is the complete object from the API.
      const newOrderId = info.data?.order_id;

      if (newOrderId) {
        // Go to edit mode
        const newUrl = buildSiblingUrl(page.url.pathname, newOrderId);
        await goto(newUrl, { invalidateAll: true });
      } else {
        // This is a fallback case in case the API response was malformed.
        log.error("Could not redirect after create: new order_id is missing from response.", { data: info.data });
        addNotification("Could not redirect to edit page, newOrderId is not set.", "error");
        // Do not go to orders because we are in an invalid state.
      }
    } else {
      // FormShell has already updated its state.
      log.info("Submit successful in EDIT mode. Remaining on page.");
      // If it was an update, we do nothing else. The user stays on the current edit page.
    }
  }

  async function handleFormSubmitError(info: { data: Order_Wholesaler; error: unknown }) {
    log.error(`Form submit error`, info.error);
    addNotification(`Form submit error: ${info.error}`, "error");
  }

  async function handleFormCancelled(info: { data: Order_Wholesaler; reason?: string }) {
    log.debug(`Form cancelled`);
    addNotification(`Form cancelled.`, "info");
    const newUrl = getParentPath(page.url);
    await goto(newUrl, { invalidateAll: true });
  }

  async function handleFormChanged(event: { data: Record<string, any> }) {
    log.debug(`Form changed`);
  }

  /**
   * Navigates to the next hierarchy level.
   */
  function handleOrderItemSelect(orderItem: OrderItem_ProdDef_Category) {
    goto(buildChildUrl(page.url.pathname, "orderitems", orderItem.order_item_id));
  }

  // ===== SORT HANDLERS =====

  async function handleOrderItemsSort(sortState: SortDescriptor<OrderItem_ProdDef_Category>[] | null) {
    assertDefined(order, "order");
    orderItems = await orderApi.loadOrderItemsForOrder(order.order_id, null, sortState);
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
    goto(buildChildUrl(page.url.pathname, "orderitems", "new"));
  }

  async function handleOrderItemsDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting order items`, { ids });
    let dataChanged = false;

    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      orderItemApi.deleteOrderItem,
      {
        domainObjectName: "OrderItem",
        hardDepInfo: "Has hard dependencies. Delete?",
        softDepInfo: "Has soft dependencies. Delete?",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      // Reload and change state.
      reloadOrderItems();
    }
  }

  // === DATAGRID DATA =====

  const columns: ColumnDef<typeof OrderItem_ProdDef_Category_Schema>[] = [
    { key: "pc.name", header: "Product Category", accessor: (orderItem) => orderItem.category.name, sortable: true },
    { key: "wio.price", header: "Price", accessor: (orderItem) => orderItem.offering.price, sortable: true },
    { key: "wio.comment", header: "Comment", accessor: (orderItem) => orderItem.offering.comment, sortable: true },
    { key: "wio.size", header: "Size", accessor: (orderItem) => orderItem.offering.size, sortable: true },
    { key: "wio.dimensions", header: "Dimensions", accessor: (orderItem) => orderItem.offering.dimensions, sortable: true },
  ];

  const getId = (r: OrderItem_ProdDef_Category) => r.order_item_id;

  // === DATAGRID STRATEGIES =====

  // Strategy objects for the OrderItem grid.
  const deleteStrategy: DeleteStrategy<OrderItem_ProdDef_Category> = {
    execute: handleOrderItemsDelete,
  };
  const rowActionStrategy: RowActionStrategy<OrderItem_ProdDef_Category> = {
    click: handleOrderItemSelect,
  };
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
    <!-- Section 1: Supplier details form -->
    <div class="form-section">
      <OrderForm
        isCreateMode={data.isCreateMode}
        initial={order}
        wholeSalerOfOrder={wholeSalerOfSuppliersRoute}
        {availableWholesalers}
        isOrdersRoute={data.isOrdersRoute}
        isSuppliersRoute={data.isSuppliersRoute}
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
            loading={isLoading}
            gridId="orderItems"
            entity="orderItem"
            {deleteStrategy}
            {rowActionStrategy}
            onSort={handleOrderItemsSort}
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
