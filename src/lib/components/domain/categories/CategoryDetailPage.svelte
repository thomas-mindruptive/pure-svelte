<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from "$lib/stores/confirmation";

  // Component Imports
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/grid-section.css";
  import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";

  // API & Type Imports
  import { supplierLoadingState } from "$lib/api/client/supplier";
  import type { Wholesaler, ProductDefinition } from "$lib/domain/domainTypes";
  import { categoryLoadingState } from "$lib/api/client/category";
  import { getCategoryApi } from '$lib/api/client/offering';
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";

  // Schemas

  import { assertDefined } from "$lib/utils/validation/assertions";
  import {
    type CategoryDetailPage_LoadDataAsync,
    type CategoryDetailPage_LoadData,
    CategoryDetailPage_LoadDataSchema,
  } from "./categoryDetailPage.types";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
    import CategoryProductDefsGrid from "./CategoryProductDefsGrid.svelte";

  // === PROPS ====================================================================================

  let { data }: { data: CategoryDetailPage_LoadDataAsync } = $props();

  // === STATE ====================================================================================

  let resolvedData = $state<CategoryDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  let loadingError = $state<{ message: string; status?: number } | null>(null);
  const isCreateMode = $derived(!resolvedData?.category);

  // === LOAD =====================================================================================

  // This is the core of the async pattern. It runs whenever the `data` prop changes.
  $effect(() => {
    let aborted = false;

    const processPromises = async () => {
      // 1. Reset state for each new load.
      isLoading = true;
      loadingError = null;
      resolvedData = null;

      try {
        // 2. Resolve all promises in parallel.
        const [supplier] = await Promise.all([data.category, data.productDefinitions]);

        if (aborted) return;

        // 3. Assemble the data object for validation.
        const dataToValidate = {
          supplier,
        };

        // 4. Validate the resolved data against the Zod schema.
        const validationResult = CategoryDetailPage_LoadDataSchema.safeParse(dataToValidate);

        if (!validationResult.success) {
          log.error("Zod validation failed", validationResult.error.issues);
          // Treat a validation failure as a loading error.
          throw new Error("Received invalid data structure from the API.");
        }

        // 5. On success, populate the state with the validated, resolved data.
        resolvedData = validationResult.data;
      } catch (rawError: any) {
        if (aborted) return;
        // 6. Handle any error from fetching or validation.
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load supplier details.";
        loadingError = { message, status };
        log.error("Promise processing failed", {
          rawError,
        });
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

  const client = new ApiClient(fetch);
  const categoryApi = getCategoryApi(client);
  const productDefApi = getProductDefinitionApi(client);

  async function handleFormSubmitted(info: { data: Wholesaler; result: unknown }) {
    addNotification(`Supplier saved successfully.`, "success");

    if (isCreateMode) {
      log.info("Submit successful in CREATE mode. Navigating to edit page...");

      // Get the new ID from the event data.
      // Thanks to our FormShell fix, info.data is the complete object from the API.
      const newCategoryId = info.data?.wholesaler_id;

      if (newCategoryId) {
        // Build the new "edit mode" URL.
        const newUrl = `/categories/${newCategoryId}`;

        // Navigate to the new URL to switch to edit mode.
        // invalidateAll is crucial to re-run the load function with the new ID.
        await goto(newUrl, { invalidateAll: true });
      } else {
        // This is a fallback case in case the API response was malformed.
        log.error("Could not redirect after create: newCategoryId is missing from response.", { data: info.data });
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
  async function reloadProductDefs() {
    assertDefined(resolvedData, "reloadCategories: Supplier must be loaded/available", ["supplier"]);

    // We validated above that the data is correct.
    const categoryId = resolvedData.category!.category_id;

    log.info("Re-fetching lists after assignment...");
    const [updatedProductDefs] = await Promise.all([categoryApi.loadProductDefsForCategory(categoryId)]);
    resolvedData.productDefinitions = updatedProductDefs;
    log.info("Local state updated. UI will refresh seamlessly.");
  }

  // ===== BUSINESS LOGIC =====

  /**
   * Executes the deletion process for product definitions.
   */
  async function handleProductDefDelete(ids: ID[]): Promise<void> {
    if (!resolvedData?.category) {
      const msg = "Cannot delete product definition in create mode or when catgory not yet loaded.";
      addNotification(msg, "error");
      throw new Error(msg);
    }

    let dataChanged = false;
    for (const id of ids) {
      const [categoryIdStr, productDefIdStr] = String(id).split("-");
      const categoryId = Number(categoryIdStr);
      const productDefId = Number(productDefIdStr);
      if (isNaN(productDefId) || isNaN(categoryId)) {
        throw new Error(`Invalid categoryId or productDefId: ${id}`);
      }

      const initialResult = await productDefApi.deleteProductDefinition(productDefId);

      if (initialResult.success) {
        addNotification(`Product definition delted.`, "success");
        dataChanged = true;
      } else if ("cascade_available" in initialResult && initialResult.cascade_available) {
        const offeringCount = (initialResult.dependencies as any)?.offering_count ?? 0;
        const confirmed = await requestConfirmation(
          `This category has ${offeringCount} offerings for this category. Remove these offerings (will be removed from suppliers, too!)?`,
          "Confirm Cascade Delete",
        );
        if (confirmed) {
          const cascadeResult = await productDefApi.deleteProductDefinition(productDefId, true);
          if (cascadeResult.success) {
            addNotification("Category assignment and its offerings removed.", "success");
            dataChanged = true;
          } else {
            addNotification(cascadeResult.message || "Failed to remove assignment.", "error");
          }
        }
      } else {
        addNotification(initialResult.message || "Could not remove assignment.", "error");
      }
    }

    if (dataChanged) {
      reloadProductDefs();
    }
  }

  /**
   * Navigates to the next hierarchy level (offerings for a category).
   */
  function handleProductDefSelect(pd: ProductDefinition) {
    goto(`/categories/${pd.category_id}/productdefs/${pd.product_def_id}`);
  }

  // Strategy objects for the CategoryGrid component.
  const deleteStrategy: DeleteStrategy<ProductDefinition> = {
    execute: handleProductDefDelete,
  };
  const rowActionStrategy: RowActionStrategy<ProductDefinition> = {
    click: handleProductDefSelect,
  };
</script>

<!-- TEMPLATE  with conditional rendering based on loading state -->

{#if loadingError}
  <div class="component-error-boundary">
    <h3>Error Loading Supplier (Status: {loadingError.status})</h3>
    <p>{loadingError.message}</p>
  </div>
{:else if isLoading || !resolvedData}
  <div class="detail-page-layout">Loading supplier details...</div>
{:else}
  <!-- The main UI is only rendered on success, using the `resolvedData` state. -->
  <div class="detail-page-layout">
    <!-- Section 1: Supplier details form -->
    <div class="form-section">
      <SupplierForm
        initial={{} as any}   
        disabled={$supplierLoadingState}
        onSubmitted={handleFormSubmitted}
        onCancelled={handleFormCancelled}
        onSubmitError={handleFormSubmitError}
        onChanged={handleFormChanged}
      />
    </div>

    <!-- Section 3: Grid of assigned categories -->

    <div class="grid-section">
      {#if resolvedData.productDefinitions}
        <h2>Assigned Categories</h2>
        <p>Products this supplier can offer are organized by these categories. Click a category to manage its product offerings.</p>
        <CategoryProductDefsGrid
          rows={resolvedData.productDefinitions}
          loading={$categoryLoadingState}
          {deleteStrategy}
          {rowActionStrategy}
        />
      {:else}
        <p>Assigned categories will be available after supplier has been saved.</p>
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
