<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte (FINAL) -->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from "$lib/stores/confirmation";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getOfferingApi, offeringLoadingState } from "$lib/api/client/offering";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { ProductDefinition, WholesalerItemOffering_ProductDef_Category_Supplier } from "$lib/domain/domainTypes";

  // Component Imports
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";
  import ProductDefinitionForm from "./ProductDefinitionForm.svelte"; // The new form component
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";

  // Type and Schema Imports
  import {
    ProductDefinitionDetailPage_LoadDataSchema,
    type ProductDefinitionDetailPage_LoadData,
    type ProductDefinitionDetailPage_LoadDataAsync,
  } from "./productDefinitionDetailPage.types";
  import { assertDefined } from "$lib/utils/validation/assertions";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";

  // === PROPS ====================================================================================
  let { data }: { data: ProductDefinitionDetailPage_LoadDataAsync } = $props();

  // === STATE ====================================================================================

  let resolvedData = $state<ProductDefinitionDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  let loadingError = $state<{ message: string; status?: number } | null>(null);
  
  // === LOAD DATA ================================================================================

  $effect(() => {
    log.debug(`data props:`, data);
    let aborted = false;
    const processPromises = async () => {
      isLoading = true;
      loadingError = null;
      resolvedData = null;

      try {
        const [productDefinition, offerings] = await Promise.all([data.productDefinition, data.offerings]);
        log.debug(`Promised resolved.`, {productDefinition, offerings});

        if (aborted) return;

        // Init with all passed load data and overwrite with fulfilled promise data.
        const dataToValidate: ProductDefinitionDetailPage_LoadData = {
          ...data,
          productDefinition,
          offerings,
        }
        const validationResult = ProductDefinitionDetailPage_LoadDataSchema.safeParse(dataToValidate);
        if (!validationResult.success) {
          log.error("Zod validation failed for ProductDefinitionDetailPage", validationResult.error.issues);
          throw new Error(`ProductDefinitionDetailPage: Received invalid data structure from the API. ${JSON.stringify(validationResult.error.issues)}`);
        }
        resolvedData = validationResult.data;

      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load product definition details.";
        loadingError = { message, status };
        log.error("Promise processing failed in ProductDefinitionDetailPage", { rawError });
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

  // === API & STRATEGIES =========================================================================

  const client = new ApiClient(fetch);
  const productDefinitionApi = getProductDefinitionApi(client);
  const offeringApi = getOfferingApi(client);

  async function reloadOfferings() {
    assertDefined(resolvedData, "reloadOfferings requires resolvedData", ["productDefinition"]);
    const productDefId = resolvedData.productDefinition.product_def_id;

    log.info(`Re-fetching offerings for productDefId: ${productDefId}`);
    const updatedOfferings = await productDefinitionApi.loadOfferingsForProductDefinition(productDefId);
    resolvedData.offerings = updatedOfferings;
    log.info("Local state for offerings updated.");
  }

  function handleOfferingSelect(offering: WholesalerItemOffering_ProductDef_Category_Supplier) {
    log.info(`Selected offering: `, offering);
    const { wholesaler_id, category_id, offering_id, product_def_id } = offering;
    if (wholesaler_id && category_id && offering_id & product_def_id) {
      const targetUrl = `/categories/${category_id}/productdefinitions/${product_def_id}/offerings/${offering_id}`;
      log.debug(`Going to: ${targetUrl}`);
      goto(targetUrl);
    } else {
      log.error("Cannot navigate to offering, missing IDs", { offering });
      addNotification("Cannot navigate: offering data is incomplete.", "error");
    }
  }

  async function handleOfferingDelete(ids: ID[]): Promise<void> {
    let dataChanged = false;
    for (const id of ids) {
      const numericId = Number(id);

      const result = await offeringApi.deleteOffering(numericId);

      if (result.success) {
        addNotification(`Offering (ID: ${id}) deleted successfully.`, "success");
        dataChanged = true;
      } else if (result.error_code === "DEPENDENCY_CONFLICT" && result.cascade_available) {
        const confirmed = await requestConfirmation(
          `This offering has dependencies. Delete the offering AND all its related data?`,
          "Confirm Cascade Delete",
        );
        
        if (confirmed) {
          const cascadeResult = await offeringApi.deleteOffering(numericId, true);
          if (cascadeResult.success) {
            addNotification("Offering and all its data removed.", "success");
            dataChanged = true;
          } else {
            addNotification(cascadeResult.message || "Failed to remove offering.", "error");
          }
        }
      } else {
        addNotification(result.message || `Could not delete offering (ID: ${id}).`, "error");
      }
    }

    if (dataChanged) {
      await reloadOfferings();
    }
  }

  const deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category_Supplier> = {
    execute: handleOfferingDelete,
  };

  const rowActionStrategy: RowActionStrategy<WholesalerItemOffering_ProductDef_Category_Supplier> = {
    click: handleOfferingSelect,
  };

  // === FORM EVENT HANDLERS =======================================================================

  function handleFormSubmitted(event: { data: ProductDefinition; result: unknown }) {
    addNotification("Product Definition saved successfully.", "success");
    if (resolvedData!.isCreateMode) {
      const newId = event.data?.product_def_id;
      if (newId) {
        // Redirect to the new edit page
        goto(`/categories/${resolvedData?.categoryId}/productdefinitions/${newId}`, { invalidateAll: true }); // categoryId is a placeholder
      } else {
        addNotification("Could not redirect to edit page, ID is missing.", "error");
      }
    } else {
      // In edit mode, the FormShell has already updated the state.
      // We might want to force-reload all data to be safe.
      // For now, we assume the form's state is sufficient.
    }
  }

  function handleFormSubmitError(event: { data: ProductDefinition; error: unknown }) {
    log.error("Form submit error in ProductDefinitionDetailPage", event.error);
    addNotification(`Failed to save Product Definition.`, "error");
  }

  function handleFormCancelled() {
    addNotification("Changes discarded.", "info");
  }

  function handleFormChanged(event: { data: ProductDefinition; dirty: boolean }) {
    log.debug("Form data changed", { dirty: event.dirty });
  }
</script>

{#if loadingError}
  <div class="component-error-boundary">
    <h3>Error Loading Product Definition (Status: {loadingError.status})</h3>
    <p>{loadingError.message}</p>
  </div>
{:else if isLoading || !resolvedData}
  <div class="detail-page-layout">Loading details...</div>
{:else}
  <div class="detail-page-layout">
    <!-- Section 1: Product Definition Form -->
    <div class="form-section">
      <ProductDefinitionForm
        categoryId={resolvedData.categoryId}
        isCreateMode={resolvedData.isCreateMode}
        initial={resolvedData.productDefinition}
        onSubmitted={handleFormSubmitted}
        onSubmitError={handleFormSubmitError}
        onCancelled={handleFormCancelled}
        onChanged={handleFormChanged}
      />
    </div>

    <!-- Section 2: Grid of associated Offerings -->
    <div class="grid-section">
      {#if !resolvedData.isCreateMode}
        <h2>Offerings for this Product</h2>
        <p>This product is offered by the following suppliers with these conditions.</p>
        <OfferingGrid
          rows={resolvedData.offerings}
          loading={$offeringLoadingState}
          {deleteStrategy}
          {rowActionStrategy}
        />
      {:else}
        <p>Offerings will be displayed here after the product definition has been saved.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
    /* No padding here, as the FormShell/Form component handles it */
  }
</style>
