<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  // Component Imports
  import CategoryAssignment from "$lib/components/domain/suppliers/CategoryAssignment.svelte";
  import SupplierCategoriesGrid from "$lib/components/domain/suppliers/SupplierCategoriesGrid.svelte";
  import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";
  // API & Type Imports
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { categoryLoadingState } from "$lib/api/client/category";
  import { getSupplierApi, supplierLoadingState } from "$lib/api/client/supplier";
  import type { ColumnDefBase, DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import {
    type Order,
    type Order_Wholesaler,
    Order_Wholesaler_Schema,
    type ProductCategory,
    ProductCategorySchema,
    type Wholesaler,
    type WholesalerCategory,
    type WholesalerCategory_Category,
    WholesalerSchema,
  } from "$lib/domain/domainTypes";
  // Schemas
  import { page } from "$app/state";
  import { cascadeDeleteAssignments, type CompositeID } from "$lib/api/client/cascadeDelete";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { error } from "@sveltejs/kit";

  // === TYPES ====================================================================================

  // TODO: Validate through typing, derived from navigationHierarchieConfig.
  export type ChildRelationships = "categories" | "orders";

  // === PROPS ====================================================================================

  //let { data }: { data: SupplierDetailPage_LoadDataAsync } = $props();

  export interface SupplierDetailPageProps {
    supplierId: number;
    isCreateMode: boolean;
    activeChildPath: ChildRelationships;
    loadEventFetch: typeof fetch;
    params: Record<string, number | string>;
  }

  let { data }: { data: SupplierDetailPageProps } = $props();

  // === STATE ====================================================================================

  let supplier = $state<Wholesaler | null>(null);
  let assignedCategories = $state<WholesalerCategory_Category[]>([]);
  let availableCategories = $state<ProductCategory[]>([]);
  let orders = $state<Order_Wholesaler[]>([]);

  //let resolvedData = $state<SupplierDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});
  const allowForceCascadingDelte = $state(true);

  // === API =====================================================================================

  // The following code is executed only ONCE whe the component is mounted => this is OK.
  if (!data.loadEventFetch) {
    throw error(500, `SupplierDetailPage: data.loadEventFetch must be defined.`);
  }
  const client = new ApiClient(data.loadEventFetch);
  const supplierApi = getSupplierApi(client);

  // === LOAD =====================================================================================

  // This is the core of the async pattern. It runs whenever the `data` prop changes.
  $effect(() => {
    let aborted = false;
    log.debug(`SupplierDetailPage data props:`, data);

    const processPromises = async () => {
      // 1. Reset state for each new load.
      isLoading = true;
      //resolvedData = null;

      try {
        supplier = await supplierApi.loadSupplier(data.supplierId);
        if (aborted) return;
        const supplierVal = WholesalerSchema.nullable().safeParse(supplier);
        if (supplierVal.error) {
          errors.supplier = zodToValidationErrorTree(supplierVal.error);
          log.error("Supplier validation failed", errors.supplier);
        }

        // === Categories path=================================================
        if ("categories" === data.activeChildPath) {
          assignedCategories = await supplierApi.loadCategoriesForSupplier(data.supplierId);
          if (aborted) return;
          availableCategories = await supplierApi.loadAvailableCategoriesForSupplier(data.supplierId);
          if (aborted) return;
          const assignedCategoriesVal = safeParseFirstN(ProductCategorySchema, assignedCategories, 3);
          const availableCategoriesVal = safeParseFirstN(ProductCategorySchema, availableCategories, 3);
          if (assignedCategoriesVal.error) {
            errors.assignedCategories = zodToValidationErrorTree(assignedCategoriesVal.error);
            log.error("Assigned categories validation failed", errors.assignedCategories);
          }
          if (availableCategoriesVal.error) {
            errors.availableCategories = zodToValidationErrorTree(availableCategoriesVal.error);
            log.error("Available categories validation failed", errors.availableCategories);
          }

          // === Orders path=================================================
        } else if ("orders" === data.activeChildPath) {
          orders = await supplierApi.loadOrdersForSupplier(data.supplierId);
          const ordersVal = safeParseFirstN(Order_Wholesaler_Schema, orders, 3);
          if (ordersVal.error) {
            errors.orders = zodToValidationErrorTree(ordersVal.error);
            log.error("Order validation failed", errors.orders);
          }
        } else {
          const msg = `Invalid data.activeChildPath: ${data.activeChildPath}`;
          errors.activeChildPath = { errors: [msg] };
          log.error(msg);
        }

        //
      } catch (rawError: any) {
        // Throw error for severe problems!
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load order details.";
        log.error("Promise processing failed", { rawError });
        throw error(status, message);
      } finally {
        if (!aborted) {
          // 7. Always end the loading state.
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

  // ===== SORT HANDLERS ==========================================================================

  async function handleCategoriesSort(sortState: SortDescriptor<WholesalerCategory_Category>[] | null) {
    assertDefined(supplier, "supplier");
    assignedCategories = await supplierApi.loadCategoriesForSupplier(supplier.wholesaler_id, null, sortState);
  }

  async function handleOrdersSort(sortState: SortDescriptor<Order_Wholesaler>[] | null) {
    assertDefined(supplier, "supplier");
    orders = await supplierApi.loadOrdersForSupplier(supplier.wholesaler_id, null, sortState);
  }

  // ===== HELPERS ================================================================================

  /**
   * Reload categories and set them into the state.
   */
  async function reloadCategories() {
    assertDefined(supplier, "reloadCategories: Supplier must be loaded/available");

    const supplierId = supplier.wholesaler_id;

    log.info("Re-fetching category lists after assignment...");
    const [updatedAssigned, updatedAvailable] = await Promise.all([
      supplierApi.loadCategoriesForSupplier(supplierId),
      supplierApi.loadAvailableCategoriesForSupplier(supplierId),
    ]);
    assignedCategories = updatedAssigned;
    availableCategories = updatedAvailable;
    log.info("Local state updated. UI will refresh seamlessly.");
  }

  // ===== BUSINESS LOGIC =========================================================================

  /**
   * Handles the assignment of a new category.
   */
  async function assignCategory(category: ProductCategory, comment?: string, link?: string) {
    assertDefined(category, "category");

    if (data.isCreateMode) {
      log.error("Cannot assign category in create mode.");
      addNotification("Cannot assign category in create mode.", "error");
      return;
    }

    assertDefined(supplier, "supplier");
    const supplierId = supplier.wholesaler_id;

    try {
      const wholesalerCategory: Omit<WholesalerCategory, "wholesaler_id"> = {
        category_id: category.category_id,
        ...(comment !== undefined ? { comment } : {}),
        ...(link !== undefined ? { link } : {}),
      };
      await supplierApi.assignCategoryToSupplier(supplierId, wholesalerCategory);
      addNotification(`Category "${category.name}" assigned successfully.`, "success");

      // await!
      await reloadCategories();
    } catch (error) {
      log.error(`Failed to assign category`, {
        supplierId,
        error,
      });
      addNotification("Failed to assign category.", "error");
    }
  }

  async function handleCategoryDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting categories`, { ids });
    let dataChanged = false;

    if (data.isCreateMode) {
      log.error("Cannot delete category in create mode.");
      addNotification("Cannot delte category in create mode.", "error");
      return;
    }

    assertDefined(supplier, "supplier");
    const idsAsNumber = stringsToNumbers(ids);
    const compositeIds: CompositeID[] = idsAsNumber.map((id) => ({
      parent1Id: supplier!.wholesaler_id,
      parent2Id: id,
    }));
    dataChanged = await cascadeDeleteAssignments(
      compositeIds,
      supplierApi.removeCategoryFromSupplier,
      {
        domainObjectName: "Category",
        hardDepInfo: "Category has hard dependencies. Delete?",
        softDepInfo: "Category has soft dependencies. Delete?",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      // Reload and change state.
      reloadCategories();
    }
  }

  /**
   * Navigates to the next hierarchy level (offerings for a category).
   */
  function handleCategorySelect(category: WholesalerCategory_Category) {
    goto(`${page.url.pathname}/categories/${category.category_id}`);
  }

  // Strategy objects for the CategoryGrid component.
  const deleteStrategy: DeleteStrategy<WholesalerCategory_Category> = {
    execute: handleCategoryDelete,
  };

  const rowActionStrategy: RowActionStrategy<WholesalerCategory_Category> = {
    click: handleCategorySelect,
  };

  // === DATAGRID DATA ============================================================================

  const ordersColumns: ColumnDefBase<typeof Order_Wholesaler_Schema>[] = [
    { key: "order_id", header: "ID", accessor: null, sortable: true },
    { key: "w.name", header: "ID", accessor: (order) => order.wholesaler.name, sortable: true }
  ];
  const getOrdersRowId = (o: Order) => o.order_id;
</script>

<!------------------------------------------------------------------------------------------------
  SNIPPETS 
  ------------------------------------------------------------------------------------------------>

<!-- CATEGORIES GRID ----------------------------------------------------------------------------->
{#snippet categoryGridSection()}
  <div class="grid-section">
    {#if data.isCreateMode}
      <p>Assigned categories will be available after supplier has been saved.</p>
    {:else}
      <h2>Assigned Categories</h2>
      <p>Products this supplier can offer are organized by these categories. Click a category to manage its product offerings.</p>
      <SupplierCategoriesGrid
        rows={assignedCategories}
        loading={$categoryLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
        onSort={handleCategoriesSort}
      />
    {/if}
  </div>
{/snippet}

<!-- ORDERS GRID---------------------------------------------------------------------------------->
{#snippet ordersGridSection()}
  <div class="grid-section">
    {#if data.isCreateMode}
      <p>Assigned orders will be available after supplier has been saved.</p>
    {:else}
      <h2>Orders</h2>
      <Datagrid
        rows={orders}
        columns={ordersColumns}
        getId={getOrdersRowId}
        loading={isLoading}
        gridId="orders"
        entity="order"
        {deleteStrategy}
        {rowActionStrategy}
        onSort={handleOrdersSort}
        maxBodyHeight="550px"
      />
    {/if}
  </div>
{/snippet}

<!------------------------------------------------------------------------------------------------
  TEMPLATE 
  ------------------------------------------------------------------------------------------------>
<ValidationWrapper {errors}>
  {#if isLoading}
    <div class="detail-page-layout">Loading supplier details...</div>
  {:else}
    <!-- The main UI is only rendered on success, using the `resolvedData` state. -->
    <div class="detail-page-layout">
      <!-- Section 1: Supplier details form -->
      <div class="form-section">
        <SupplierForm
          initial={supplier}
          disabled={$supplierLoadingState}
          onSubmitted={handleFormSubmitted}
          onCancelled={handleFormCancelled}
          onSubmitError={handleFormSubmitError}
          onChanged={handleFormChanged}
        />
      </div>

      <!-- Section 2: Assign new categories -->
      <div class="assignment-section">
        {#if supplier}
          <CategoryAssignment
            supplierId={supplier.wholesaler_id}
            {availableCategories}
            loading={$categoryLoadingState}
            assignCbk={assignCategory}
            onError={(msg) => addNotification(msg, "error")}
          />
        {:else}
          <p>Category assignment selection will be available after supplier has been saved.</p>
        {/if}
      </div>

      <!-- Section 3: Grid of assigned categories -->
      {#if "categories" === data.activeChildPath}
        {@render categoryGridSection()}
      {:else if "orders" === data.activeChildPath}
        {@render ordersGridSection()}
      {:else}
        <div class="component-error-boundary">
          Invalid child path: {data.activeChildPath}
        </div>
      {/if}
    </div>
  {/if}
</ValidationWrapper>

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
