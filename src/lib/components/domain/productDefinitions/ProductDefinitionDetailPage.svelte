<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte (FINAL) -->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getOfferingApi, offeringLoadingState } from "$lib/api/client/offering";
  import type { DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import {
    FormSchema,
    MaterialSchema,
    ProductDefinitionSchema,
    Wio_PDef_Cat_Supp_Nested_Schema,
    type Form,
    type Material,
    type ProductDefinition,
    type Wio_PDef_Cat_Supp_Nested,
    type Wio_PDef_Cat_Supp,
  } from "$lib/domain/domainTypes";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  // Component Imports
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";
  import ProductDefinitionForm from "./ProductDefinitionForm.svelte";
  // The new form component
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";
  // Type and Schema Imports
  import { page } from "$app/state";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { getFormApi } from "$lib/api/client/form";
  import { getMaterialApi } from "$lib/api/client/material";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { buildChildUrl, buildSiblingUrl } from "$lib/utils/url";
  import { error } from "@sveltejs/kit";
  import { getErrorMessage } from "$lib/api/client/common";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
    import { coerceErrorMessage } from "$lib/utils/errorUtils";

  // === PROPS ====================================================================================

  export type ProductDefPageProps = {
    productDefId: number;
    categoryId: number;
    isCreateMode: boolean;
    loadEventFetch: typeof fetch;
  };

  const { productDefId, categoryId, isCreateMode, loadEventFetch }: ProductDefPageProps = $props();

  // === STATE ====================================================================================

  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});
  const allowForceCascadingDelte = $state(true);
  let productDefinition: ProductDefinition | null = $state(null);
  let offerings: Wio_PDef_Cat_Supp_Nested[] = $state([]);
  let materials: Material[] = $state([]);
  let forms: Form[] = $state([]);

  // === API ======================================================================================

  const client = new ApiClient(loadEventFetch);
  const productDefinitionApi = getProductDefinitionApi(client);
  const offeringApi = getOfferingApi(client);
  const materialApi = getMaterialApi(client);
  const formApi = getFormApi(client);

  // === LOAD DATA ================================================================================

  $effect(() => {
    log.debug(`++++ data props:`, { productDefId, categoryId, isCreateMode, loadEventFetch });

    let aborted = false;
    const processPromises = async () => {
      isLoading = true;

      try {
        if (isCreateMode) {
          log.debug(`Create Mode`);
        } else {
          if (isNaN(productDefId) || productDefId < 0) {
            throw error(400, "ProductDefintionDetailPage::$effect: Invalid Product Definition ID. Must be a positive number.");
          }
          // We must always come from a path like /.../categories/[categoryId]
          if (isNaN(categoryId) || categoryId < 0) {
            throw error(400, "categoryId must be passed in params.");
          }
          productDefinition = await productDefinitionApi.loadProductDefinition(productDefId);
          if (aborted) return;
          const prodDefVal = ProductDefinitionSchema.nullable().safeParse(productDefinition);
          if (!prodDefVal.success) {
            errors.productDefintion = zodToValidationErrorTree(prodDefVal.error);
          }
          offerings = await productDefinitionApi.loadOfferingsForProductDefinition(productDefId);
          if (aborted) return;
          const offeringsVal = safeParseFirstN(Wio_PDef_Cat_Supp_Nested_Schema, offerings, 3);
          if (!offeringsVal.success) {
            errors.offerings = zodToValidationErrorTree(offeringsVal.error);
          }

          log.debug(`Loaded productDefinition and offerings.`, { productDefinition, offerings });
        }

        forms = await formApi.loadForms();
        if (aborted) return;
        const formsVal = safeParseFirstN(FormSchema, forms, 3);
        if (!formsVal.success) {
          errors.forms = zodToValidationErrorTree(formsVal.error);
        }

        materials = await materialApi.loadMaterials();
        if (aborted) return;
        const materialsVal = safeParseFirstN(MaterialSchema, materials, 3);
        if (!materialsVal.success) {
          errors.materials = zodToValidationErrorTree(materialsVal.error);
        }
        log.debug(`Loaded forms and materials.`, { forms, materials });

        //
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

  async function reloadOfferings() {
    assertDefined(productDefinition, "productDefinition");
    assertDefined(productDefId, "productDefId");

    log.info(`Re-fetching offerings for productDefId: ${productDefId}`);
    const updatedOfferings = await productDefinitionApi.loadOfferingsForProductDefinition(productDefId);
    offerings = updatedOfferings;
    log.info("Local state for offerings updated.");
  }

  // === GRID/BUSINESS LOGIC ======================================================================

  function handleOfferingCreate(): void {
    log.info(`Navigating to create new offering.`);
    goto(buildChildUrl(page.url.pathname, "offerings", "new"));
  }

  function handleOfferingSelect(offering: Wio_PDef_Cat_Supp) {
    log.info(`Selected offering: `, offering);
    const { wholesaler_id, category_id, offering_id, product_def_id } = offering;
    if (wholesaler_id && category_id && offering_id && product_def_id) {
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

  async function handleOfferingsSort(sortState: SortDescriptor<Wio_PDef_Cat_Supp_Nested>[] | null) {
    try {
      offerings = await productDefinitionApi.loadOfferingsForProductDefinition(productDefId, null, sortState);
    } catch (e: unknown) {
      addNotification(`Error during sorting API: ${coerceErrorMessage(e)}`);
    }
  }

  const deleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp> = {
    execute: handleOfferingDelete,
  };

  const rowActionStrategy: RowActionStrategy<Wio_PDef_Cat_Supp> = {
    click: handleOfferingSelect,
    doubleClick: handleOfferingSelect,
  };

  // === FORM EVENT HANDLERS =======================================================================

  function handleFormSubmitted(event: { data: ProductDefinition; result: unknown }) {
    addNotification("Product Definition saved successfully.", "success");
    if (isCreateMode) {
      const newId = event.data?.product_def_id;
      if (newId) {
        // Redirect to the new edit page
        goto(buildSiblingUrl(page.url.pathname, newId), { invalidateAll: true });
      } else {
        addNotification("Could not redirect to edit page, ID is missing.", "error", 4000);
      }
    } else {
      // In edit mode, the FormShell has already updated the state.
      // We might want to force-reload all data to be safe.
      // For now, we assume the form's state is sufficient.
    }
  }

  function handleFormSubmitError(event: { data: ProductDefinition; error: unknown }) {
    log.error("Form submit error in ProductDefinitionDetailPage", event.error);
    addNotification(`Failed to save Product Definition. ${getErrorMessage(event.error)}`, "error");
  }

  function handleFormCancelled() {
    addNotification("Changes discarded.", "info");
  }

  function handleFormChanged(event: { data: ProductDefinition; dirty: boolean }) {
    log.debug("Form data changed", { dirty: event.dirty });
  }
</script>

<ValidationWrapper {errors}>
  {#if isLoading}
    <div class="detail-page-layout">Loading details...</div>
  {:else}
    <div class="detail-page-layout">
      <!-- Section 1: Product Definition Form -->
      <div class="form-section">
        <ProductDefinitionForm
          {categoryId}
          {isCreateMode}
          initial={productDefinition}
          {forms}
          {materials}
          onSubmitted={handleFormSubmitted}
          onSubmitError={handleFormSubmitError}
          onCancelled={handleFormCancelled}
          onChanged={handleFormChanged}
        />
      </div>

      <!-- Section 2: Grid of associated Offerings -->
      <div class="grid-section">
        {#if !isCreateMode}
          <h2>Offerings for this Product</h2>
          <button
            class="pc-grid__createbtn"
            onclick={handleOfferingCreate}
          >
            Create Offering
          </button>
          <OfferingGrid
            rows={offerings}
            loading={$offeringLoadingState}
            {deleteStrategy}
            {rowActionStrategy}
            onSort={handleOfferingsSort}
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
