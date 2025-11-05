<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  // Component Imports
  /* <refact01> DEPRECATED: wholesaler_categories removed - no more category assignments
  import CategoryAssignment from "$lib/components/domain/suppliers/CategoryAssignment.svelte";
  import SupplierCategoriesGrid from "$lib/components/domain/suppliers/SupplierCategoriesGrid.svelte";
  */
  import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";
  // API & Type Imports
  import { ApiClient } from "$lib/api/client/apiClient";
  import { categoryLoadingState, getCategoryApi } from "$lib/api/client/category";
  import { getSupplierApi, supplierLoadingState } from "$lib/api/client/supplier";
  import type { ColumnDef, DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import {
    type Order,
    type Order_Wholesaler,
    Order_Wholesaler_Schema,
    type ProductCategory,
    ProductCategorySchema,
    type Wholesaler,
    /* <refact01> DEPRECATED: wholesaler_categories removed
    type WholesalerCategory,
    type WholesalerCategory_Category_Nested,
    */
    WholesalerSchema,
  } from "$lib/domain/domainTypes";
  // Schemas
  import { page } from "$app/state";
  import { cascadeDelete /* <refact01>, cascadeDeleteAssignments, type CompositeID */ } from "$lib/api/client/cascadeDelete";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { error } from "@sveltejs/kit";
  import { getOrderApi } from "$lib/api/client/order";
  import { buildChildUrl, buildSiblingUrl } from "$lib/utils/url";

  // === TYPES ====================================================================================

  // TODO: Validate through typing, derived from navigationHierarchieConfig.
  export type SupplierChildRelationships = "categories" | "orders";

  // === PROPS ====================================================================================

  //let { data }: { data: SupplierDetailPage_LoadDataAsync } = $props();

  export interface SupplierDetailPageProps {
    supplierId: number;
    isCreateMode: boolean;
    activeChildPath: SupplierChildRelationships;
    loadEventFetch: typeof fetch;
    params: Record<string, number | string>;
  }

  let { data }: { data: SupplierDetailPageProps } = $props();

  // === STATE ====================================================================================

  let supplier = $state<Wholesaler | null>(null);
  /* <refact01> CHANGED: Show ALL categories instead of assigned ones
  let assignedCategories = $state<WholesalerCategory_Category_Nested[]>([]);
  let availableCategories = $state<ProductCategory[]>([]);
  */
  let categories = $state<ProductCategory[]>([]); // <refact01> All categories, no assignments
  let orders = $state<Order_Wholesaler[]>([]);

  //let resolvedData = $state<SupplierDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});
  const allowForceCascadingDelete = $state(true);

  // === API =====================================================================================

  // The following code is executed only ONCE whe the component is mounted => this is OK.
  if (!data.loadEventFetch) {
    throw error(500, `SupplierDetailPage: data.loadEventFetch must be defined.`);
  }
  const client = new ApiClient(data.loadEventFetch);
  const supplierApi = getSupplierApi(client);
  const categoryApi = getCategoryApi(client); // <refact01> Added for category master-data delete
  const orderApi = getOrderApi(client);

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
          // <refact01> CHANGED: Load ALL categories (no more assignments)
          categories = await supplierApi.loadCategoriesForSupplier(data.supplierId);
          if (aborted) return;
          const categoriesVal = safeParseFirstN(ProductCategorySchema, categories, 3);
          if (categoriesVal.error) {
            errors.categories = zodToValidationErrorTree(categoriesVal.error);
            log.error("Categories validation failed", errors.categories);
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

  // === FORM HANDLING ============================================================================

  async function handleFormSubmitted(info: { data: Wholesaler; result: unknown }) {
    addNotification(`Supplier saved successfully.`, "success");

    if (data.isCreateMode) {
      log.info("Submit successful in CREATE mode. Navigating to edit page...");

      // Get the new ID from the event data.
      // Thanks to our FormShell fix, info.data is the complete object from the API.
      const newSupplierId = info.data?.wholesaler_id;

      if (newSupplierId) {
        // Build the new "edit mode" URL.
        const newUrl = buildSiblingUrl(page.url.pathname, newSupplierId);

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

  // ===== HELPERS ================================================================================

  /* <refact01> DEPRECATED: No more category assignments - categories are just read-only
  // Reload categories and set them into the state.
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
  */

  // ===== BUSINESS LOGIC =========================================================================

  /* <refact01> DEPRECATED: wholesaler_categories removed - no more assignments
  // Handles the assignment of a new category.
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
  */

  // === CATEGORIES GRID FUNCTIONS ================================================================

  /**
   * Deletes categories (master data delete, not assignment).
   * <refact01> CHANGED: Now deletes category master data with cascade delete checks.
   */
  async function handleCategoryDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting categories (master data)`, { ids });
    assertDefined(ids, "ids");
    let dataChanged = false;

    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      categoryApi.deleteCategory,
      {
        domainObjectName: "Product Category",
        hardDepInfo: "Category has hard dependencies. Delete?",
        softDepInfo: "Category has soft dependencies. Delete?",
      },
      allowForceCascadingDelete,
    );

    if (dataChanged) {
      // Reload categories after delete
      assertDefined(supplier, "supplier must be defined");
      categories = await supplierApi.loadCategoriesForSupplier(supplier.wholesaler_id);
    }
  }

  /**
   * Navigates to the category detail page.
   * <refact01> CHANGED: Navigate to /categories/ID instead of /suppliers/ID/categories/ID
   */
  function handleCategorySelect(category: ProductCategory) {
    goto(`/categories/${category.category_id}`);
  }

  const categoriesRowActionStrategy: RowActionStrategy<ProductCategory> = {
    click: handleCategorySelect,
  };

  // <refact01> CHANGED: Delete now performs master-data delete (not assignment delete)
  const categoriesDeleteStrategy: DeleteStrategy<ProductCategory> = {
    execute: handleCategoryDelete,
  };

  /**
   * Handles category grid sorting.
   * <refact01> CHANGED: Now uses categoryApi.loadCategories directly with orderBy
   */
  async function handleCategoriesSort(sortState: SortDescriptor<ProductCategory>[] | null) {
    categories = await categoryApi.loadCategoriesWithWhereAndOrder(null, sortState);
  }

  // === ORDERS GRID ==============================================================================

  const ordersColumns: ColumnDef<typeof Order_Wholesaler_Schema>[] = [
    { key: "ord.order_id", header: "ID", accessor: null, sortable: true },
    { key: "w.name", header: "Wholesaler", accessor: (order) => order.wholesaler.name, sortable: true },
  ];
  const getOrdersRowId = (o: Order) => o.order_id;

  async function handleOrderDelete(ids: ID[]): Promise<void> {
    log.info(`Deleting orders`, { ids });
    assertDefined(ids, "ids");
    let dataChanged = false;

    if (data.isCreateMode) {
      log.error("Cannot delete in create mode.");
      addNotification("Cannot delete in create mode.", "error");
      return;
    }

    assertDefined(supplier, "supplier");
    const idsAsNumber = stringsToNumbers(ids);
    dataChanged = await cascadeDelete(
      idsAsNumber,
      orderApi.deleteOrder,
      {
        domainObjectName: "Order",
        hardDepInfo: "Order has hard dependencies. Delete?",
        softDepInfo: "Order has soft dependencies. Delete?",
      },
      allowForceCascadingDelete,
    );

    if (dataChanged) {
      // <refact01> TODO: Implement reloadOrders() if needed
      log.info("Order deleted, reload would happen here");
    }
  }

  function handleOrderCreate() {
    log.info(`Going to DetailPage with "new"`);
    goto(buildChildUrl(page.url.pathname, "orders", "new"));
  }

  function handleOrderSelect(order: Order_Wholesaler) {
    goto(buildChildUrl(page.url.pathname, "orders", order.order_id));
  }

  const ordersDeleteStrategy: DeleteStrategy<Order_Wholesaler> = {
    execute: handleOrderDelete,
  };

  const ordersRowActionStrategy: RowActionStrategy<Order_Wholesaler> = {
    click: handleOrderSelect,
  };

  async function handleOrdersSort(sortState: SortDescriptor<Order_Wholesaler>[] | null) {
    assertDefined(supplier, "supplier");
    orders = await supplierApi.loadOrdersForSupplier(supplier.wholesaler_id, null, sortState);
  }
</script>

<!------------------------------------------------------------------------------------------------
  SNIPPETS 
  ------------------------------------------------------------------------------------------------>

<!-- CATEGORIES GRID ----------------------------------------------------------------------------->
{#snippet categoryGridSection()}
  <div class="grid-section">
    {#if data.isCreateMode}
      <p>Categories will be available after supplier has been saved.</p>
    {:else}
      <h2>Product Categories</h2>
      <p>Browse all product categories. Click a category to view product definitions.</p>
      <!-- <refact01> CHANGED: Simple list of ALL categories (no assignments, no delete) -->
      <Datagrid
        rows={categories}
        columns={[
          { key: 'category_id', header: 'ID', width: '80px' },
          { key: 'name', header: 'Name', width: '200px' },
          { key: 'description', header: 'Description', width: 'auto' }
        ]}
        getId={(row) => row.category_id}
        loading={$categoryLoadingState}
        gridId="categories"
        entity="category"
        deleteStrategy={categoriesDeleteStrategy}
        rowActionStrategy={categoriesRowActionStrategy}
        onSort={handleCategoriesSort}
        maxBodyHeight="550px"
      />
    {/if}
  </div>
{/snippet}

<!-- ORDERS GRID---------------------------------------------------------------------------------->
{#snippet ordersGridSection()}
  <h2>Orders</h2>
  <div class="grid-section">
    {#if data.isCreateMode}
      <p>Assigned orders will be available after supplier has been saved.</p>
    {:else}
      <button
        class="pc-grid__createbtn"
        onclick={handleOrderCreate}
      >
        Create Order
      </button>
      <Datagrid
        rows={orders}
        columns={ordersColumns}
        getId={getOrdersRowId}
        loading={isLoading}
        gridId="orders"
        entity="order"
        deleteStrategy={ordersDeleteStrategy}
        rowActionStrategy={ordersRowActionStrategy}
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

      <!-- <refact01> DEPRECATED: Section 2 (Assign new categories) removed - no more assignments
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
      -->

      <!-- Section 3: Grid of categories (read-only) -->
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
