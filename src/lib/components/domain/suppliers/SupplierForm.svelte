<script lang="ts">
  /**
   * SupplierForm Component (Svelte 5 + Runes)
   *
   * @description A comprehensive form component for creating and editing supplier (wholesaler) records.
   * Built as a wrapper around the reusable FormShell component, providing supplier-specific
   * validation, business logic, and UI elements.
   *
   * @features
   * - Create/Edit mode detection based on presence of ID
   * - Comprehensive validation with custom business rules
   * - Responsive 4-column grid layout with mobile adaptivity
   * - Integration with logging and notification systems
   * - Type-safe props and validation using domain types
   *
   * @architecture
   * - Uses FormShell for form state management and lifecycle
   * - Implements adapter pattern for validation and submission
   * - Follows CSS-in-JS pattern with form.css integration
   * - Svelte 5 callback props for event handling
   *
   * @example
   * ```svelte
   * <SupplierForm
   *   initial={selectedSupplier}
   *   disabled={false}
   *   onSubmitted={(data) => handleSuccess(data)}
   *   onCancelled={() => navigateBack()}
   * />
   * ```
   */

  import FormShell, {

  } from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import type { Wholesaler } from "$lib/domain/domainTypes";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getSupplierApi } from "$lib/api/client/supplier";
  import { typeGuard } from "$lib/utils/typeUtils";
    import type { SubmittedCallback, SubmitErrorCallback, CancelledCallback, ChangedCallback, ValidateResult } from "$lib/components/forms/forms.types";

  // ===== COMPONENT PROPS & TYPES =====

  /**
   * Form validation error structure
   * Maps field names to arrays of error messages for comprehensive error display
   */
  type ValidationErrors = Record<string, string[]>;

  // ===== PROPS DESTRUCTURING =====

  const {
    // Default to minimal Wholesaler object with required fields
    initial = { name: "", dropship: false } as Wholesaler,
    disabled = false,

    // Svelte 5 component-callback props
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged,
  } = $props<{
    /** Initial form data - if provided with ID, enables edit mode */
    initial?: Wholesaler;
    /** Whether the entire form should be disabled */
    disabled?: boolean;

    // Callback props (component "events" in Svelte 5)
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  }>();

  // Silence unused variable warnings - these are used by FormShell via callback props
  onSubmitted;
  onCancelled;

  export type SupplierFormData = Partial<Wholesaler>;

  // ===== API =====

  // 1. Create an ApiClient instance with client `fetch`.
  const client = new ApiClient(fetch);
  const supplierApi = getSupplierApi(client);

  // ===== VALIDATION LOGIC =====

  /**
   * Validates supplier form data against business rules and UI constraints
   *
   * @param raw - Raw form data from FormShell (includes both domain and UI-specific fields)
   * @returns ValidationResult with validation status and field-specific errors
   *
   * @businessRules
   * - Name: Required, non-empty after trimming
   * - Dropship: Required boolean (business constraint)
   * - Email: Optional, but must be valid format if provided
   * - Country: Required for business operations (UI constraint)
   */
  function validateWholesaler(raw: Record<string, any>): ValidateResult {
    const data = raw as Partial<Wholesaler> & Record<string, any>;
    const errors: ValidationErrors = {};

    // === REQUIRED DOMAIN FIELDS ===
    // These are enforced by the Wholesaler domain type

    if (!String(data.name ?? "").trim()) {
      errors.name = ["Name is required"];
    }

    if (typeof data.dropship !== "boolean") {
      errors.dropship = ["Dropship must be true/false"];
    }

    // === OPTIONAL UI VALIDATION ===
    // These fields may not be part of core Wholesaler type but are required by UI/business logic

    // Email validation: optional field, but must be valid if provided
    if (data.email && !/^\S+@\S+\.\S+$/.test(String(data.email))) {
      errors.email = ["Invalid email address"];
    }

    // Country validation: required for business operations
    if (data.country == null || String(data.country).trim() === "") {
      errors.country = ["Country is required"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== SUBMISSION LOGIC =====

  /**
   * Handles form submission with automatic create/update detection
   *
   * @param raw - Form data from FormShell
   * @returns API response data for success handling
   *
   * @throws {Error} When API request fails or returns non-ok status
   *
   */
  async function submitWholesaler(raw: Record<string, any>) {
    log.debug(`SUBMIT_START`);
    const data = raw as Partial<Wholesaler>;

    // Detect create vs update mode based on presence of ID
    const id = data.wholesaler_id as string | undefined;
    const isUpdate = Boolean(id);

    try {
      log.info("SUBMIT_START");

      let res;
      if (isUpdate) {
        log.info(`(SupplierForm) Updating supplier ID: ${id}`);
        res = supplierApi.updateSupplier(data.wholesaler_id!, data);
      } else {
        log.info(`(SupplierForm) Creating new supplier`);
        res = supplierApi.createSupplier(data);
      }

      log.info({ component: "SupplierForm", ok: true }, "SUBMIT_OK");
      return res;
    } catch (e) {
      log.error(
        { component: "SupplierForm", error: String(e) },
        "SUBMIT_FAILED",
      );
      throw e; // Re-throw for FormShell error handling
    }
  }

  // ===== EVENT HANDLERS - They log and delegate to the parent =====

  /**
   * Handles successful form submission
   * Logs the event and delegates to parent component via callback prop
   */
  function handleSubmitted(p: { data: Record<string, any>; result: unknown }) {
    log.info({ component: "SupplierForm", event: "submitted" }, "FORM_EVENT");
    onSubmitted(p.data);
  }

  /**
   * Handles form submission errors AND delegates to parent component.
   * Logs the error for debugging and monitoring
   */
  function handleSubmitError(p: { data: Record<string, any>; error: unknown }) {
    log.warn(`Submit error: ${String(p.error)}`, {
      component: "SupplierForm",
      event: "submitError",
    });
    onSubmitError(p);
  }

  /**
   * Handles form cancellation.
   * Logs the cancellation reason and delegates to parent component.
   */
  function handleCancelled(p: { data: Record<string, any>; reason?: string }) {
    log.debug(
      { component: "SupplierForm", event: "cancelled", reason: p.reason },
      "FORM_EVENT",
    );
    onCancelled(p);
  }

  /**
   * Handles form change.
   * Logs the change event and delegates to parent component.
   */
  function handleChanged(p: { data: Record<string, any>; dirty: boolean }) {
    log.debug(
      { component: "SupplierForm", event: "changed", dirty: p.dirty },
      "FORM_EVENT",
    );
    onChanged(p);
  }
</script>

<!-- 
  SUPPLIER FORM TEMPLATE
  
  Uses FormShell as the foundation and provides supplier-specific form fields
  through the 'fields' snippet. The form automatically handles validation,
  submission, and error states.
-->
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
  <!-- FORM HEADER -->
  <!-- Displays entity info and unsaved changes indicator -->
  {#snippet header({ data, dirty })}
    {typeGuard<Wholesaler>(
      "wholesaler_id",
      "name",
      "region",
      "status",
      "dropship",
      "b2b_notes",
      "website",
      "created_at",
    )}
    {@const wholesaler = data as Wholesaler}
    <div class="form-header">
      <div>
        <h3>Wholesaler Details</h3>
        {#if wholesaler?.wholesaler_id}
          <span class="field-hint">ID: {wholesaler.wholesaler_id}</span>
        {/if}
      </div>
      <div>
        {#if dirty}
          <span class="pc-grid__badge pc-grid__badge--warn"
            >Unsaved changes</span
          >
        {/if}
      </div>
    </div>
  {/snippet}

  <!-- FORM FIELDS -->
  <!-- Responsive 4-column grid layout with comprehensive supplier fields -->
  {#snippet fields({ data, get, getS, set, errors, markTouched })}
    {typeGuard<Wholesaler>(
      "wholesaler_id",
      "name",
      "region",
      "status",
      "dropship",
      "b2b_notes",
      "website",
      "created_at",
    )}

    <div class="form-body">
      <!-- === MAIN SUPPLIER INFORMATION SECTION === -->
      <div class="form-grid">
        <!-- Supplier Name (Required, Primary Identifier) -->
        <div class="form-group span-2">
          <label for="wh-name">Supplier Name *</label>
          <input
            id="wh-name"
            type="text"
            value={getS("name") ?? ""}
            class={errors.name ? "error" : ""}
            placeholder="Enter supplier name"
            oninput={(e: Event) =>
              set(["name"], (e.currentTarget as HTMLInputElement).value)}
            onblur={() => markTouched("name")}
            required
            aria-invalid={errors.name ? "true" : "false"}
            aria-describedby={errors.name ? "err-name" : undefined}
          />
          {#if errors.name}
            <div id="err-name" class="error-text">
              {errors.name[0]}
            </div>
          {/if}
        </div>

        <!-- Region (Optional, Business Context) -->
        <div class="form-group">
          <label for="wh-region">Region</label>
          <input
            id="wh-region"
            type="text"
            value={getS("region") ?? ""}
            placeholder="e.g. Europe, Asia"
            oninput={(e: Event) =>
              set(["region"], (e.currentTarget as HTMLInputElement).value)}
            onblur={() => markTouched("region")}
          />
        </div>

        <!-- Status (Optional, Workflow State) -->
        <div class="form-group">
          <label for="wh-status">Status</label>
          <select
            id="wh-status"
            value={getS("status") ?? ""}
            onchange={(e: Event) =>
              set(["status"], (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Select status…</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="new">New</option>
          </select>
        </div>

        <!-- Country (Required for Business Operations) -->
        <div class="form-group">
          <label for="wh-country">Country *</label>
          <select
            id="wh-country"
            value={getS("region") ?? ""}
            class={errors.country ? "error" : ""}
            onchange={(e: Event) =>
              set(["region"], (e.currentTarget as HTMLSelectElement).value)}
            required
            aria-invalid={errors.country ? "true" : "false"}
            aria-describedby={errors.country ? "err-country" : undefined}
          >
            <option value="">Select country…</option>
            <!-- Common business countries - could be externalized to a data source -->
            <option value="AT">Austria</option>
            <option value="DE">Germany</option>
            <option value="CH">Switzerland</option>
            <option value="US">United States</option>
            <option value="CN">China</option>
            <option value="JP">Japan</option>
          </select>
          {#if errors.country}
            <div id="err-country" class="error-text">
              {errors.country[0]}
            </div>
          {/if}
        </div>

        <!-- Dropshipping Capability (Required Business Feature) -->
        <div class="form-group">
          <label for="wh-dropship">
            <input
              id="wh-dropship"
              type="checkbox"
              checked={Boolean(getS("dropship"))}
              onchange={(e: Event) =>
                set(["dropship"], (e.currentTarget as HTMLInputElement).checked)}
              required
              aria-invalid={errors.dropship ? "true" : "false"}
              aria-describedby={errors.dropship ? "err-dropship" : undefined}
            />
            Offers Dropshipping
          </label>
          {#if errors.dropship}
            <div id="err-dropship" class="error-text">
              {errors.dropship[0]}
            </div>
          {/if}
          <div class="field-hint">
            Check if this supplier offers dropshipping services
          </div>
        </div>
      </div>

      <!-- === CONTACT INFORMATION SECTION === -->
      <div class="form-grid">
        <!-- Email Address (Optional but Validated) -->
        <div class="form-group span-2">
          <label for="wh-email">Email Address</label>
          <input
            id="wh-email"
            type="email"
            inputmode="email"
            value={getS("email") ?? ""}
            class={errors.email ? "error" : ""}
            placeholder="contact@supplier.com"
            oninput={(e: Event) =>
              set(["email"], (e.currentTarget as HTMLInputElement).value)}
            onblur={() => markTouched("email")}
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={errors.email ? "err-email" : undefined}
          />
          {#if errors.email}
            <div id="err-email" class="error-text">
              {errors.email[0]}
            </div>
          {/if}
        </div>

        <!-- Website URL (Optional, Business Reference) -->
        <div class="form-group span-2">
          <label for="wh-website">Website</label>
          <input
            id="wh-website"
            type="url"
            value={getS("website") ?? ""}
            placeholder="https://www.supplier.com"
            oninput={(e: Event) =>
              set(["website"], (e.currentTarget as HTMLInputElement).value)}
            onblur={() => markTouched("website")}
          />
        </div>
      </div>

      <!-- === BUSINESS NOTES SECTION === -->
      <div class="form-grid">
        <!-- Business Notes (Optional, Free-form Business Context) -->
        <div class="form-group span-4">
          <label for="wh-notes">Business Notes</label>
          <textarea
            id="wh-notes"
            rows="4"
            placeholder="Additional notes about this supplier, business terms, contact persons, etc."
            oninput={(e: Event) =>
              set(["b2b_notes"], (e.currentTarget as HTMLTextAreaElement).value)}
            >
            {getS("b2b_notes") ?? ""}
          </textarea>
          <!-- Character count feedback for user guidance -->
          <div class="char-count">
            {getS("b2b_notes") ?? ""}.length}
          </div>
        </div>
      </div>
    </div>
  {/snippet}

  <!-- FORM ACTIONS -->
  <!-- Cancel and Save buttons with proper state management -->
  {#snippet actions({ submitAction: submit, cancel, submitting, dirty })}
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
        type="button"
        onclick={() => submit()}
        disabled={!dirty || submitting}
        aria-busy={submitting}
      >
        {#if submitting}
          <span class="pc-grid__spinner" aria-hidden="true"></span>
        {/if}
        Save Supplier
      </button>
    </div>
  {/snippet}
</FormShell>
