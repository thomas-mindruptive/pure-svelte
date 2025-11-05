<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionForm.svelte -->

<script lang="ts">
  import { ApiClient } from "$lib/api/client/apiClient";
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
  import {
    ProductDefinitionSchema,
    type ConstructionType,
    type Form,
    type Material,
    type ProductDefinition,
    type ProductCategory,
    type SurfaceFinish,
  } from "$lib/domain/domainTypes";
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
    constructionTypes: ConstructionType[];
    surfaceFinishes: SurfaceFinish[];
    categories: ProductCategory[];
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
    constructionTypes,
    surfaceFinishes,
    categories,
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
  -- Render material combo 
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
  -- Render form combo 
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
      log.debug("Form selected via Combobox2:", { value, form_name: form?.name });
    }}
  />
{/snippet}

<!--
  -- Render constructionType combo 
  -->
{#snippet constructionTypeCombo(fieldProps: FieldsSnippetProps<ProductDefinition>)}
  <FormComboBox2
    {fieldProps}
    items={constructionTypes}
    path={["construction_type_id"]}
    labelPath={["name"]}
    valuePath={["construction_type_id"]}
    placeholder="Search construction types ..."
    label="Construction Type"
    onChange={(value, constructionType) => {
      log.debug("Construction type selected via Combobox:", { value, construction_type_name: constructionType?.name });
    }}
  />
{/snippet}

<!--
  -- Render surfaceFinish combo
  -->
{#snippet surfaceFinishCombo(fieldProps: FieldsSnippetProps<ProductDefinition>)}
  <FormComboBox2
    {fieldProps}
    items={surfaceFinishes}
    path={["surface_finish_id"]}
    labelPath={["name"]}
    valuePath={["surface_finish_id"]}
    placeholder="Search construction types ..."
    label="Surface Type"
    onChange={(value, constructionType) => {
      log.debug("Construction type selected via Combobox:", { value, construction_type_name: constructionType?.name });
    }}
  />
{/snippet}

<!--
  -- Render category combo
  -->
{#snippet categoryCombo(fieldProps: FieldsSnippetProps<ProductDefinition>)}
  <div>
    <FormComboBox2
      {fieldProps}
      items={categories}
      path={["category_id"]}
      labelPath={["name"]}
      valuePath={["category_id"]}
      placeholder="Search categories..."
      label="Product Category"
      onChange={(value, category) => {
        log.debug("Category selected via Combobox:", { value, category_name: category?.name });
      }}
    />
    {#if !isCreateMode}
      <span class="field-hint">⚠️ Changing this will automatically update all offerings to the new category (CASCADE update)</span>
    {/if}
  </div>
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
      <!-- HEADER -------------------------------------------------------------------------------->
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

    <!-- FIELDS ---------------------------------------------------------------------------------->
    {#snippet fields(fieldProps)}
      <div class="form-body">
        <div class="form-row-grid">
          <!---->
          <!-- TITLE ----------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["title"]}
            label="Title"
            placeholder="Enter a descriptive title"
            required
            class="span-2"
          />

          <Field
            {fieldProps}
            path={["for_liquids"]}
            label="For Liquids"
            type="checkbox"
            class="span-1"
          />

          <Field
            {fieldProps}
            path={["packaging"]}
            label="Packaging"
            placeholder="e.g., Box, Bag, Tube"
            class="span-1"
          />
        </div>
        <!--END ROW -->

        <div class="form-row-grid">
          <!-- PRODUCT CATEGORY ------------------------------------------------------------------>
          <div class="control-group span-1">
            {@render categoryCombo(fieldProps)}
          </div>

          <!-- MATERIAL -------------------------------------------------------------------------->
          <div class="control-group span-1">
            {@render materialCombo2(fieldProps)}
          </div>

          <!-- FORM ------------------------------------------------------------------------------>
          <div class="control-group span-1">
            {@render formCombo2(fieldProps)}
          </div>

          <!-- CONSTRUCTION TYPE ----------------------------------------------------------------->
          <div class="control-group span-1">
            {@render constructionTypeCombo(fieldProps)}
          </div>

          <!-- SURFACE FINISH -------------------------------------------------------------------->
          <div class="control-group span-1">
            {@render surfaceFinishCombo(fieldProps)}
          </div>
        </div>
        <!--END ROW -->

        <!-- DESCRIPTION ------------------------------------------------------------------------->
        <div class="form-row-grid">
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
        <!--END ROW -->
      </div>
    {/snippet}

    <!-- ACTIONS --------------------------------------------------------------------------------->
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
