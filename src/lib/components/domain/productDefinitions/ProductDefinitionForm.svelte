<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionForm.svelte -->

<script lang="ts">
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
  import type {
    CancelledCallback,
    ChangedCallback,
    SubmitErrorCallback,
    SubmittedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell, { type FieldsProps } from "$lib/components/forms/FormShell.svelte";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { ProductDefinitionSchema, type Form, type Material, type ProductDefinition } from "$lib/domain/domainTypes";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import ComboBox2 from "$lib/components/forms/ComboBox2.svelte";

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

<!-- SNIPPETS ------------------------------------------------------------------------------------>

<!--
  -- Render material combo using the reusable FormCombobox component
  -->
<!-- prettier-ignore 
{#snippet materialCombo(fieldProps: FieldsProps<ProductDefinition>)}
  <ComboBox
    {fieldProps}
    path={["material_id"]}
    items={materials}
    optionValue="material_id"
    optionLabel="name"
    label="Material"
    placeholder="Select material..."
    onChange={(value, material) => {
      log.debug("Material selected:", material?.name);
    }}
  />
{/snippet}
-->

<!--
  -- Render material combo using Combobox2 component
  -->
{#snippet materialCombo2(fieldProps: FieldsProps<ProductDefinition>)}
  {@const { get, set, errors } = fieldProps}
  {@const currentMaterialId = get(["material_id"])}
  {@const selectedMaterial = materials.find((m) => m.material_id === currentMaterialId) ?? null}

  <ComboBox2
    items={materials}
    value={selectedMaterial}
    labelField="name"
    valueField="material_id"
    placeholder="Search Forms..."
    label="Material"
    onChange={(material) => {
      set(["material_id"], material?.material_id ?? null);
      log.debug("Material selected via Combobox2:", material?.name);
    }}
  />

  {#if errors.material_id}
    <div class="error-text">{errors.material_id[0]}</div>
  {/if}
{/snippet}

<!--
  -- Render material combo using Combobox2 component
  -->
{#snippet formCombo2(fieldProps: FieldsProps<ProductDefinition>)}
  {@const { get, set, errors } = fieldProps}
  {@const currentFormId = get(["form_id"])}
  {@const selectedForm = forms.find((f) => f.form_id === currentFormId) ?? null}

  <ComboBox2
    items={forms}
    value={selectedForm}
    labelField="name"
    valueField="form_id"
    placeholder="Search materials..."
    label="Form"
    onChange={(form) => {
      set(["form_id"], form?.form_id ?? null);
      log.debug("Form selected via Combobox2:", form?.name);
    }}
  />

  {#if errors.form_id}
    <div class="error-text">{errors.form_id[0]}</div>
  {/if}
{/snippet}

<!--
  -- Render form combo using the reusable FormCombobox component
  -->
<!--  
{#snippet formCombo(fieldProps: FieldsProps<ProductDefinition>)}
  <ComboBox
    {fieldProps}
    path={["form_id"]}
    items={forms}
    optionValue="form_id"
    optionLabel="name"
    label="Form"
    placeholder="Select material..."
    onChange={(value, form) => {
      log.debug("Form selected:", form?.name);
    }}
  />
{/snippet}
  -->

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
      {@const { getS, set, errors, markTouched } = fieldProps}
      <div class="form-body">
        <div class="form-row-grid">
          <!---->
          <!--- TITLE -------------------------------------------------------------------------->
          <div class="form-group span-2">
            <label for="title">Title *</label>
            <input
              id="title"
              name="title"
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

          <!--- MATERIAL ------------------------------------------------------------------------>
          <!-- <div class="form-group span-1">
            {@render materialCombo(fieldProps)}
          </div> -->

          <div class="control-group span-1">
            {@render materialCombo2(fieldProps)}
          </div>

          <!--- FORM ---------------------------------------------------------------------------->
          <!-- <div class="form-group span-1">
            {@render formCombo(fieldProps)}
          </div> -->

          <div class="control-group span-1">
            {@render formCombo2(fieldProps)}
          </div>
        </div>

        <div class="from-row-grid">
          <!--- DESCRIPTION ---------------------------------------------------------------------->
          <div class="form-group span-5">
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
