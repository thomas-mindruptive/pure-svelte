<script lang="ts">
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getProductDefinitionImageApi } from "$lib/api/client/productDefinitionImage";
  import Field from "$lib/components/forms/Field.svelte";
  import StaticFieldValue from "$lib/components/forms/StaticFieldValue.svelte";
  import type {
    CancelledCallback,
    ChangedCallback,
    Errors,
    SubmitErrorCallback,
    SubmittedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import {
    ProductDefinitionImage_Image_Schema,
    ImageSizeRange,
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

  // === HELPER FUNCTIONS =========================================================================

  /**
   * Formats file size from bytes to human-readable format (KB, MB, GB)
   */
  function formatFileSize(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return 'N/A';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Truncates a hash to first 16 characters + ellipsis
   */
  function truncateHash(hash: string | null | undefined): string {
    if (!hash) return 'N/A';
    return hash.length > 16 ? `${hash.substring(0, 16)}...` : hash;
  }

  /**
   * Formats image dimensions as "width x height px"
   */
  function formatDimensions(data: { w: number | null; h: number | null }): string {
    if (!data.w || !data.h) return 'N/A';
    return `${data.w} × ${data.h} px`;
  }

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
    const errors: Record<string, string[]> = {};

    // Validate image fields
    // NOTE: filename, file_hash, file_size_bytes, width_px, height_px, mime_type are server-calculated
    // Only filepath is required from the user
    if (data.image) {
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
      errors: errors as Errors<ProductDefinitionImage_Image>,
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
      {@const image = fieldProps.data as ProductDefinitionImage_Image}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- ===== IMAGE FIELDS ===== -->

          <!-- Filepath (REQUIRED - user enters) --------------------------------------------->
          <Field
            {fieldProps}
            path={["image", "filepath"]}
            label="Filepath"
            placeholder="Enter absolute filepath (e.g., C:\images\rose-quartz.jpg)"
            required
            class="span-5"
          />

          <!-- Readonly Metadata (EDIT MODE ONLY - server-calculated) ----------------------->
          {#if !isCreateMode}
            <!-- Filename (readonly, extracted from filepath) -->
            <StaticFieldValue
              label="Filename"
              value={image?.image?.filename}
              class="span-2"
            />

            <!-- File Hash (readonly, SHA-256) -->
            <StaticFieldValue
              label="File Hash (SHA-256)"
              value={image?.image?.file_hash}
              formatter={truncateHash}
              hint="Truncated"
              class="span-2"
            />

            <!-- File Size (readonly, bytes → KB/MB) -->
            <StaticFieldValue
              label="File Size"
              value={image?.image?.file_size_bytes}
              formatter={formatFileSize}
            />

            <!-- Dimensions (readonly, width x height) -->
            <StaticFieldValue
              label="Dimensions"
              value={{w: image?.image?.width_px, h: image?.image?.height_px}}
              formatter={formatDimensions}
            />

            <!-- MIME Type (readonly, detected from extension) -->
            <StaticFieldValue
              label="MIME Type"
              value={image?.image?.mime_type}
            />
          {/if}

          <!-- ===== VARIANT MATCHING FIELDS (for image matching logic) ===== -->

          <!-- Material (e.g., Rose Quartz, Amethyst) ---------------------------------------->
          <Field
            {fieldProps}
            path={["material_id"]}
            label="Material (optional)"
            type="number"
            placeholder="Material ID"
          />

          <!-- Form (e.g., Sphere, Pyramid, Heart) ------------------------------------------->
          <Field
            {fieldProps}
            path={["form_id"]}
            label="Form (optional)"
            type="number"
            placeholder="Form ID"
          />

          <!-- Surface Finish (e.g., Polished, Tumbled) -------------------------------------->
          <Field
            {fieldProps}
            path={["surface_finish_id"]}
            label="Surface Finish (optional)"
            type="number"
            placeholder="Surface Finish ID"
          />

          <!-- Construction Type (e.g., Threaded, Pendant) ----------------------------------->
          <Field
            {fieldProps}
            path={["construction_type_id"]}
            label="Construction Type (optional)"
            type="number"
            placeholder="Construction Type ID"
          />

          <!-- Color Variant (e.g., pink, purple, deep pink) -------------------------------->
          <Field
            {fieldProps}
            path={["color_variant"]}
            label="Color Variant"
            placeholder="e.g., pink, purple (optional)"
          />

          <!-- Size Range (XS, S, M, L, XL, S-M, M-L, L-XL) ---------------------------------->
          <div class="form-group">
            <label for="size-range-select">Size Range</label>
            <select
              id="size-range-select"
              value={fieldProps.get(["size_range"]) ?? ""}
              onchange={(e) => {
                const value = e.currentTarget.value;
                fieldProps.set(["size_range"], value === "" ? null : value as typeof ImageSizeRange[keyof typeof ImageSizeRange]);
              }}
            >
              <option value="">-- No Size Restriction --</option>
              {#each Object.values(ImageSizeRange) as size}
                <option value={size}>{size}</option>
              {/each}
            </select>
          </div>

          <!-- ===== PRODUCT DEFINITION IMAGE FIELDS ===== -->

          <!-- Image Type (product, detail, lifestyle) --------------------------------------->
          <Field
            {fieldProps}
            path={["image_type"]}
            label="Image Type"
            placeholder="e.g., product, detail, lifestyle"
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
