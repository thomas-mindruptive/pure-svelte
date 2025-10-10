<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionForm.svelte -->

<script lang="ts">
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
  import type {
    CancelledCallback,
    ChangedCallback,
    Errors,
    SubmitErrorCallback,
    SubmittedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell, { type FieldsSnippetProps } from "$lib/components/forms/FormShell.svelte";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { ProductDefinitionSchema, type Form, type Material, type ProductDefinition } from "$lib/domain/domainTypes";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import FormComboBox2 from "$lib/components/forms/FormComboBox2.svelte";
  import Field from "$lib/components/forms/Field.svelte";

  // === PROPS ====================================================================================

  type ProductDefinitionFormProps = {
    initial: ProductDefinition | null;
    materials: Material[];
    forms: Form[];
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
    materials,
    forms,
    disabled = false,
    isCreateMode,
    categoryId,
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged,
  }: ProductDefinitionFormProps = $props();

  // === STATE ====================================================================================

  //const errors = $state<Record<string, ValidationErrorTree>>({});

  // === ZOD VALIDATION OF PROPS =================================================================

  let { validatedInitialData, errors, initialContextForFormshell } = $derived.by(() => {
    log.debug(`Validating initial data:`, initial);
    const result = ProductDefinitionSchema.nullable().safeParse(initial);

    const errors: Record<string, ValidationErrorTree> = {};
    if (result.success) {
      const validatedInitialData = result.data;
      let initialContextForFormshell: ProductDefinition | null = null;
      if (isCreateMode) {
        if (!categoryId || isNaN(categoryId)) {
          const msg = `Validation failed: "categoryId" must be defined if isCreateMode`;
          log.error(msg);
          errors.categoryId = { errors: [msg] };
        } else {
          initialContextForFormshell = { product_def_id: 0, title: "", category_id: categoryId };
        }
      } else {
        initialContextForFormshell = result.data;
      }
      return {
        validatedInitialData,
        errors,
        initialContextForFormshell,
      };
    } else {
      errors.productDefintion = zodToValidationErrorTree(result.error);
      log.error(`Validation of initial prop failed`, result.error);
      return {
        validatedInitialData: null,
        errors,
        initialContextForFormshell: null,
      };
    }
  });

  // === DERIVED ==================================================================================

  const formTitleInfo = $derived(
    validatedInitialData?.product_def_id
      ? `ID: ${validatedInitialData?.product_def_id} - Category: ${categoryId}`
      : `Category: ${categoryId}`,
  );

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const productDefinitionApi = getProductDefinitionApi(client);

  // === BUSINESS LOGIC ===========================================================================

  function validate(rawData: Record<string, any>): ValidateResult<ProductDefinition> {
    //const prodDef = rawData as ProductDefinition;

    // For this entity, Zod's parsing is sufficient.
    // We can use a more specific schema if needed (e.g., for create vs. update)
    if (isCreateMode) {
      delete rawData.product_def_id;
    }

    // TODO: All client form validates should validate against schema ("forCreateMode" and "forUpdateMode").

    const result = ProductDefinitionSchema.partial().safeParse(rawData);

    // In case we need to add more business val errors, add them here:
    const errors: Errors<ProductDefinition> = {};
    // errors.property = ["XYZ"]    
    
      if (result.success) {
      return { valid: true, errors };
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

<!-- SNIPPETS ------------------------------------------------------------------------------------>

<!--
  -- Render material combo using Combobox2 component
  -->
{#snippet materialCombo2(fieldProps: FieldsSnippetProps<ProductDefinition>)}
  <FormComboBox2
    {fieldProps}
    items={materials}
    path={["material_id"]}
    labelPath={["name"]}
    valuePath={["material_id"]}
    placeholder="Search materials..."
    label="Material"
    onChange={(value, material) => {
      log.debug("Material selected via Combobox2:", { value, material_name: material?.name });
    }}
  />
{/snippet}

<!--
  -- Render form combo using Combobox2 component
  -->
{#snippet formCombo2(fieldProps: FieldsSnippetProps<ProductDefinition>)}
  <FormComboBox2
    {fieldProps}
    items={forms}
    path={["form_id"]}
    labelPath={["name"]}
    valuePath={["form_id"]}
    placeholder="Search forms..."
    label="Form"
    onChange={(value, form) => {
      log.debug("Form selected via Combobox2:", {value, form_name: form?.name});
    }}
  />
{/snippet}

<!-- TEMPLATE ------------------------------------------------------------------------------------>

<ValidationWrapper {errors}>
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

    {#snippet fields(fieldProps)}
      <div class="form-body">
        <div class="form-row-grid">
          <Field
            {fieldProps}
            path={["title"]}
            label="Title"
            placeholder="Enter a descriptive title"
            required
            class="span-2"
          />

          <div class="control-group span-1">
            {@render materialCombo2(fieldProps)}
          </div>

          <div class="control-group span-1">
            {@render formCombo2(fieldProps)}
          </div>
        </div>

        <div class="from-row-grid">
          <Field
            {fieldProps}
            path={["description"]}
            label="Description"
            type="textarea"
            rows={4}
            placeholder="Detailed description of the product..."
            class="span-5"
          />
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
