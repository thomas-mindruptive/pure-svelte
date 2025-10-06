<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionForm.svelte -->

<script lang="ts">
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
  import { getMaterialApi } from "$lib/api/client/material";
  import { getFormApi } from "$lib/api/client/form";
  import { ProductDefinitionSchema, type ProductDefinition, type Material, type Form } from "$lib/domain/domainTypes";
  import type {
    SubmittedCallback,
    SubmitErrorCallback,
    CancelledCallback,
    ChangedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import { assertDefined } from "$lib/utils/assertions";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";

  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type { $ZodIssueCustom } from "zod/v4/core";

  // === PROPS ====================================================================================

  type ProductDefinitionFormProps = {
    initial: ProductDefinition | null;
    disabled?: boolean;
    isCreateMode: boolean;
    categoryId: number | null; // Needed for create-mode.
    onSubmitted: SubmittedCallback<ProductDefinition>;
    onSubmitError: SubmitErrorCallback<ProductDefinition>;
    onCancelled: CancelledCallback<ProductDefinition>;
    onChanged: ChangedCallback<ProductDefinition>;
  };

  const {
    initial,
    disabled = false,
    isCreateMode,
    categoryId,
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged,
  }: ProductDefinitionFormProps = $props();

  // === ZOD VALIDATION OF PROPS =================================================================

  let { validatedInitialData, validationErrors, initialContextForFormshell } = $derived.by(() => {
    log.debug(`Validating initial data:`, initial);
    const result = ProductDefinitionSchema.nullable().safeParse(initial);
    if (!result.success) {
      log.error(`Validation of initial prop failed`, result.error);
    }
    const validatedInitialData = result.success ? result.data : null;
    let initialContextForFormshell: ProductDefinition | null = null;
    let validationErrors = result.success ? null : result.error.issues;
    if (isCreateMode) {
      if (!categoryId || isNaN(categoryId)) {
        log.error(`Validation failed: "categoryId" must be defined if isCreateMode`);
        validationErrors = validationErrors || [];
        validationErrors.push({
          code: "custom",
          path: ["categoryID"],
          message: "categoryID must be defined if isCreateMode",
        } as $ZodIssueCustom);
      } else {
        initialContextForFormshell = { product_def_id: 0, title: "", category_id: categoryId };
      }
    } else {
      initialContextForFormshell = result.success ? result.data : null;
    }
    return {
      validatedInitialData,
      validationErrors,
      initialContextForFormshell,
    };
  });

  // === STATE & API ==============================================================================

  const client = new ApiClient(fetch);
  const productDefinitionApi = getProductDefinitionApi(client);
  const formTitleInfo = $derived(
    validatedInitialData?.product_def_id
      ? `ID: ${validatedInitialData?.product_def_id} - Category: ${categoryId}`
      : `Category: ${categoryId}`,
  );

  // === BUSINESS LOGIC ===========================================================================

  function validate(rawData: Record<string, any>): ValidateResult {
    // For this entity, Zod's parsing is sufficient.
    // We can use a more specific schema if needed (e.g., for create vs. update)
    if (isCreateMode) {
      delete rawData.product_def_id;
    }
    const result = ProductDefinitionSchema.partial().safeParse(rawData);
    if (result.success) {
      return { valid: true };
    }
    return { valid: false, errors: result.error.flatten().fieldErrors };
  }

  async function submit(formData: Record<string, any>): Promise<ProductDefinition> {
    const dataToSubmit = formData as Partial<ProductDefinition>;

    if (isCreateMode) {
      // For creation, we omit the ID. The server will generate it.
      const { product_def_id, ...createData } = dataToSubmit;
      return await productDefinitionApi.createProductDefinition(createData as Omit<ProductDefinition, "product_def_id">);
    } else {
      // For updates, the ID is required.
      assertDefined(dataToSubmit, "product_def_id must be defined for an update", ["product_def_id"]);
      const { product_def_id, ...updateData } = dataToSubmit;
      return await productDefinitionApi.updateProductDefinition(product_def_id, updateData);
    }
  }
</script>

<ValidationWrapper errors={validationErrors}>
  <FormShell
    entity="ProductDefinition"
    initial={initialContextForFormshell}
    {validate}
    submitCbk={submit}
    {disabled}
    {onSubmitted}
    {onSubmitError}
    {onCancelled}
    {onChanged}
  >
    {#snippet header({ data, dirty })}
      <div class="form-header">
        <div>
          <h3>{data?.title || "New Product Definition"}</h3>
          <span class="field-hint">{formTitleInfo}</span>
        </div>
        {#if dirty}
          <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
        {/if}
      </div>
    {/snippet}

    {#snippet fields({ getS, set, errors, markTouched })}
      <div class="form-body">
        <div class="form-row-grid">
          <div class="form-group span-4">
            <label for="pd-title">Title *</label>
            <input
              id="pd-title"
              type="text"
              value={getS("title") ?? ""}
              class:error={errors.title}
              placeholder="Enter a descriptive title"
              oninput={(e) => set(["title"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("title")}
              required
            />
            {#if errors.title}
              <div class="error-text">{errors.title[0]}</div>
            {/if}
          </div>

          <div class="form-group span-4">
            <label for="pd-description">Description</label>
            <textarea
              id="pd-description"
              value={getS("description") ?? ""}
              rows="4"
              placeholder="Detailed description of the product..."
              oninput={(e) => set(["description"], (e.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
          </div>
        </div>
      </div>
    {/snippet}

    {#snippet actions({ submitAction, cancel, submitting, dirty })}
      <div class="form-actions">
        <button
          class="secondary-button"
          type="button"
          onclick={cancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          class="primary-button"
          type="submit"
          disabled={!dirty || submitting}
          aria-busy={submitting}
        >
          {#if submitting}
            <span
              class="pc-grid__spinner"
              aria-hidden="true"
            ></span>
          {/if}
          Save Product Definition
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
