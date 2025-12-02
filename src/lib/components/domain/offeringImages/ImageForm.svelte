<script lang="ts">
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingImageApi } from "$lib/api/client/offeringImage";
  import Field from "$lib/components/forms/Field.svelte";
  import StaticFieldValue from "$lib/components/forms/StaticFieldValue.svelte";
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
    ImageSizeRange,
    type Image,
    type Material,
    type Form,
    type ConstructionType,
    type SurfaceFinish,
  } from "$lib/domain/domainTypes";
  import type { OfferingImageWithJunction } from "$lib/backendQueries/entityOperations/offeringImage";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  // === TYPES ====================================================================================

  // === PROPS ====================================================================================

  export type Props = {
    initial?: OfferingImageWithJunction | undefined | null;
    offeringId: number;
    materials: Material[];
    forms: Form[];
    constructionTypes: ConstructionType[];
    surfaceFinishes: SurfaceFinish[];
    disabled?: boolean;
    isCreateMode: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const {
    initial: initialData,
    offeringId,
    materials,
    forms,
    constructionTypes,
    surfaceFinishes,
    disabled = false,
    onSubmitted,
    isCreateMode,
    onSubmitError,
    onCancelled,
    onChanged,
  }: Props = $props();

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const imageApi = getOfferingImageApi(client);

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
    // No schema validation needed - validation happens on submit
    return {
      validatedData: null,
      formData: initialData,
      zodErrors: {} as ValidationErrorTree,
      isValid: true,
      initialValidatedData: null,
    };
  });

  // === STATE ====================================================================================

  // === BUSINESS FUNCTIONALITY ===================================================================

  function validateImage(raw: Record<string, any>): ValidateResult<OfferingImageWithJunction> {
    const data = raw as OfferingImageWithJunction;
    const errors: Record<string, string[]> = {};

    // Validate image fields
    // NOTE: filename, file_hash, file_size_bytes, width_px, height_px, mime_type are server-calculated
    // Only filepath is required from the user
    if (!data.filepath?.trim()) {
      errors["filepath"] = ["Filepath is required"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors as Errors<OfferingImageWithJunction>,
    };
  }

  // ===== FORM CALLBACKS =====

  async function submitImage(raw: Record<string, any>) {
    log.debug(`Submitting image`, raw);
    const data = raw as OfferingImageWithJunction;

    const isUpdate = !isCreateMode;
    try {
      if (isUpdate) {
        assertDefined(data.offering_image_id, "offering_image_id is required for update");
        // Extract only the fields that can be updated (image fields + junction fields)
        const updateData: Partial<Image> & { is_primary?: boolean; sort_order?: number } = {
          filepath: data.filepath,
          material_id: data.material_id,
          form_id: data.form_id,
          surface_finish_id: data.surface_finish_id,
          construction_type_id: data.construction_type_id,
          size_range: data.size_range,
          quality_grade: data.quality_grade,
          color_variant: data.color_variant,
          packaging: data.packaging,
          image_type: data.image_type,
          shopify_url: data.shopify_url,
          shopify_media_id: data.shopify_media_id,
          uploaded_to_shopify_at: data.uploaded_to_shopify_at,
          explicit: data.explicit,
          is_primary: data.is_primary,
          sort_order: data.sort_order,
        };
        return await imageApi.updateOfferingImage(data.offering_image_id, updateData);
      } else {
        // Create: include offering_id in data
        const createData: Partial<Image> & { offering_id: number; is_primary?: boolean; sort_order?: number } = {
          ...data,
          offering_id: offeringId,
          explicit: data.explicit !== undefined ? data.explicit : true, // Default to explicit
        };
        return await imageApi.createOfferingImage(createData);
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
  -- Material combo
  -->
{#snippet materialCombo(fieldProps: FieldsSnippetProps<OfferingImageWithJunction>)}
  <FormComboBox2
    {fieldProps}
    items={materials}
    path={["material_id"]}
    labelPath={["name"]}
    valuePath={["material_id"]}
    placeholder="Search materials..."
    label="Material (optional)"
    onChange={(value, material) => {
      log.debug("Material selected:", { value, material_name: material?.name });
    }}
  />
{/snippet}

<!--
  -- Form combo
  -->
{#snippet formCombo(fieldProps: FieldsSnippetProps<OfferingImageWithJunction>)}
  <FormComboBox2
    {fieldProps}
    items={forms}
    path={["form_id"]}
    labelPath={["name"]}
    valuePath={["form_id"]}
    placeholder="Search forms..."
    label="Form (optional)"
    onChange={(value, form) => {
      log.debug("Form selected:", { value, form_name: form?.name });
    }}
  />
{/snippet}

<!--
  -- Surface Finish combo
  -->
{#snippet surfaceFinishCombo(fieldProps: FieldsSnippetProps<OfferingImageWithJunction>)}
  <FormComboBox2
    {fieldProps}
    items={surfaceFinishes}
    path={["surface_finish_id"]}
    labelPath={["name"]}
    valuePath={["surface_finish_id"]}
    placeholder="Search surface finishes..."
    label="Surface Finish (optional)"
    onChange={(value, surfaceFinish) => {
      log.debug("Surface Finish selected:", { value, surface_finish_name: surfaceFinish?.name });
    }}
  />
{/snippet}

<!--
  -- Construction Type combo
  -->
{#snippet constructionTypeCombo(fieldProps: FieldsSnippetProps<OfferingImageWithJunction>)}
  <FormComboBox2
    {fieldProps}
    items={constructionTypes}
    path={["construction_type_id"]}
    labelPath={["name"]}
    valuePath={["construction_type_id"]}
    placeholder="Search construction types..."
    label="Construction Type (optional)"
    onChange={(value, constructionType) => {
      log.debug("Construction Type selected:", { value, construction_type_name: constructionType?.name });
    }}
  />
{/snippet}

<!-- TEMPLATE ------------------------------------------------------------------------------------>

<ValidationWrapper errors={zodErrors}>
  <FormShell
    entity="Image"
    initial={formData as OfferingImageWithJunction}
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
      {@const image = data as OfferingImageWithJunction}
      <div class="form-header">
        <div>
          {#if image?.image_id}
            <h3>
              {image.filename || "Unnamed Image"}
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
      {@const image = fieldProps.data as OfferingImageWithJunction}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- ===== IMAGE FIELDS ===== -->

          <!-- Filepath (REQUIRED - user enters) --------------------------------------------->
          <Field
            {fieldProps}
            path={["filepath"]}
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
              value={image?.filename}
              class="span-2"
            />

            <!-- File Hash (readonly, SHA-256) -->
            <StaticFieldValue
              label="File Hash (SHA-256)"
              value={image?.file_hash}
              formatter={truncateHash}
              hint="Truncated"
              class="span-2"
            />

            <!-- File Size (readonly, bytes → KB/MB) -->
            <StaticFieldValue
              label="File Size"
              value={image?.file_size_bytes}
              formatter={formatFileSize}
            />

            <!-- Dimensions (readonly, width x height) -->
            <StaticFieldValue
              label="Dimensions"
              value={{w: image?.width_px, h: image?.height_px}}
              formatter={formatDimensions}
            />

            <!-- MIME Type (readonly, detected from extension) -->
            <StaticFieldValue
              label="MIME Type"
              value={image?.mime_type}
            />

            <!-- Prompt Fingerprint (readonly, calculated from variant fields) -->
            <StaticFieldValue
              label="Prompt Fingerprint"
              value={image?.prompt_fingerprint}
              formatter={truncateHash}
              hint="MD5 hash"
              class="span-2"
            />

            <!-- Explicit (readonly, true = offering-specific, false = canonical/shared) -->
            <StaticFieldValue
              label="Explicit"
              value={image?.explicit}
              formatter={(val) => val === true ? "Yes (Offering-specific)" : val === false ? "No (Canonical/Shared)" : "N/A"}
            />
          {/if}

          <!-- ===== VARIANT MATCHING FIELDS (for image matching logic) ===== -->

          <!-- Material (e.g., Rose Quartz, Amethyst) ---------------------------------------->
          {@render materialCombo(fieldProps)}

          <!-- Form (e.g., Sphere, Pyramid, Heart) ------------------------------------------->
          {@render formCombo(fieldProps)}

          <!-- Surface Finish (e.g., Polished, Tumbled) -------------------------------------->
          {@render surfaceFinishCombo(fieldProps)}

          <!-- Construction Type (e.g., Threaded, Pendant) ----------------------------------->
          {@render constructionTypeCombo(fieldProps)}

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

          <!-- ===== OFFERING IMAGE FIELDS ===== -->

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
            path={["shopify_url"]}
            label="Shopify URL"
            placeholder="Shopify CDN URL"
            class="span-2"
          />

          <!-- Shopify Media ID --------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["shopify_media_id"]}
            label="Shopify Media ID"
            placeholder="Shopify media identifier"
          />

          <!-- Uploaded to Shopify At --------------------------------------------------------->
          <Field
            {fieldProps}
            path={["uploaded_to_shopify_at"]}
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
