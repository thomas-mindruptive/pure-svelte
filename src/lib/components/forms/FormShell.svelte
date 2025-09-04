<script
  lang="ts"
  generics="T extends Record<string, any> = Record<string, any>"
>
  // FormShell (Svelte 5 + Runes) - FIXED structuredClone Issue
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
  import * as pathUtils from "$lib/utils/pathUtils";
  import type { NonEmptyPath, PathValue } from "$lib/utils/pathUtils";
  import { cloneDeep } from "lodash-es";

  import type {
    Errors,
    ValidateFn,
    SubmitFn,
    CancelFn,
    SubmittedCallback,
    SubmitErrorCallback,
    CancelledCallback,
    ChangedCallback,
  } from "./forms.types";
  import type { FormData } from "./forms.types";
  import { assertDefined } from "$lib/utils/validation/assertions";

  // ===== FORM HANDLER TYPES =====

  // See: forms.types.ts

  // ===== PROPS TYPES =====

  // Snippet prop types (tuple generic for Svelte 5)
  type HeaderProps<T> = { data: FormData<T>; dirty: boolean };

  type FieldsProps<T> = {
    data: FormData<T>;

    // Not needed currently: setS<K extends keyof FormData<T>>(key: K, value: T[K]): void;
    set<P extends NonEmptyPath<FormData<T>>>(
      path: readonly [...P],
      value: PathValue<T, P>,
    ): void;

    get<P extends NonEmptyPath<FormData<T>>>(
      path: readonly [...P],
    ): PathValue<FormData<T>, P> | undefined;

    getS<K extends keyof FormData<T>>(key: K): FormData<T>[K] | undefined;

    errors: Errors;
    touched: Set<string>;
    markTouched: (path: string) => void;
    validate: (path?: string) => Promise<boolean>;
  };

  type ActionsProps = {
    submitAction: () => Promise<void>;
    cancel: () => void;
    submitting: boolean;
    valid: boolean;
    dirty: boolean;
    disabled: boolean;
  };

  type FooterProps<T> = { data: FormData<T> };

  // ===== PROPS =====

  const {
    // Data & lifecycle
    initial = {} as FormData<T>,
    validate, // optional: (data) => { valid, errors? }
    submitCbk, // required
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
    initial?: FormData<T>;
    validate?: ValidateFn<T>;
    submitCbk: SubmitFn<T>;
    onCancel?: CancelFn<T>;
    autoValidate?: "submit" | "blur" | "change";
    disabled?: boolean;
    formId?: string;
    entity?: string;

    header?: Snippet<[HeaderProps<T>]>;
    fields?: Snippet<[FieldsProps<T>]>;
    actions?: Snippet<[ActionsProps]>;
    footer?: Snippet<[FooterProps<T>]>;

    // Callback props (component "events" in Svelte 5)
    onSubmitted?: SubmittedCallback<T>;
    onSubmitError?: SubmitErrorCallback<T>;
    onCancelled?: CancelledCallback<T>;
    onChanged?: ChangedCallback<T>;
  }>();

  log.debug(`(FormShell) props:`, {
    entity,
    initial,
    autoValidate,
    disabled,
    hasHeader: !!header,
    hasFields: !!fields,
    hasActions: !!actions,
    hasFooter: !!footer,
  });

  // ---- SAFE CLONING UTILITY ----


  /**
   * Creates a clean snapshot for dirty checking
   * Strips potentially problematic properties
   */
  function pureDataDeepClone(data: any): Record<string, any> {
    assertDefined(data, "createSnapshot");
    const cleaned: Record<string, any> = cloneDeep(data);
    return cleaned;

    // OLD!:
    // for (const [key, value] of Object.entries(data)) {
    //   // Skip known problematic types
    //   if (value === null || value === undefined) {
    //     cleaned[key] = value;
    //   } else if (typeof value === "object" && value instanceof Date) {
    //     cleaned[key] = value.toISOString(); // Convert dates to strings
    //   } else if (typeof value === "object" && value.constructor === Object) {
    //     cleaned[key] = createSnapshot(value); // Recursively clean nested objects
    //   } else if (Array.isArray(value)) {
    //     cleaned[key] = value.map((item) =>
    //       typeof item === "object" && item !== null
    //         ? createSnapshot(item)
    //         : item,
    //     );
    //   } else if (["string", "number", "boolean"].includes(typeof value)) {
    //     cleaned[key] = value;
    //   }
    //   // Skip functions, DOM elements, circular references, etc.
    // }
  }

  // ---- State (Runes) ----
  const cleanInitial = pureDataDeepClone(initial ?? ({} as FormData<T>));

  const formState = $state({
    data: pureDataDeepClone(cleanInitial) as FormData<T>,
    snapshot: pureDataDeepClone(cleanInitial) as FormData<T>, // for dirty check
    errors: {} as Errors,
    touched: new Set<string>(),
    submitting: false,
    validating: false,
  });

  // const data = $state<FormData<T>>(pureDataDeepClone(cleanInitial) as any);
  // const snapshot = $state<FormData<T>>(pureDataDeepClone(cleanInitial) as any); // for dirty check
  // const errors = $state<Errors>({});
  // const touched = $state<Set<string>>(new Set());
  // let submitting = $state(false);
  // let validating = $state(false);

  let formEl: HTMLFormElement;

  const headerProps = $derived.by(
    (): HeaderProps<T> => ({
      data: formState.data,
      dirty: isDirty(),
    }),
  );

  const fieldsProps = $derived.by(
    (): FieldsProps<T> => ({
      data: formState.data,
      set: handleInput,
      get,
      getS,
      errors: formState.errors,
      touched: formState.touched,
      markTouched,
      validate: runValidate,
    }),
  );
  // ---- Type-safe Actions Props ----
  const actionsProps = $derived.by(
    (): ActionsProps => ({
      submitAction: doSubmit,
      cancel: () => doCancel("button"),
      submitting: formState.submitting,
      valid: Object.keys(formState.errors).length === 0,
      dirty: isDirty(),
      disabled,
    }),
  );

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
    log.info("FORM_MOUNTED", {
      entity,
      autoValidate,
      cleanInitial,
      data: formState.data,
      snapshot: formState.snapshot,
    });
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

  // Not needed currently:
  // function setS<K extends keyof FormData<T>>(key: K, value: T[K]) {
  //   // naive dotted-path setter (sufficient for typical forms)
  //   try {
  //     pathUtils.set(data, key, value);
  //   } catch (e) {
  //     log.error(
  //       { component: "FormShell", entity, key, error: coerceMessage(e) },
  //       "set failed",
  //     );
  //   }
  // }

  function internalSet<P extends NonEmptyPath<FormData<T>>>(
    path: readonly [...P],
    value: PathValue<FormData<T>, P>,
  ) {
    try {
      pathUtils.set<FormData<T>, P>(formState.data, path, value);
    } catch (e) {
      log.error(
        { component: "FormShell", entity, path, error: coerceMessage(e) },
        "set failed",
      );
    }
  }

  function get<P extends NonEmptyPath<FormData<T>>>(
    path: readonly [...P],
  ): PathValue<FormData<T>, P> | undefined {
    try {
      const res = pathUtils.get(formState.data, path);
      return res;
    } catch (e) {
      log.error("get failed", {
        component: "FormShell",
        entity,
        path: path.join("."),
        error: coerceMessage(e),
      });
      return undefined;
    }
  }

  function getS<K extends keyof FormData<T>>(
    key: K,
  ): FormData<T>[K] | undefined {
    try {
      const res = pathUtils.get(formState.data, key);
      return res;
    } catch (e) {
      log.error("get failed", {
        component: "FormShell",
        entity,
        key,
        error: coerceMessage(e),
      });
      return undefined;
    }
  }

  // function get(path: string): any {
  //   try {
  //     const parts = path.split(".");
  //     let cur: any = data;
  //     for (const k of parts) {
  //       if (cur == null) return undefined;
  //       cur = cur[k];
  //     }
  //     return cur;
  //   } catch (e) {
  //     log.error(
  //       { component: "FormShell", entity, path, error: coerceMessage(e) },
  //       "get failed",
  //     );
  //     return undefined;
  //   }
  // }

  function isDirty(): boolean {
    try {
      // Use safe comparison for dirty checking
      const currentSnapshot = pureDataDeepClone(formState.data);
      const isDirty =
        JSON.stringify(currentSnapshot) !== JSON.stringify(formState.snapshot);
      return isDirty;
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
      for (const k in formState.errors) delete formState.errors[k];
      return;
    }
    for (const p of paths) delete formState.errors[p];
  }

  function setFieldErrors(path: string, msgs: string[]) {
    formState.errors[path] = msgs;
  }

  async function runValidate(path?: string): Promise<boolean> {
    if (!validate) return true;
    formState.validating = true;
    try {
      const res = await validate(formState.data);
      if (res?.errors) {
        if (path) {
          const msgs = res.errors[path] ?? [];
          clearErrors([path]);
          if (msgs.length) setFieldErrors(path, msgs);
        } else {
          for (const k in formState.errors) delete formState.errors[k];
          formState.errors = res.errors;
        }
      } else {
        for (const k in formState.errors) delete formState.errors[k];
      }
      return !!res?.valid;
    } catch (e) {
      log.warn(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "validate threw",
      );
      return true; // fail-open on validator errors
    } finally {
      formState.validating = false;
    }
  }

  function markTouched(path: string) {
    formState.touched.add(path);
    if (autoValidate === "blur") {
      // run validation for this field only; ignore result
      void runValidate(path);
    }
  }

  // ---- Orchestration ----
  async function doSubmit(): Promise<void> {
    log.debug(`(FormShell) doSubmit called`, { entity });
    if (disabled || formState.submitting) return;
    formState.submitting = true;

    if (autoValidate === "submit" || autoValidate === "change") {
      const ok = await runValidate();
      if (!ok) {
        formState.submitting = false;
        try {
          onSubmitError?.({
            data: pureDataDeepClone(formState.data),
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
      const pureDataClone = pureDataDeepClone(formState.data);

      // Inform parent. Parent MUST NOT modify the clone!
      const result = await submitCbk(pureDataClone);

      // Svelte handles reactivity!
      formState.snapshot = pureDataClone as FormData<T>;

      try {
        // Inform parent via callback prop. Parent MUST NOT modify the clone!
        onSubmitted?.({ data: pureDataClone, result });
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
        onSubmitError?.({ data: pureDataDeepClone(formState.data), error: e });
      } catch (e) {
        log.error(
          { component: "FormShell", entity, error: coerceMessage(e) },
          "onSubmitError threw",
        );
      }
    } finally {
      formState.submitting = false;
    }
  }

  function doCancel(reason?: string) {
    log.debug(`Cancelled - ${reason}`);
    try {
      onCancel?.(pureDataDeepClone(formState.data));
    } catch (e) {
      log.warn(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "onCancel threw",
      );
    } finally {
      const detail: { data: FormData<T>; reason?: string } = {
        data: pureDataDeepClone(formState.data) as FormData<T>,
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

  function handleInput<P extends NonEmptyPath<FormData<T>>>(
    path: readonly [...P],
    value: PathValue<T, P>,
  ): void {
    internalSet(path, value);

    try {
      onChanged?.({ data: pureDataDeepClone(formState.data), dirty: isDirty() });
    } catch (e) {
      log.error(
        { component: "FormShell", entity, error: coerceMessage(e) },
        "onChanged threw",
      );
    }

    if (autoValidate === "change") {
      void runValidate(path.join("."));
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
  aria-busy={formState.submitting || formState.validating}
>
  <!-- Header area -->
  <div class="pc-grid__toolbar">
    {#if header}
      {@render header(headerProps)}
    {:else}
      <!-- Default header (can be overridden) -->
      <strong>{entity}</strong>
      {#if isDirty()}<span class="pc-grid__badge">unsaved</span>{/if}
    {/if}
  </div>

  <!-- Error summary (polite) -->
  {#if Object.keys(formState.errors).length > 0}
    <div class="pc-grid__empty" aria-live="polite">
      <!-- Compact summary of first messages per field -->
      {#each Object.entries(formState.errors) as [path, msgs]}
        <div><strong>{path}</strong>: {msgs[0]}</div>
      {/each}
    </div>
  {/if}

  <!-- Fields region -->
  <div class="pc-grid__scroller" style="padding: 0.5rem 0.75rem;">
    {#if fields}
      {@render fields(fieldsProps)}
    {:else}
      <em style="color: var(--pc-grid-muted);">No fields snippet provided</em>
    {/if}
  </div>

  <!-- Footer / actions -->
  <div class="pc-grid__toolbar" style="justify-content: end; gap: .5rem;">
    {#if actions}
      {@render actions(actionsProps)}
    {:else}
      <button
        class="pc-grid__btn"
        type="button"
        onclick={() => doCancel("button")}
        disabled={formState.submitting || disabled}
      >
        Cancel
      </button>
      <button
        class="pc-grid__btn pc-grid__btn--danger"
        type="submit"
        disabled={formState.submitting || disabled}
        aria-busy={formState.submitting}
      >
        {#if formState.submitting}<span class="pc-grid__spinner" aria-hidden="true"
          ></span>{/if}
        Save
      </button>
    {/if}
  </div>

  {#if footer}
    {@render footer({ data: formState.data })}
  {/if}
</form>
