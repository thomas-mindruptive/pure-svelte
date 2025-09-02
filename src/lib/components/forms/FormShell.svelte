<script lang="ts">
  // FormShell (Svelte 5 + Runes) - FIXED structuredClone Issue
  // - English comments
  // - Owns data state, dirty/touched tracking, validation, submit/cancel orchestration
  // - Callback props for component events (recommended in Svelte 5):
  //     onSubmitted({ data, result })
  //     onSubmitError({ data, error })
  //     onCancelled({ data, reason? })
  //     onChanged({ data, dirty })
  // - Also dispatches DOM CustomEvents with the same names for optional interop
  // - Snippets (instead of slots):
  //     header({ data, dirty })
  //     fields({ data, set, get, errors, touched, markTouched, validate })
  //     actions({ submit, cancel, submitting, valid, dirty, disabled })
  //     footer({ data })
  //
  // FIXED: Safe cloning to prevent DataCloneError from DOM elements, functions, etc.
  //
  // Accessibility:
  // - No onkeydown on <form> (avoids a11y warning). Keyboard shortcuts are bound programmatically.
  // - Error summary has aria-live="polite".

  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { log } from "$lib/utils/logger";
  import type { Errors, ValidateFn, SubmitFn, CancelFn, SubmittedCallback, SubmitErrorCallback, CancelledCallback, ChangedCallback } from "./forms.types";
  import type { FormData } from "./forms.types";

  // ===== FORM HANDLER TYPES =====

  // See: forms.types.ts

  // ===== PROPS TYPES =====

  // Snippet prop types (tuple generic for Svelte 5)
  type HeaderProps = { data: FormData; dirty: boolean };

  type FieldsProps = {
    data: FormData;
    set: (path: string, value: unknown) => void;
    get: (path: string) => any;
    errors: Errors;
    touched: Set<string>;
    markTouched: (path: string) => void;
    validate: (path?: string) => Promise<boolean>;
  };

  type ActionsProps = {
    submit: () => Promise<void>;
    cancel: () => void;
    submitting: boolean;
    valid: boolean;
    dirty: boolean;
    disabled: boolean;
  };

  type FooterProps = { data: FormData };

  // ===== PROPS =====

  const {
    // Data & lifecycle
    initial = {} as FormData,
    validate, // optional: (data) => { valid, errors? }
    submit, // required
    onCancel, // optional (simple callback on cancel)
    autoValidate = "submit" as "submit" | "blur" | "change",
    disabled = false,
    formId = "form",
    entity = "form", // for logging context

    // Snippets (all optional)
    header,
    fields,
    actions,
    footer,

    // Svelte 5 component-callback props (recommended)
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged,
  } = $props<{
    initial?: FormData;
    validate?: ValidateFn;
    submit: SubmitFn;
    onCancel?: CancelFn;
    autoValidate?: "submit" | "blur" | "change";
    disabled?: boolean;
    formId?: string;
    entity?: string;

    header?: Snippet<[HeaderProps]>;
    fields?: Snippet<[FieldsProps]>;
    actions?: Snippet<[ActionsProps]>;
    footer?: Snippet<[FooterProps]>;

    // Callback props (component "events" in Svelte 5)
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  }>();

  // ---- SAFE CLONING UTILITY ----

  /**
   * Safely clones form data, handling DataCloneError from non-cloneable objects
   * Falls back to JSON clone if structuredClone fails
   */
  function safeClone<T extends Record<string, any>>(obj: T): T {
    try {
      return structuredClone(obj);
    } catch (error) {
      log.warn("structuredClone failed, using JSON fallback", {
        entity,
        error: String(error),
      });

      try {
        // JSON fallback: works for most form data but loses functions/dates
        return JSON.parse(JSON.stringify(obj));
      } catch (jsonError) {
        log.error("JSON clone also failed, using shallow copy", {
          entity,
          error: String(jsonError),
        });

        // Last resort: shallow copy
        return { ...obj } as T;
      }
    }
  }

  /**
   * Creates a clean snapshot for dirty checking
   * Strips potentially problematic properties
   */
  function createSnapshot(data: FormData): FormData {
    const cleaned: FormData = {};

    for (const [key, value] of Object.entries(data)) {
      // Skip known problematic types
      if (value === null || value === undefined) {
        cleaned[key] = value;
      } else if (typeof value === "object" && value instanceof Date) {
        cleaned[key] = value.toISOString(); // Convert dates to strings
      } else if (typeof value === "object" && value.constructor === Object) {
        cleaned[key] = createSnapshot(value); // Recursively clean nested objects
      } else if (Array.isArray(value)) {
        cleaned[key] = value.map((item) =>
          typeof item === "object" && item !== null
            ? createSnapshot(item)
            : item,
        );
      } else if (["string", "number", "boolean"].includes(typeof value)) {
        cleaned[key] = value;
      }
      // Skip functions, DOM elements, circular references, etc.
    }

    return cleaned;
  }

  // ---- State (Runes) ----
  const cleanInitial = createSnapshot(initial);
  const data = $state<FormData>(safeClone(cleanInitial));
  const snapshot = $state<FormData>(safeClone(cleanInitial)); // for dirty check
  const errors = $state<Errors>({});
  const touched = $state<Set<string>>(new Set());
  let submitting = $state(false);
  let validating = $state(false);

  let formEl: HTMLFormElement;

  // !!!!!!!!!!!!!!!!!!!!!!!!! DEBUG
  $effect(() => {
    log.debug("FormShell State Change:", {
        entity,
        data_product_def_id: data.product_def_id,
        data_keys: Object.keys(data),
        snapshot_product_def_id: snapshot.product_def_id
    });
});

  // ---- Keybindings (programmatic to avoid a11y warning) ----
  onMount(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!formEl || !(t && formEl.isConnected && formEl.contains(t))) return;

      // Ctrl/Cmd + Enter → submit
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void doSubmit();
        return;
      }
      // Esc → cancel
      if (e.key === "Escape") {
        e.preventDefault();
        doCancel("escape");
      }
    };

    formEl?.addEventListener("keydown", keyHandler);
    log.info("FORM_MOUNTED", { entity, autoValidate, cleanInitial, data, snapshot });
    return () => formEl?.removeEventListener("keydown", keyHandler);
  });

  // ---- Helpers ----
  function coerceMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  function set(path: string, value: unknown) {
    // naive dotted-path setter (sufficient for typical forms)
    try {
      const parts = path.split(".");
      let cur: any = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
        cur = cur[k];
      }
      cur[parts[parts.length - 1]] = value;
    } catch (e) {
      log.error(
        { component: "FormShell", entity, path, error: coerceMessage(e) },
        "set failed",
      );
    }
  }

  function get(path: string): any {
    try {
      const parts = path.split(".");
      let cur: any = data;
      for (const k of parts) {
        if (cur == null) return undefined;
        cur = cur[k];
      }
      return cur;
    } catch (e) {
      log.error(
        { component: "FormShell", entity, path, error: coerceMessage(e) },
        "get failed",
      );
      return undefined;
    }
  }

  function isDirty(): boolean {
    try {
      // Use safe comparison for dirty checking
      const currentSnapshot = createSnapshot(data);
      const isDirty =  JSON.stringify(currentSnapshot) !== JSON.stringify(snapshot);
      log.debug("isDirty check:", { isDirty, current: currentSnapshot.product_def_id, snapshot: snapshot.product_def_id });
      return isDirty
    } catch {
      log.warn(
        { component: "FormShell", entity },
        "isDirty comparison failed, assuming dirty",
      );
      return true; // assume dirty if comparison fails
    }
  }

  function clearErrors(paths?: string[]) {
    if (!paths || paths.length === 0) {
      for (const k in errors) delete errors[k];
      return;
    }
    for (const p of paths) delete errors[p];
  }

  function setFieldErrors(path: string, msgs: string[]) {
    errors[path] = msgs;
  }

  async function runValidate(path?: string): Promise<boolean> {
    if (!validate) return true;
    validating = true;
    try {
      const res = await validate(data);
      if (res?.errors) {
        if (path) {
          const msgs = res.errors[path] ?? [];
          clearErrors([path]);
          if (msgs.length) setFieldErrors(path, msgs);
        } else {
          for (const k in errors) delete errors[k];
          Object.assign(errors, res.errors);
        }
      } else {
        for (const k in errors) delete errors[k];
      }
      return !!res?.valid;
    } catch (e) {
      log.warn(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "validate threw",
      );
      return true; // fail-open on validator errors
    } finally {
      validating = false;
    }
  }

  function markTouched(path: string) {
    touched.add(path);
    if (autoValidate === "blur") {
      // run validation for this field only; ignore result
      void runValidate(path);
    }
  }

  // ---- Orchestration ----
  async function doSubmit(): Promise<void> {
    log.debug(`(FormShell) doSubmit called`, { entity });
    if (disabled || submitting) return;
    submitting = true;

    if (autoValidate === "submit" || autoValidate === "change") {
      const ok = await runValidate();
      if (!ok) {
        submitting = false;
        try {
          onSubmitError?.({
            data: safeClone(data),
            error: new Error("Validation failed before submission."),
          });
        } catch (e) {
          log.error(
            { component: "FormShell", entity, error: coerceMessage(e) },
            "onSubmitError threw",
          );
        }
        return;
      }
    }

    try {
      // Inform parent.
      const result = await submit(safeClone(data));

      // Update snapshot after successful submission
      const newSnapshot = createSnapshot(data);
      Object.assign(snapshot, newSnapshot);

      try {
        onSubmitted?.({ data: safeClone(data), result });
      } catch (e) {
        log.error(
          { component: "FormShell", entity, error: coerceMessage(e) },
          "onSubmitted threw",
        );
      }

      log.info({ component: "FormShell", entity }, "FORM_SUBMITTED");
    } catch (e) {
      log.error(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "FORM_SUBMIT_FAILED",
      );

      try {
        onSubmitError?.({ data: safeClone(data), error: e });
      } catch (e) {
        log.error(
          { component: "FormShell", entity, error: coerceMessage(e) },
          "onSubmitError threw",
        );
      }
    } finally {
      submitting = false;
    }
  }

  function doCancel(reason?: string) {
    log.debug(`Cancelled - ${reason}`);
    try {
      onCancel?.(safeClone(data));
    } catch (e) {
      log.warn(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "onCancel threw",
      );
    } finally {
      const detail: { data: FormData; reason?: string } = {
        data: safeClone(data),
      };
      if (reason !== undefined) detail.reason = reason;

      try {
        onCancelled?.(detail);
      } catch (e) {
        log.error(
          { component: "FormShell", entity, error: coerceMessage(e) },
          "onCancelled threw",
        );
      }
    }
  }

  function handleInput(path: string, value: unknown) {
    set(path, value);

    try {
      onChanged?.({ data: safeClone(data), dirty: isDirty() });
    } catch (e) {
      log.error(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "onChanged threw",
      );
    }

    if (autoValidate === "change") {
      void runValidate(path);
    }
  }
