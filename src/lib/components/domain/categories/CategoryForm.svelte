<script lang="ts">
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getCategoryApi } from "$lib/api/client/category";
  import Field from "$lib/components/forms/Field.svelte";
  import FormComboBox2 from "$lib/components/forms/FormComboBox2.svelte";
  import type {
      CancelledCallback,
      ChangedCallback,
      Errors,
      SubmitErrorCallback,
      SubmittedCallback,
      ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell, { type FieldsSnippetProps } from "$lib/components/forms/FormShell.svelte";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import {
      ProductCategorySchema,
      ProductTypeSchema,
      type ProductCategory,
      type ProductType
  } from "$lib/domain/domainTypes";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  // === TYPES ====================================================================================

  type CategoryFormData = ProductCategory & { productTypes: ProductType[] };

  // === PROPS ====================================================================================

  export type Props = {
    initial?: ProductCategory | undefined | null;
    productTypes: ProductType[];
    disabled?: boolean;
    isCreateMode: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const {
    initial: initialData,
    disabled = false,
    onSubmitted,
    isCreateMode,
    onSubmitError,
    onCancelled,
    onChanged,
    productTypes,
  }: Props = $props();

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const categoryApi = getCategoryApi(client);

  // === VALIDATE =================================================================================

  const { zodErrors, formData } = $derived.by(() => {
    let err: ValidationErrorTree = {};
    const result = ProductCategorySchema.nullable().safeParse(initialData);
    if (result.error) {
      err.productCategory = zodToValidationErrorTree(result.error);
      log.error(`Validation of category to ProductCategorySchema failed.`, { error: result.error, initial: initialData });
    }
    const productTypesVal = safeParseFirstN(ProductTypeSchema, productTypes, 3);
    if (productTypesVal.error) {
      err.productTypes = zodToValidationErrorTree(productTypesVal.error);
    }

    return {
      validatedData: result.success ? result.data : null,
      formData: { ...initialData, productTypes },
      zodErrors: err,
      isValid: result.success,
      initialValidatedData: result.success ? (result.data ?? null) : null,
    };
  });

  // === STATE ====================================================================================

  // Passed as prop! - const isCreateMode = $derived(!initialValidatedData);

  // === BUSINESS FUNCTIONALITY ===================================================================

  function validateCategory(raw: Record<string, any>): ValidateResult<ProductCategory> {
    const data = raw as ProductCategory;
    const errors: Errors<ProductCategory> = {};

    // Beispiel für eine Regel, die HTML nicht kann:
    if (data.name?.toLowerCase() === "test") {
      errors.name = ['"Test" is not a valid category name.'];
    }

    // Die 'required' Checks sind jetzt redundant, aber schaden nicht als zweite Verteidigungslinie.
    if (!data.name?.trim()) {
      errors.name = ["Name is required"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== FORM CALLBACKS =====

  async function submitCategory(raw: Record<string, any>) {
    log.debug(`Submitting wholesaler`, raw);
    const data = raw as ProductCategory;
    const isUpdate = !isCreateMode;
    try {
      if (isUpdate) {
        const { category_id, ...updateData } = data;
        assertDefined(category_id, "category_id is required for update");
        return await categoryApi.updateCategory(category_id, updateData);
      } else {
        return await categoryApi.createCategory(data);
      }
    } catch (e) {
      log.error("SUBMIT_FAILED", { error: String(e) });
      throw e;
    }
  }

  function handleSubmitted(p: { data: Record<string, any>; result: unknown }) {
    onSubmitted?.(p);
  }

  function handleSubmitError(p: { data: Record<string, any>; error: unknown }) {
    onSubmitError?.(p);
  }

  function handleCancelled(p: { data: Record<string, any>; reason?: string }) {
    onCancelled?.(p);
  }

  function handleChanged(p: { data: Record<string, any>; dirty: boolean }) {
    onChanged?.(p);
  }
</script>

<!-- SNIPPETS ------------------------------------------------------------------------------------>

<!--
  -- Render material combo using Combobox2 component
  -->
{#snippet productTypesCombo(fieldProps: FieldsSnippetProps<ProductType>)}
  <FormComboBox2
    {fieldProps}
    items={productTypes}
    path={["product_type_id"]}
    labelPath={["name"]}
    valuePath={["product_type_id"]}
    placeholder="Search product types..."
    label="Product type"
    onChange={(value, product_type) => {
      log.debug("Material selected via Combobox2:", { value, material_name: product_type?.name });
    }}
  />
{/snippet}

<!-- TEMPLATE ------------------------------------------------------------------------------------>

<ValidationWrapper errors={zodErrors}>
  <FormShell
    entity="Category"
    initial={formData as CategoryFormData}
    validate={validateCategory}
    submitCbk={submitCategory}
    autoValidate="change"
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    <!-- Header ---------------------------------------------------------------------------------->
    {#snippet header({ data, dirty })}
      {@const category = data as CategoryFormData}
      <div class="form-header">
        <div>
          {#if category?.category_id}
            <h3>
              {category.name || "Unnamed Category"}
              <span class="field-hint">ID: {category.category_id}</span>
            </h3>
          {:else}
            <h3>{category.name || "New Category"}</h3>
          {/if}
        </div>
        <div>
          {#if dirty}
            <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
          {/if}
        </div>
      </div>
    {/snippet}

    <!-- Fields ---------------------------------------------------------------------------------->
    {#snippet fields(fieldProps)}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- Name ------------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["name"]}
            label="Category Name"
            placeholder="Enter category name"
            required
            class="span-2"
          />

          <!-- Description ----------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["description"]}
            label="Description"
            placeholder="Enter description"
            required
            class="span-2"
          />

          {@render productTypesCombo(fieldProps)}
        </div>
      </div>
    {/snippet}

    <!-- Actions --------------------------------------------------------------------------------->
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
          Save Category
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
