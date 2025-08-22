<script lang="ts">
  // SupplierForm built on FormShell (Svelte 5 + Runes)
  // - English comments
  // - Uses domain type Wholesaler (no component-local entity types)
  // - Wide validator/submit signatures to satisfy FormShell's ValidateFn/SubmitFn

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
    <div style="display:flex;gap:.5rem;align-items:center">
      <h2 style="margin:0">Wholesaler</h2>
      {#if dirty}<span class="pc-grid__badge">unsaved</span>{/if}
      {#if (data as any)?.id}
        <span class="pc-grid__badge">ID: {(data as any).id}</span>
      {/if}
    </div>
  {/snippet}

  {#snippet fields({ get, set, errors, markTouched })}
    <div
      style="display:grid;grid-template-columns:200px 1fr;gap:.75rem;align-items:center"
    >
      <!-- name (required by Wholesaler) -->
      <label for="wh-name">Name</label>
      <div>
        <input
          id="wh-name"
          value={get("name") ?? ""}
          oninput={(e: Event) =>
            set("name", (e.currentTarget as HTMLInputElement).value)}
          onblur={() => markTouched("name")}
          required
          aria-invalid={errors.name ? "true" : "false"}
          aria-describedby={errors.name ? "err-name" : undefined}
        />
        {#if errors.name}<div
            id="err-name"
            class="pc-grid__badge pc-grid__badge--warn"
          >
            {errors.name[0]}
          </div>{/if}
      </div>

      <!-- dropship (required by Wholesaler) -->
      <label for="wh-dropship">Dropship</label>
      <div>
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
        {#if errors.dropship}<div
            id="err-dropship"
            class="pc-grid__badge pc-grid__badge--warn"
          >
            {errors.dropship[0]}
          </div>{/if}
      </div>

      <!-- optional UI fields -->
      <label for="wh-country">Country</label>
      <div>
        <select
          id="wh-country"
          value={get("country") ?? ""}
          onchange={(e: Event) =>
            set("country", (e.currentTarget as HTMLSelectElement).value)}
          aria-invalid={errors.country ? "true" : "false"}
          aria-describedby={errors.country ? "err-country" : undefined}
        >
          <option value="">Select…</option>
          <option value="AT">Austria</option>
          <option value="DE">Germany</option>
          <option value="CH">Switzerland</option>
        </select>
        {#if errors.country}<div
            id="err-country"
            class="pc-grid__badge pc-grid__badge--warn"
          >
            {errors.country[0]}
          </div>{/if}
      </div>

      <label for="wh-email">Email</label>
      <div>
        <input
          id="wh-email"
          type="email"
          inputmode="email"
          value={get("email") ?? ""}
          oninput={(e: Event) =>
            set("email", (e.currentTarget as HTMLInputElement).value)}
          onblur={() => markTouched("email")}
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "err-email" : undefined}
        />
        {#if errors.email}<div
            id="err-email"
            class="pc-grid__badge pc-grid__badge--warn"
          >
            {errors.email[0]}
          </div>{/if}
      </div>

      <label for="wh-notes" style="align-self:start">Notes</label>
      <div>
        <textarea
          id="wh-notes"
          rows="4"
          oninput={(e: Event) =>
            set("notes", (e.currentTarget as HTMLTextAreaElement).value)}
          >{get("notes") ?? ""}</textarea
        >
      </div>
    </div>
  {/snippet}

  {#snippet actions({ submit, cancel, submitting, dirty })}
    <button
      class="pc-grid__btn"
      type="button"
      onclick={cancel}
      disabled={submitting}
    >
      Cancel
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => submit()}
      disabled={!dirty || submitting}
      aria-busy={submitting}
    >
      {#if submitting}<span class="pc-grid__spinner" aria-hidden="true"
        ></span>{/if}
      Save
    </button>
  {/snippet}
</FormShell>
