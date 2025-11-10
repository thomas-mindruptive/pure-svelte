<script lang="ts">
  /**
   * SupplierForm Component (Svelte 5 + Runes)
   */

  import { ApiClient } from "$lib/api/client/apiClient";
  import { getSupplierApi } from "$lib/api/client/supplier";
  import type {
    CancelledCallback,
    ChangedCallback,
    Errors,
    SubmitErrorCallback,
    SubmittedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import Field from "$lib/components/forms/Field.svelte";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { WholesalerSchema, type Wholesaler, type WholesalerPriceRange, type WholesalerRelevance } from "$lib/domain/domainTypes";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  // === PROPS ====================================================================================

  export type SupplierFormProps = {
    initial?: Wholesaler | undefined | null;
    disabled?: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const { initial, disabled = false, onSubmitted, onSubmitError, onCancelled, onChanged }: SupplierFormProps = $props();

  type SupplierFormData = Partial<Wholesaler>;

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const supplierApi = getSupplierApi(client);

  // === VALIDATE =================================================================================

  let { initialValidateSupplierData, errors } = $derived.by(() => {
    // NOTE: our initial data is ONLY a wholesaler, not the complete SupplierDetail_LoadDataSchema.
    const result = WholesalerSchema.nullable().safeParse(initial);
    if (result.error) {
      log.error(`Validation of supplier data to WholesalerSchema failed.`, result.error);
    }
    return {
      validatedData: result.success ? result.data : null,
      errors: result.success ? null : result.error.issues,
      isValid: result.success,
      initialValidateSupplierData: result.success ? (result.data ?? null) : null,
    };
  });

  // === STATE ====================================================================================

  const isCreateMode = $derived(!initialValidateSupplierData);

  // === BUSINESS FUNCTIONALITY ===================================================================

  // Diese Funktion bleibt für Geschäftslogik, die HTML nicht kann.
  function validateWholesaler(raw: Record<string, any>): ValidateResult<Wholesaler> {
    const data = raw as SupplierFormData;
    const errors: Errors<Wholesaler> = {};

    // Beispiel für eine Regel, die HTML nicht kann:
    if (data.name?.toLowerCase() === "test") {
      errors.name = ['"Test" is not a valid supplier name.'];
    }

    // Die 'required' Checks sind jetzt redundant, aber schaden nicht als zweite Verteidigungslinie.
    if (!data.name?.trim()) {
      errors.name = ["Name is required"];
    }
    if (!data.country?.trim()) {
      errors.country = ["Country is required"];
    }
    // if (!data.status?.trim()) {
    //   errors.status = ["Status is required"];
    // }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== FORM CALLBACKS =====

  async function submitWholesaler(raw: Record<string, any>) {
    log.debug(`Submitting wholesaler`, raw);
    const data = raw as SupplierFormData;
    const isUpdate = !isCreateMode;
    try {
      if (isUpdate) {
        const { wholesaler_id, created_at, ...updateData } = data;
        assertDefined(wholesaler_id, "wholesaler_id is required for update");
        return await supplierApi.updateSupplier(wholesaler_id, updateData);
      } else {
        return await supplierApi.createSupplier(data);
      }
    } catch (e) {
      log.error({ component: "SupplierForm", error: String(e) }, "SUBMIT_FAILED");
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
    entity="Wholesaler"
    initial={initial as SupplierFormData}
    validate={validateWholesaler}
    submitCbk={submitWholesaler}
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
      {@const wholesaler = data as SupplierFormData}
      <div class="form-header">
        <div>
          {#if wholesaler?.wholesaler_id}
            <h3>{wholesaler.name || "Unnamed Supplier"}</h3>
            <span class="field-hint">ID: {wholesaler.wholesaler_id}</span>
          {:else}
            <h3>{wholesaler.name || "New Supplier"}</h3>
          {/if}
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
      {@const { getS, set, validationErrors: errors, markTouched } = fieldProps}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- --------------------------------------------------------------------------------
            -- Name
            ---------------------------------------------------------------------------------- -->
          <Field
            {fieldProps}
            path={["name"]}
            label="Supplier Name"
            placeholder="Enter supplier name"
            required
            class="span-1"
          />

          <!-- --------------------------------------------------------------------------------
            -- Region
            ---------------------------------------------------------------------------------- -->
          <Field
            {fieldProps}
            path={["region"]}
            label="Region"
            placeholder="e.g. Europe, Asia"
          />
          <!-- --------------------------------------------------------------------------------
            -- Country 
            ---------------------------------------------------------------------------------- -->
          <div class="form-group">
            <label for="supplier-country">Country *</label>
            <select
              id="supplier-country"
              name="country"
              value={getS("country") ?? ""}
              class:invalid={errors.country}
              onchange={(e) => set(["country"], (e.currentTarget as HTMLSelectElement).value)}
              onblur={() => markTouched("country")}
              required
            >
              <option value="">Select country…</option>
              <option value="AT">Austria</option>
              <option value="DE">Germany</option>
              <option value="NL">Netherlands</option>
              <option value="CH">Switzerland</option>
              <option value="UK">United Kingdom</option>
              <option value="CZ">Czech Republic</option>
              <option value="SVK">Slovakia</option>
              <option value="ES">Spain</option>
              <option value="US">United States</option>
              <option value="BRA">Brazil</option>
              <option value="CN">China</option>
              <option value="IN">India</option>
              <option value="JP">Japan</option>
            </select>
            {#if errors.country}
              <div class="error-text">{errors.country[0]}</div>
            {/if}
          </div>
          <!-- --------------------------------------------------------------------------------
            -- Status
            ---------------------------------------------------------------------------------- -->
          <Field
            {fieldProps}
            path={["status"]}
            label="Status"
            type="textarea"
            rows={2}
            class="span-2"
          />
        </div>
        <!-- --------------------------------------------------------------------------------
            -- Relevance 
            ---------------------------------------------------------------------------------- -->
        <div class="form-row-grid">
          <div class="form-group">
            <label for="relevance">Relevance</label>
            <select
              id="relevance"
              name="relevance"
              value={getS("relevance") ?? ""}
              class:invalid={errors.relevance}
              onchange={(e) => set(["relevance"], (e.currentTarget as HTMLSelectElement).value as WholesalerRelevance)}
              onblur={() => markTouched("relevance")}
            >
              <option value="">Select relevance...</option>
              <option value="lowest">lowest</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="highest">highest</option>
            </select>
            {#if errors.relevance}
              <div class="error-text">{errors.relevance[0]}</div>
            {/if}
          </div>

          <!-- --------------------------------------------------------------------------------
            -- Price range 
            ---------------------------------------------------------------------------------- -->
          <div class="form-group">
            <label for="pricerange">Price Range</label>
            <select
              id="pricerange"
              name="price_range"
              value={getS("price_range") ?? ""}
              class:invalid={errors.price_range}
              onchange={(e) => set(["price_range"], (e.currentTarget as HTMLSelectElement).value as WholesalerPriceRange)}
              onblur={() => markTouched("price_range")}
            >
              <option value="">Select price range...</option>
              <option value="very expensive">very expensive</option>
              <option value="expensive">expensive</option>
              <option value="medium">medium</option>
              <option value="cheap">cheap</option>
              <option value="very cheap">very cheap</option>
            </select>
            {#if errors.price_range}
              <div class="error-text">{errors.price_range[0]}</div>
            {/if}
          </div>

          <!-- --------------------------------------------------------------------------------
            -- Dropship
            ---------------------------------------------------------------------------------- -->
          <Field
            {fieldProps}
            path={["dropship"]}
            label="Offers Dropshipping"
            type="checkbox"
          />
        </div>

        <div class="form-row-grid">
          <!-- --------------------------------------------------------------------------------
            -- email
            ---------------------------------------------------------------------------------- -->
          <Field
            {fieldProps}
            path={["email"]}
            label="Email Address"
            type="email"
            placeholder="contact@supplier.com"
            class="span-1"
          />

          <!-- --------------------------------------------------------------------------------
            -- Website
            ---------------------------------------------------------------------------------- -->
          <Field
            class="span-1"
            {fieldProps}
            path={["website"]}
            label="Website"
            type="url"
            placeholder="https://www.supplier.com"
          />

          <!-- --------------------------------------------------------------------------------
            -- Notes
            ---------------------------------------------------------------------------------- -->
          <Field
            class="span-3"
            {fieldProps}
            path={["b2b_notes"]}
            label="Business Notes"
            type="textarea"
            rows={4}
            placeholder="Additional notes..."
          />
          <div class="char-count">
            {(getS("b2b_notes") ?? "").length}
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
          Save Supplier
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
