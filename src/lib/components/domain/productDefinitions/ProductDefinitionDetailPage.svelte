<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte (FINAL) -->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
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
  import { assertDefined } from "$lib/utils/assertions";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
  import { page } from "$app/state";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { buildChildUrl, buildSiblingUrl } from "$lib/utils/url";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";

  // === PROPS ====================================================================================

  let { data }: { data: ProductDefinitionDetailPage_LoadDataAsync } = $props();

  // === STATE ====================================================================================

  let resolvedData = $state<ProductDefinitionDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});
  //let loadingError = $state<{ message: string; status?: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === LOAD DATA ================================================================================

  $effect(() => {
    log.debug(`data props:`, data);
    let aborted = false;
    const processPromises = async () => {
      isLoading = true;
      resolvedData = null;

      try {
        const [productDefinition, offerings] = await Promise.all([data.productDefinition, data.offerings]);
        log.debug(`Promised resolved.`, { productDefinition, offerings });

        if (aborted) return;

        // Init with all passed load data and overwrite with fulfilled promise data.
        const dataToValidate: ProductDefinitionDetailPage_LoadData = {
          ...data,
          productDefinition,
          offerings,
        };
        const validationResult = ProductDefinitionDetailPage_LoadDataSchema.safeParse(dataToValidate);
        if (!validationResult.success) {
          log.error("Zod validation failed for ProductDefinitionDetailPage", validationResult.error.issues);
          errors.productDefinitionLoadData = zodToValidationErrorTree(validationResult.error);
        } else {
          resolvedData = validationResult.data;
        }
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load product definition details.";
        errors.unexpectedError = { message, status };
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

  // === BUSINESS LOGIC ===========================================================================

  function handleOfferingCreate(): void {
    log.info(`Navigating to create new offering.`);
    goto(buildChildUrl(page.url.pathname, "offerings", "new"));
  }

  function handleOfferingSelect(offering: WholesalerItemOffering_ProductDef_Category_Supplier) {
    log.info(`Selected offering: `, offering);
    const { wholesaler_id, category_id, offering_id, product_def_id } = offering;
    if (wholesaler_id && category_id && offering_id & product_def_id) {
      const targetUrl = buildChildUrl(page.url.pathname, "offerings", offering_id);
      log.debug(`Going to: ${targetUrl}`);
      goto(targetUrl);
    } else {
      log.error("Cannot navigate to offering, missing IDs", { offering });
      addNotification("Cannot navigate: offering data is incomplete.", "error");
    }
  }

  async function handleOfferingDelete(ids: ID[]): Promise<void> {
    let dataChanged = false;
    const idsAsNumber = stringsToNumbers(ids);

    dataChanged = await cascadeDelete(
      idsAsNumber,
      offeringApi.deleteOffering,
      {
        domainObjectName: "Product Definition",
        softDepInfo: "Product Definition has soft dependencies.",
        hardDepInfo: "Product Definition has hard dependencies.",
      },
      allowForceCascadingDelte,
    );

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
        goto(buildSiblingUrl(page.url.pathname, newId), { invalidateAll: true });
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

<ValidationWrapper {errors}>
  {#if isLoading || !resolvedData}
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
          <button
            class="pc-grid__createbtn"
            onclick={handleOfferingCreate}
          >
            Create Offering
          </button>
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
</ValidationWrapper>

<style>
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
    /* No padding here, as the FormShell/Form component handles it */
  }
</style>
