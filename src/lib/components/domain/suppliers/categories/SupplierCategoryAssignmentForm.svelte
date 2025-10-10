<script lang="ts">
  /**
   * SupplierCategoryAssignmentForm Component (Svelte 5 + Runes)
   * Edits the assignment details (comment, link) for a wholesaler-category relationship
   */

  import FormShell from "$lib/components/forms/FormShell.svelte";
  import Field from "$lib/components/forms/Field.svelte";
  import { log } from "$lib/utils/logger";
  import { WholesalerCategorySchema, type WholesalerCategory } from "$lib/domain/domainTypes";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getSupplierApi } from "$lib/api/client/supplier";
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
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";

  // === PROPS ====================================================================================

  export type SupplierCategoryAssignmentFormProps = {
    initial?: WholesalerCategory | undefined | null;
    disabled?: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const { initial, disabled = false, onSubmitted, onSubmitError, onCancelled, onChanged }: SupplierCategoryAssignmentFormProps = $props();

  type AssignmentFormData = Partial<WholesalerCategory>;

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const supplierApi = getSupplierApi(client);

  // === VALIDATE =================================================================================

  let { initialValidateData, errors } = $derived.by(() => {
    const result = WholesalerCategorySchema.nullable().safeParse(initial);
    if (result.error) {
      log.error(`Validation of assignment data to WholesalerCategorySchema failed.`, result.error);
    }
    const errors: Record<string, ValidationErrorTree> = {};
    if (result.error) {
      errors.formData = zodToValidationErrorTree(result.error);
    }
    return {
      validatedData: result.success ? result.data : null,
      errors,
      isValid: result.success,
      initialValidateData: result.success ? (result.data ?? null) : null,
    };
  });

  // === STATE ====================================================================================

  const isCreateMode = $derived(!initialValidateData);

  // === BUSINESS FUNCTIONALITY ===================================================================

  function validateAssignment(raw: Record<string, any>): ValidateResult<WholesalerCategory> {
    const data = raw as AssignmentFormData;
    const errors: Errors<WholesalerCategory> = {};

    // URL validation for link
    if (data.link && data.link.trim()) {
      try {
        new URL(data.link);
      } catch {
        errors.link = ["Please enter a valid URL (e.g., https://example.com)"];
      }
    }

    // Comment length check
    if (data.comment && data.comment.length > 1000) {
      errors.comment = ["Comment must not exceed 1000 characters"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== FORM CALLBACKS =====

  async function submitAssignment(raw: Record<string, any>) {
    log.debug(`Submitting wholesaler category assignment`, raw);
    const data = raw as AssignmentFormData;

    try {
      assertDefined(data.wholesaler_id, "wholesaler_id is required");
      assertDefined(data.category_id, "category_id is required");

      if (isCreateMode) {
      }

      const { created_at, ...updateData } = data;
      return await supplierApi.updateSupplierCategoryAssignment(data.wholesaler_id, data.category_id, updateData);
    } catch (e) {
      log.error({ component: "SupplierCategoryAssignmentForm", error: String(e) }, "SUBMIT_FAILED");
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

<ValidationWrapper {errors}>
  <FormShell
    entity="Category Assignment"
    initial={initial as AssignmentFormData}
    validate={validateAssignment}
    submitCbk={submitAssignment}
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    <!-- ==========================================================================================
      -- Header
      ========================================================================================== -->

    {#snippet header({ data, dirty })}
      {@const assignment = data as AssignmentFormData}
      <div class="form-header">
        <div>
          <h3>Category Assignment {assignment.wholesaler_id} - {assignment.category_id}</h3>
        </div>
        <div>
          {#if dirty}
            <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
          {/if}
        </div>
      </div>
    {/snippet}

    <!-- ==========================================================================================
      -- Fields
      ========================================================================================== -->

    {#snippet fields(fieldProps)}
      {@const { getS } = fieldProps}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- --------------------------------------------------------------------------------
            -- Link
            ---------------------------------------------------------------------------------- -->
          <div class="span-2">
            <Field
              {fieldProps}
              path={["link"]}
              label="Supplier Category Link"
              type="url"
              placeholder="https://supplier.com/category-page"
            />
            <span class="field-hint">Link to the supplier's category page (if available)</span>
          </div>

          <!-- --------------------------------------------------------------------------------
            -- Comment
            ---------------------------------------------------------------------------------- -->
          <div class="span-2">
            <Field
              {fieldProps}
              path={["comment"]}
              label="Notes"
              type="textarea"
              rows={4}
              placeholder="Add notes about this supplier's offerings in this category..."
            />
            <div class="char-count">
              {(getS("comment") ?? "").length} / 1000
            </div>
          </div>
        </div>
      </div>
    {/snippet}

    <!-- ==========================================================================================
      -- Actions
      ========================================================================================== -->

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
          Save Assignment
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
