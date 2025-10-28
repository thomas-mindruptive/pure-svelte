<script lang="ts">
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getProductDefinitionImageApi } from "$lib/api/client/productDefinitionImage";
  import Field from "$lib/components/forms/Field.svelte";
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
    ProductDefinitionImage_Image_Schema,
    type ProductDefinitionImage_Image,
  } from "$lib/domain/domainTypes";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  // === TYPES ====================================================================================

  // === PROPS ====================================================================================

  export type Props = {
    initial?: ProductDefinitionImage_Image | undefined | null;
    productDefId: number;
    disabled?: boolean;
    isCreateMode: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const {
    initial: initialData,
    productDefId,
    disabled = false,
    onSubmitted,
    isCreateMode,
    onSubmitError,
    onCancelled,
    onChanged,
  }: Props = $props();

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const imageApi = getProductDefinitionImageApi(client);

  // === VALIDATE =================================================================================

  const { zodErrors, formData } = $derived.by(() => {
    let err: ValidationErrorTree = {};

    // In create mode, we don't validate against the full schema (missing image_id)
    // The form data will be validated on submit
    if (!isCreateMode) {
      const result = ProductDefinitionImage_Image_Schema.nullable().safeParse(initialData);
      if (result.error) {
        err.productDefinitionImage = zodToValidationErrorTree(result.error);
        log.error(`Validation of image to ProductDefinitionImage_Image_Schema failed.`, {
          error: result.error,
          initial: initialData,
        });
      }
    }

    return {
      validatedData: null,
      formData: initialData,
      zodErrors: err,
      isValid: isCreateMode ? true : Object.keys(err).length === 0,
      initialValidatedData: null,
    };
  });

  // === STATE ====================================================================================

  // === BUSINESS FUNCTIONALITY ===================================================================

  function validateImage(raw: Record<string, any>): ValidateResult<ProductDefinitionImage_Image> {
    const data = raw as ProductDefinitionImage_Image;
    const errors: Errors<ProductDefinitionImage_Image> = {};

    // Validate image fields
    if (data.image) {
      if (!data.image.filename?.trim()) {
        errors["image.filename"] = ["Filename is required"];
      }
      if (!data.image.filepath?.trim()) {
        errors["image.filepath"] = ["Filepath is required"];
      }
    }

    // Ensure product_def_id is set
    if (!data.product_def_id) {
      errors.product_def_id = ["Product Definition ID is required"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== FORM CALLBACKS =====

  async function submitImage(raw: Record<string, any>) {
    log.debug(`Submitting image`, raw);
    const data = raw as ProductDefinitionImage_Image;

    // Ensure product_def_id is set from prop
    data.product_def_id = productDefId;

    const isUpdate = !isCreateMode;
    try {
      if (isUpdate) {
        assertDefined(data.image_id, "image_id is required for update");
        return await imageApi.updateProductDefinitionImage(data.image_id, data);
      } else {
        return await imageApi.createProductDefinitionImage(data);
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

<!-- TEMPLATE ------------------------------------------------------------------------------------>

<ValidationWrapper errors={zodErrors}>
  <FormShell
    entity="Image"
    initial={formData as ProductDefinitionImage_Image}
    validate={validateImage}
    submitCbk={submitImage}
    autoValidate="change"
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    <!-- Header ---------------------------------------------------------------------------------->
    {#snippet header({ data, dirty })}
      {@const image = data as ProductDefinitionImage_Image}
      <div class="form-header">
        <div>
          {#if image?.image_id}
            <h3>
              {image.image?.filename || "Unnamed Image"}
              <span class="field-hint">ID: {image.image_id}</span>
            </h3>
          {:else}
            <h3>New Image</h3>
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
          <!-- ===== IMAGE FIELDS ===== -->

          <!-- Filename ---------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "filename"]}
            label="Filename"
            placeholder="Enter filename"
            required
            class="span-2"
          />

          <!-- Filepath ---------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "filepath"]}
            label="Filepath"
            placeholder="Enter filepath or URL"
            required
            class="span-2"
          />

          <!-- MIME Type --------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "mime_type"]}
            label="MIME Type"
            placeholder="e.g., image/jpeg"
          />

          <!-- File Size --------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "file_size_bytes"]}
            label="File Size (bytes)"
            type="number"
            placeholder="File size in bytes"
          />

          <!-- Width ------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "width_px"]}
            label="Width (px)"
            type="number"
            placeholder="Image width"
          />

          <!-- Height ------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["image", "height_px"]}
            label="Height (px)"
            type="number"
            placeholder="Image height"
          />

          <!-- File Hash --------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "file_hash"]}
            label="File Hash"
            placeholder="SHA-256 hash"
            class="span-2"
          />

          <!-- ===== PRODUCT DEFINITION IMAGE FIELDS ===== -->

          <!-- Image Type -------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image_type"]}
            label="Image Type"
            placeholder="e.g., product, detail, lifestyle"
          />

          <!-- Size Range -------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["size_range"]}
            label="Size Range"
            placeholder="e.g., S-XL, 100-300W"
          />

          <!-- Quality Grade ----------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["quality_grade"]}
            label="Quality Grade"
            placeholder="e.g., A, B, premium"
          />

          <!-- Color Variant ----------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["color_variant"]}
            label="Color Variant"
            placeholder="e.g., black, silver"
          />

          <!-- Sort Order --------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["sort_order"]}
            label="Sort Order"
            type="number"
            placeholder="0"
          />

          <!-- Is Primary --------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["is_primary"]}
            label="Primary Image"
            type="checkbox"
          />

          <!-- ===== SHOPIFY FIELDS ===== -->

          <!-- Shopify URL -------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "shopify_url"]}
            label="Shopify URL"
            placeholder="Shopify CDN URL"
            class="span-2"
          />

          <!-- Shopify Media ID --------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "shopify_media_id"]}
            label="Shopify Media ID"
            placeholder="Shopify media identifier"
          />

          <!-- Uploaded to Shopify At --------------------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "uploaded_to_shopify_at"]}
            label="Uploaded to Shopify"
            type="date"
          />
        </div>
      </div>
    {/snippet}

    <!-- Actions --------------------------------------------------------------------------------->
    {#snippet actions({ submitAction, cancel, submitting, dirty })}
      <div class="form-actions">
        <button class="secondary-button" type="button" onclick={cancel} disabled={submitting}>
          Cancel
        </button>

        <button
          class="primary-button"
          type="submit"
          disabled={!dirty || submitting}
          aria-busy={submitting}
        >
          {#if submitting}
            <span class="pc-grid__spinner" aria-hidden="true"></span>
          {/if}
          Save Image
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
