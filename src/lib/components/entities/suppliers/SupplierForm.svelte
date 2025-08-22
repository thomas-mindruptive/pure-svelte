<script lang="ts">
  // SupplierForm built on FormShell (Svelte 5 + Runes)
  // - English comments
  // - Uses domain type Wholesaler (no component-local entity types)
  // - Wide validator/submit signatures to satisfy FormShell's ValidateFn/SubmitFn
  // - UPDATED: Now uses proper CSS classes from form.css instead of inline styles

  import FormShell, {
    type ValidateResult,
  } from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import type { Wholesaler } from "$lib/domain/types";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";

  // Provide a Wholesaler-conform default (dropship is required)
  const {
    initial = { name: "", dropship: false } as Wholesaler,
    disabled = false,
    onSubmitted,
    onCancelled,
  } = $props<{
    initial?: Wholesaler;
    disabled?: boolean;
    onSubmitted?: (p: any) => void;
    onCancelled?: (p: any) => void;
  }>();

  onSubmitted;
  onCancelled;

  // Adapter validator: wide input (FormData) → check required + optional UI fields
  function validateWholesaler(raw: Record<string, any>): ValidateResult {
    const data = raw as Partial<Wholesaler> & Record<string, any>;
    const errors: Record<string, string[]> = {};

    // required by Wholesaler
    if (!String(data.name ?? "").trim()) errors.name = ["Name is required"];
    if (typeof data.dropship !== "boolean")
      errors.dropship = ["Dropship must be true/false"];

    // optional UI fields (not necessarily part of Wholesaler type)
    if (data.email && !/^\S+@\S+\.\S+$/.test(String(data.email)))
      errors.email = ["Invalid email address"];
    if (data.country == null || String(data.country).trim() === "")
      errors.country = ["Country is required"];

    return { valid: Object.keys(errors).length === 0, errors };
  }

  // Adapter submit: wide input (FormData) → cast minimally for API
  async function submitWholesaler(raw: Record<string, any>) {
    const data = raw as Partial<Wholesaler> & Record<string, any>;
    const id = data.id as string | undefined; // may be undefined
    const isUpdate = Boolean(id);

    const url = isUpdate ? `/api/wholesalers/${id}` : "/api/wholesalers";
    const method = isUpdate ? "PUT" : "POST";

    try {
      log.info({ component: "SupplierForm", method, url }, "SUBMIT_START");
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Save failed"));
      const json = await res.json().catch(() => ({}));
      log.info({ component: "SupplierForm", ok: true }, "SUBMIT_OK");
      return json;
    } catch (e) {
      log.error(
        { component: "SupplierForm", error: String(e) },
        "SUBMIT_FAILED",
      );
      throw e;
    }
  }

  // Component-callback handlers (NOT CustomEvent)
  function handleSubmitted(p: { data: Record<string, any>; result: unknown }) {
    log.info({ component: "SupplierForm", event: "submitted" }, "FORM_EVENT");
  }
  function handleSubmitError(p: { data: Record<string, any>; error: unknown }) {
    log.warn(
      {
        component: "SupplierForm",
        event: "submitError",
        error: String(p.error),
      },
      "FORM_EVENT",
    );
  }
  function handleCancelled(p: { data: Record<string, any>; reason?: string }) {
    log.info(
      { component: "SupplierForm", event: "cancelled", reason: p.reason },
      "FORM_EVENT",
    );
  }
</script>

<FormShell
  entity="Wholesaler"
  {initial}
  validate={validateWholesaler}
  submit={submitWholesaler}
  {disabled}
  onSubmitted={handleSubmitted}
  onSubmitError={handleSubmitError}
  onCancelled={handleCancelled}
>
  {#snippet header({ data, dirty })}
    <div class="form-header">
      <div>
        <h3>Wholesaler Details</h3>
        {#if (data as any)?.id}
          <span class="field-hint">ID: {(data as any).id}</span>
        {/if}
      </div>
      <div>
        {#if dirty}
          <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet fields({ get, set, errors, markTouched })}
    <div class="category-form">
      <!-- Main supplier information -->
      <div class="form-grid">
        <!-- Name (required, spans 2 columns) -->
        <div class="form-group span-2">
          <label for="wh-name">Supplier Name *</label>
          <input
            id="wh-name"
            type="text"
            value={get("name") ?? ""}
            class={errors.name ? 'error' : ''}
            placeholder="Enter supplier name"
            oninput={(e: Event) =>
              set("name", (e.currentTarget as HTMLInputElement).value)}
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

        <!-- Region -->
        <div class="form-group">
          <label for="wh-region">Region</label>
          <input
            id="wh-region"
            type="text"
            value={get("region") ?? ""}
            placeholder="e.g. Europe, Asia"
            oninput={(e: Event) =>
              set("region", (e.currentTarget as HTMLInputElement).value)}
            onblur={() => markTouched("region")}
          />
        </div>

        <!-- Status -->
        <div class="form-group">
          <label for="wh-status">Status</label>
          <select
            id="wh-status"
            value={get("status") ?? ""}
            onchange={(e: Event) =>
              set("status", (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Select status…</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="new">New</option>
          </select>
        </div>

        <!-- Country (required) -->
        <div class="form-group">
          <label for="wh-country">Country *</label>
          <select
            id="wh-country"
            value={get("country") ?? ""}
            class={errors.country ? 'error' : ''}
            onchange={(e: Event) =>
              set("country", (e.currentTarget as HTMLSelectElement).value)}
            required
            aria-invalid={errors.country ? "true" : "false"}
            aria-describedby={errors.country ? "err-country" : undefined}
          >
            <option value="">Select country…</option>
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

        <!-- Dropship (checkbox) -->
        <div class="form-group">
          <label for="wh-dropship">
            <input
              id="wh-dropship"
              type="checkbox"
              checked={Boolean(get("dropship"))}
              onchange={(e: Event) =>
                set("dropship", (e.currentTarget as HTMLInputElement).checked)}
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

      <!-- Contact information section -->
      <div class="form-grid">
        <!-- Email -->
        <div class="form-group span-2">
          <label for="wh-email">Email Address</label>
          <input
            id="wh-email"
            type="email"
            inputmode="email"
            value={get("email") ?? ""}
            class={errors.email ? 'error' : ''}
            placeholder="contact@supplier.com"
            oninput={(e: Event) =>
              set("email", (e.currentTarget as HTMLInputElement).value)}
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

        <!-- Website -->
        <div class="form-group span-2">
          <label for="wh-website">Website</label>
          <input
            id="wh-website"
            type="url"
            value={get("website") ?? ""}
            placeholder="https://www.supplier.com"
            oninput={(e: Event) =>
              set("website", (e.currentTarget as HTMLInputElement).value)}
            onblur={() => markTouched("website")}
          />
        </div>
      </div>

      <!-- Notes section -->
      <div class="form-grid">
        <div class="form-group span-4">
          <label for="wh-notes">Business Notes</label>
          <textarea
            id="wh-notes"
            rows="4"
            placeholder="Additional notes about this supplier, business terms, contact persons, etc."
            oninput={(e: Event) =>
              set("b2b_notes", (e.currentTarget as HTMLTextAreaElement).value)}
            >{get("b2b_notes") ?? ""}</textarea>
          <div class="char-count">
            {(get("b2b_notes") ?? "").length} / 1000 characters
          </div>
        </div>
      </div>
    </div>
  {/snippet}

  {#snippet actions({ submit, cancel, submitting, dirty })}
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