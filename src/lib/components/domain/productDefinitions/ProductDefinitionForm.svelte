<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionForm.svelte -->

<script lang="ts">
  import FormShell from '$lib/components/forms/FormShell.svelte';
  import { log } from '$lib/utils/logger';
  import { ApiClient } from '$lib/api/client/ApiClient';
  import { getProductDefinitionApi } from '$lib/api/client/productDefinition';
  import { ProductDefinitionSchema, type ProductDefinition } from '$lib/domain/domainTypes';
  import type { SubmittedCallback, SubmitErrorCallback, CancelledCallback, ChangedCallback, ValidateResult } from '$lib/components/forms/forms.types';
  import { assertDefined } from '$lib/utils/validation/assertions';
  import ValidationWrapper from '$lib/components/validation/ValidationWrapper.svelte';

  import '$lib/components/styles/form.css';
  import '$lib/components/styles/grid.css';

  // === PROPS ====================================================================================

  type ProductDefinitionFormProps = {
    initial: ProductDefinition | null;
    disabled?: boolean;
    onSubmitted: SubmittedCallback<ProductDefinition>;
    onSubmitError: SubmitErrorCallback<ProductDefinition>;
    onCancelled: CancelledCallback<ProductDefinition>;
    onChanged: ChangedCallback<ProductDefinition>;
  }

  const {
    initial,
    disabled = false,
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged
  }: ProductDefinitionFormProps = $props();

  // === ZOD VALIDATION OF PROPS =================================================================
  
  let { validatedInitialData, validationErrors } = $derived.by(() => {
    const result = ProductDefinitionSchema.nullable().safeParse(initial);
    if (!result.success) {
      log.error(`(ProductDefinitionForm) Validation of initial prop failed`, result.error);
    }
    return {
      validatedInitialData: result.success ? result.data : null,
      validationErrors: result.success ? null : result.error.issues
    };
  });

  // === STATE & API ==============================================================================

  const isCreateMode = $derived(!validatedInitialData);
  const client = new ApiClient(fetch);
  const productDefinitionApi = getProductDefinitionApi(client);

  // === BUSINESS LOGIC ===========================================================================

  function validate(rawData: Record<string, any>): ValidateResult {
    // For this entity, Zod's parsing is sufficient.
    // We can use a more specific schema if needed (e.g., for create vs. update)
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
      return await productDefinitionApi.createProductDefinition(createData as Omit<ProductDefinition, 'product_def_id'>);
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
    initial={validatedInitialData}
    validate={validate}
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
          <h3>{data?.title || 'New Product Definition'}</h3>
          {#if data?.product_def_id}
            <span class="field-hint">ID: {data.product_def_id}</span>
          {/if}
        </div>
        {#if dirty}
          <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
        {/if}
      </div>
    {/snippet}

    {#snippet fields({ getS, set, errors, markTouched })}
      <div class="form-body">
        <div class="form-grid">
          
          <div class="form-group span-4">
            <label for="pd-title">Title *</label>
            <input
              id="pd-title"
              type="text"
              value={getS("title") ?? ''}
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
            <label for="pd-category">Category ID *</label>
            <input
              id="pd-category"
              type="number"
              value={getS("category_id") ?? ''}
              class:error={errors.category_id}
              placeholder="Enter the parent category ID"
              oninput={(e) => set(["category_id"], (e.currentTarget as HTMLInputElement).valueAsNumber)}
              onblur={() => markTouched("category_id")}
              required
            />
            {#if errors.category_id}
              <div class="error-text">{errors.category_id[0]}</div>
            {/if}
             <p class="field-hint">Note: This should be a dropdown in a real UI.</p>
          </div>

          <div class="form-group span-4">
            <label for="pd-description">Description</label>
            <textarea
              id="pd-description"
              rows="4"
              placeholder="Detailed description of the product..."
              oninput={(e) => set(["description"], (e.currentTarget as HTMLTextAreaElement).value)}
            >{getS("description") ?? ''}</textarea>
          </div>

        </div>
      </div>
    {/snippet}
    
    {#snippet actions({ submitAction, cancel, submitting, dirty })}
      <div class="form-actions">
        <button class="secondary-button" type="button" onclick={cancel} disabled={submitting}>
          Cancel
        </button>
        <button class="primary-button" type="submit" disabled={!dirty || submitting} aria-busy={submitting}>
          {#if submitting}
            <span class="pc-grid__spinner" aria-hidden="true"></span>
          {/if}
          Save Product Definition
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>