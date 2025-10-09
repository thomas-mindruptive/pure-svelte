<script lang="ts">
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import { ProductCategorySchema, type ProductCategory } from "$lib/domain/domainTypes";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type {
    SubmittedCallback,
    SubmitErrorCallback,
    CancelledCallback,
    ChangedCallback,
    ValidateResult,
    Errors,
  } from "$lib/components/forms/forms.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { assertDefined } from "$lib/utils/assertions";
  import { getCategoryApi } from "$lib/api/client/category";
    import type { ValidationErrors } from "$lib/components/validation/validation.types";


  // === PROPS ====================================================================================

  export type Props = {
    initial?: ProductCategory | undefined | null;
    disabled?: boolean;
    isCreateMode: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const { initial: initialData, disabled = false, onSubmitted, isCreateMode, onSubmitError, onCancelled, onChanged }: Props = $props();

  type CategoryFormData = ProductCategory;

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const categoryApi = getCategoryApi(client);

  // === VALIDATE =================================================================================

  let { errors: zodErrors } = $derived.by(() => {
    const result = ProductCategorySchema.nullable().safeParse(initialData);
    if (result.error) {
      log.error(`Validation of category to ProductCategorySchema failed.`, {error: result.error, initial: initialData});
    }
    return {
      validatedData: result.success ? result.data : null,
      errors: result.success ? null : result.error.issues,
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
    const data = raw as CategoryFormData;
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

<ValidationWrapper errors={zodErrors}>
  <FormShell
    entity="Category"
    initial={initialData as CategoryFormData}
    validate={validateCategory}
    submitCbk={submitCategory}
    autoValidate="change"
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    {#snippet header({ data, dirty })}
      {@const category = data as CategoryFormData}
      <div class="form-header">
        <div>
          {#if category?.category_id}
            <h3>{category.name || "Unnamed Category"} <span class="field-hint">ID: {category.category_id}</span></h3> 
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

    {#snippet fields({ getS, set, errors, markTouched })}
      <div class="form-body">
        <div class="form-row-grid">
          <div class="form-group span-2">
            <label for="cat-name">Category Name *</label>
            <input
              id="name"
              type="text"
              value={getS("name") ?? ""}
              class:error={errors.name}
              placeholder="Enter category name"
              oninput={(e) => set(["name"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("name")}
              required
            />
            {#if errors.name}
              <div class="error-text">{errors.name[0]}</div>
            {/if}
          </div>
          <div class="form-group span-2">
            <label for="cat-description">Description *</label>
            <input
              id="description"
              type="text"
              value={getS("description") ?? ""}
              class:error={errors.description}
              placeholder="Enter description"
              oninput={(e) => set(["description"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("description")}
              required
            />
            {#if errors.description}
              <div class="error-text">{errors.description[0]}</div>
            {/if}
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
          Save Category
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