</script>

<form
  id={formId}
  class="pc-form pc-grid pc-grid--comfortable"
  bind:this={formEl}
  onsubmit={(e: Event) => {
    e.preventDefault();
    void doSubmit();
  }}
  aria-busy={submitting || validating}
>
  <!-- Header area -->
  <div class="pc-grid__toolbar">
    {#if header}
      {@render header({ data, dirty: isDirty() })}
    {:else}
      <!-- Default header (can be overridden) -->
      <strong>{entity}</strong>
      {#if isDirty()}<span class="pc-grid__badge">unsaved</span>{/if}
    {/if}
  </div>

  <!-- Error summary (polite) -->
  {#if Object.keys(errors).length > 0}
    <div class="pc-grid__empty" aria-live="polite">
      <!-- Compact summary of first messages per field -->
      {#each Object.entries(errors) as [path, msgs]}
        <div><strong>{path}</strong>: {msgs[0]}</div>
      {/each}
    </div>
  {/if}

  <!-- Fields region -->
  <div class="pc-grid__scroller" style="padding: 0.5rem 0.75rem;">
    {#if fields}
      {@render fields({
        data,
        set: handleInput /* set(path, value) + fires 'changed' + optional auto-validate */,
        get,
        errors,
        touched,
        markTouched,
        validate: runValidate,
      })}
    {:else}
      <em style="color: var(--pc-grid-muted);">No fields snippet provided</em>
    {/if}
  </div>

  <!-- Footer / actions -->
  <div class="pc-grid__toolbar" style="justify-content: end; gap: .5rem;">
    {#if actions}
      {@render actions({
        submit: doSubmit,
        cancel: () => doCancel("button"),
        submitting,
        valid: Object.keys(errors).length === 0,
        dirty: isDirty(),
        disabled,
      })}
    {:else}
      <button
        class="pc-grid__btn"
        type="button"
        onclick={() => doCancel("button")}
        disabled={submitting || disabled}
      >
        Cancel
      </button>
      <button
        class="pc-grid__btn pc-grid__btn--danger"
        type="submit"
        disabled={submitting || disabled}
        aria-busy={submitting}
      >
        {#if submitting}<span class="pc-grid__spinner" aria-hidden="true"
          ></span>{/if}
        Save
      </button>
    {/if}
  </div>

  {#if footer}
    {@render footer({ data })}
  {/if}
</form>
