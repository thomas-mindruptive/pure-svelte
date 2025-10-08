<script
  lang="ts"
  generics="T extends Record<string, any> = Record<string, any>"
>
  // ========================================================================
  // IMPORTS
  // ========================================================================

  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { cloneDeep } from "lodash-es";

  // Utils
  import { log } from "$lib/utils/logger";
  import * as pathUtils from "$lib/utils/pathUtils";
  import type { NonEmptyPath, PathValue } from "$lib/utils/pathUtils";
  import { assertDefined } from "$lib/utils/assertions";

  // Types
  import type {
    Errors,
    ValidateCallback,
    SubmitCallback,
    CancelCallback,
    SubmittedCallback,
    SubmitErrorCallback,
    CancelledCallback,
    ChangedCallback,
    FormData,
    ValidateResult,
  } from "./forms.types";
  import { coerceErrorMessage } from "$lib/utils/errorUtils";

  // ========================================================================
  // TYPE DEFINITIONS
  // ========================================================================

  /**
   * Props passed to the header snippet
   */
  interface HeaderProps<T> {
    data: FormData<T>;
    dirty: boolean;
  }

  /**
   * Props passed to the fields snippet - includes form data and manipulation methods
   */
  export interface FieldsProps<T> {
    data: FormData<T>;

    // Path-based setters/getters for nested data
    set<P extends NonEmptyPath<FormData<T>>>(path: readonly [...P], value: PathValue<T, P>): void;

    get<P extends NonEmptyPath<FormData<T>>>(path: readonly [...P]): PathValue<FormData<T>, P> | undefined;

    // Simple key-based getter for top-level properties
    getS<K extends keyof FormData<T>>(key: K): FormData<T>[K] | undefined;

    // Form state
    errors: Errors;
    touched: Set<string>;
    markTouched: (path: string) => void;
    validate: (path?: string) => Promise<boolean>;
  }

  /**
   * Props passed to the actions snippet - form controls and state
   */
  interface ActionsProps {
    submitAction: () => Promise<void>;
    cancel: () => void;
    submitting: boolean;
    valid: boolean;
    dirty: boolean;
    disabled: boolean;
  }

  /**
   * Props passed to the footer snippet
   */
  interface FooterProps<T> {
    data: FormData<T>;
  }

  /**
   * Main component props interface
   */
  interface FormShellProps<T> {
    // Data and validation
    initial?: FormData<T> | undefined | null;
    validate?: ValidateCallback<T>;
    submitCbk: SubmitCallback<T>;
    onCancel?: CancelCallback<T>;

    // Configuration
    autoValidate?: "submit" | "blur" | "change";
    disabled?: boolean;
    formId?: string;
    entity?: string;

    // UI Snippets
    header?: Snippet<[HeaderProps<T>]>;
    fields?: Snippet<[FieldsProps<T>]>;
    actions?: Snippet<[ActionsProps]>;
    footer?: Snippet<[FooterProps<T>]>;

    // Event callbacks
    onSubmitted?: SubmittedCallback<T>;
    onSubmitError?: SubmitErrorCallback<T>;
    onCancelled?: CancelledCallback<T>;
    onChanged?: ChangedCallback<T>;
  }

  // ========================================================================
  // COMPONENT PROPS
  // ========================================================================

  // Deconstruct props.
  const {
    // Core data and lifecycle
    initial = {} as FormData<T>,
    validate,
    submitCbk,
    onCancel,

    // Form behavior configuration
    autoValidate = "submit" as "submit" | "blur" | "change",
    disabled = false,
    formId = "form",
    entity = "form", // Used for logging context

    // Snippet slots for customizable UI sections
    header,
    fields,
    actions,
    footer,

    // Component callback props (Svelte 5 recommended pattern)
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged,
  }: FormShellProps<T> = $props();

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  /**
   * Creates a safe deep clone for dirty checking and snapshots
   * Strips potentially problematic properties that can't be cloned
   */
  function pureDataDeepClone(data: any): FormData<T> {
    assertDefined(data, "pureDataDeepClone");
    return cloneDeep(data) as FormData<T>;
  }

  /**
   * Safely converts any error to a readable string message
   */
  function coerceMessage(e: unknown): string {
    return coerceErrorMessage(e);
  }

  // ========================================================================
  // STATE INITIALIZATION
  // ========================================================================

  // Create clean initial data for consistent state management
  const cleanInitial = pureDataDeepClone(initial ?? ({} as FormData<T>));

  /**
   * Centralized form state using Svelte 5 runes
   * All form data, validation, and UI state in one reactive container
   */
  const formState = $state({
    data: pureDataDeepClone(cleanInitial), // Current form data
    snapshot: pureDataDeepClone(cleanInitial), // Clean snapshot for dirty checking
    errors: {} as Errors, // Field validation errors
    touched: new Set<string>(), // Fields that have been interacted with
    submitting: false, // Form submission in progress
    validating: false, // Validation in progress
  });

  // Form DOM element reference for keyboard event handling
  let formEl: HTMLFormElement;

  // This effect runs after the component has been mounted to the DOM,
  // ensuring that `formEl` is available.
  // It will run once when the form is first created.
  $effect(() => {
    log.debug(`Component has mounted. Running initial form validation.`);

    // We call `runValidate()` to perform the initial check of the data.
    // The `void` operator is used to explicitly signal that we are not
    // awaiting the promise, as we just want to trigger the validation side effects
    // (populating `formState.errors` and setting the CSS state).
    void runValidate();
  });

  // ========================================================================
  // CORE DATA MANIPULATION
  // ========================================================================

  /**
   * Handle input changes with validation and change notifications
   */
  export function set<P extends NonEmptyPath<FormData<T>>>(path: readonly [...P], value: PathValue<T, P>): void {
    internalSet(path, value);

    // Notify parent of data change
    try {
      console.log(`Before calling parent's onChanged, vaule:`, value);
      log.detdebug(`Before calling parent's onChanged, value:`, value);
      onChanged?.({
        data: pureDataDeepClone(formState.data),
        dirty: isDirty(),
      });
    } catch (e) {
      log.error("onChanged threw error", {
        component: "FormShell",
        entity,
        error: coerceMessage(e),
      });
    }

    // Auto-validate on change if configured
    if (autoValidate === "change") {
      void runValidate();
    }
  }

  /**
   * Internal setter for nested path-based updates
   */
  function internalSet<P extends NonEmptyPath<FormData<T>>>(path: readonly [...P], value: PathValue<FormData<T>, P>) {
    log.detdebug(`path: ${path}, value: `, value);
    try {
      pathUtils.set<FormData<T>, P>(formState.data, path, value);
    } catch (e) {
      log.error({ component: "FormShell", entity, path, error: coerceMessage(e) }, "set failed");
    }
  }

  /**
   * Get value at nested path
   */
  export function get<P extends NonEmptyPath<FormData<T>>>(path: readonly [...P]): PathValue<FormData<T>, P> | undefined {
    try {
      return pathUtils.get(formState.data, path);
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

  /**
   * Get value by simple key (top-level properties)
   */
  export function getS<K extends keyof FormData<T>>(key: K): FormData<T>[K] | undefined {
    try {
      return pathUtils.get(formState.data, key);
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

  /**
   * Check if form data has been modified from initial state
   */
  function isDirty(): boolean {
    try {
      const currentSnapshot = pureDataDeepClone(formState.data);
      return JSON.stringify(currentSnapshot) !== JSON.stringify(formState.snapshot);
    } catch {
      log.warn({ component: "FormShell", entity }, "isDirty comparison failed, assuming dirty");
      return true; // Fail-safe: assume dirty if comparison fails
    }
  }

  // ========================================================================
  // VALIDATION FUNCTIONS
  // ========================================================================

  /**
   * Clear validation errors for specific paths or all errors
   */
  function clearErrors(paths?: string[]) {
    if (!paths || paths.length === 0) {
      for (const k in formState.errors) delete formState.errors[k];
      return;
    }
    for (const p of paths) delete formState.errors[p];
  }

  // /**
  //  * Set validation error messages for a specific field path
  //  */
  // function setFieldErrors(path: string, msgs: string[]) {
  //   formState.errors[path] = msgs;
  // }

  // In src/lib/components/forms/FormShell.svelte

  /**
   * Runs the complete, hybrid validation process.
   * This function orchestrates custom validation logic with the browser's
   * native validation engine, and ensures the Svelte error state is synchronized
   * for UI components like the error summary block.
   *
   * @returns A promise that resolves to true if the form is valid, otherwise false.
   */
  async function runValidate(): Promise<boolean> {
    log.debug(`Running validation to update DOM and Svelte state.`, { entity });

    // --- Step 1: Execute the parent's custom validation logic ---
    // This provides the business rule violations.
    let customResult: ValidateResult = { valid: true, errors: {} };
    if (validate) {
      try {
        customResult = await validate(formState.data);
      } catch (e) {
        log.error({ component: "FormShell", entity, error: coerceMessage(e) }, "The 'validate' prop threw an unhandled error.");
        // In case of a crash in the validation function, we assume it's valid to not block the UI.
        return true;
      }
    }
    const customErrors = customResult.errors || {};
    log.detdebug(`Custom errors after await validate:`, customErrors);

    // --- Step 2: Inject custom errors into the DOM ---
    // This loop informs the browser's validation engine about our custom business rule violations.
    const allElements = Array.from(formEl.elements).filter(
      (el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement,
    );

    for (const element of allElements) {
      const fieldName = element.name || element.id;
      if (fieldName) {
        const customErrorMessage = customErrors[fieldName]?.[0];
        // If a custom error exists, set it. Otherwise, clear any previous custom error.
        // Clearing with "" is crucial for the field to become valid again from a custom perspective.
        element.setCustomValidity(customErrorMessage || "");
      }
    }

    // --- Step 3: Check overall validity and synchronize Svelte state ---
    // The browser is now the single source of truth for the form's validity state.
    const isFormValid = formEl.checkValidity();
    log.detdebug(`After formEl.checkValidity() isFormValid =  ${isFormValid}`);

    // Clear the Svelte error state before repopulating it.
    clearErrors();

    if (!isFormValid) {
      log.detdebug(`Form is invalid => Reading DOM val messages`);
      // If the form is invalid, we read the validation messages from the DOM
      // and populate our reactive `formState.errors` object.
      // This is what makes the error summary block work.
      for (const element of allElements) {
        if (!element.validity.valid) {
          const fieldName = element.name || element.id;
          log.detdebug(`Element ${fieldName} is invalid`);
          if (fieldName) {
            // `validationMessage` will be our custom message if we set one,
            // otherwise it will be the browser's default message (e.g., "Please fill out this field.").
            formState.errors[fieldName] = [element.validationMessage];
          } else {
            formState.errors["general_errors"] = [`No fieldname set for element`];
          }
        }
      }
      log.debug(`HTML/DOM: Form is invalid. All merged errors for UI:`, { entity, errors: {...formState.errors} });
    } else {
      log.detdebug(`Validation passed.`, { entity });
    }

    // Return the final result.
    return isFormValid;
  }

  /**
   * Mark a field as touched (user has interacted with it)
   */
  function markTouched(path: string) {
    formState.touched.add(path);
    if (autoValidate === "blur") {
      // Run validation for this field only when marked as touched
      void runValidate();
    }
  }

  // ========================================================================
  // FORM ORCHESTRATION
  // ========================================================================

  /**
   * Handle form submission with validation and callbacks
   */
  async function doSubmit(): Promise<void> {
    log.debug(`doSubmit called`, { entity });
    if (disabled || formState.submitting) return;

    formState.submitting = true;

    // Pre-submit validation if configured
    if (autoValidate === "submit" || autoValidate === "change") {
      const ok = await runValidate();
      if (!ok) {
        formState.submitting = false;
        try {
          log.warn(`Validation failed. Data: `, formState.data);
          onSubmitError?.({
            data: pureDataDeepClone(formState.data),
            error: new Error("Validation failed before submission."),
          });
        } catch (e) {
          log.error({ component: "FormShell", entity, error: coerceMessage(e) }, "onSubmitError threw");
        }
        return;
      }
    }

    try {
      const pureDataClone = pureDataDeepClone(formState.data);

      // Call parent's submit handler, pass "old" data for information.
      const result = await submitCbk(pureDataClone);

      // Check if the API returned a valid object to update the state with.
      if (result && typeof result === "object") {
        const newObjectClone = pureDataDeepClone(result as T);

        // 1. First, update the internal state to be consistent.
        formState.data = newObjectClone;
        formState.snapshot = newObjectClone; // Update snapshot to reset dirty state.

        // 2. Then, notify the parent component with the new, consistent state.
        onSubmitted?.({ data: newObjectClone, result });
        log.info("FORM_SUBMITTED", { entity, newObjectClone });
      } else {
        // Fallback if API returns no data: just mark the form as clean.
        log.error(`submitCbk did not return a valid object. Should not happen.`, { result });
        formState.snapshot = pureDataClone;
        // Do not call onsubmitted because we are in an invalid state.
      }
    } catch (e) {
      log.error({ component: "FormShell", entity, error: coerceMessage(e) }, "FORM_SUBMIT_FAILED");
      try {
        onSubmitError?.({ data: pureDataDeepClone(formState.data), error: e });
      } catch (e) {
        log.error({ component: "FormShell", entity, error: coerceMessage(e) }, "onSubmitError threw");
      }
    } finally {
      formState.submitting = false;
    }
  }

  /**
   * Handle form cancellation with optional reason
   */
  function doCancel(reason?: string) {
    log.debug(`Cancelled - ${reason}`);

    try {
      onCancel?.(pureDataDeepClone(formState.data));
    } catch (e) {
      log.warn({ component: "FormShell", entity, error: coerceMessage(e) }, "onCancel threw");
    } finally {
      const detail: { data: FormData<T>; reason?: string } = {
        data: pureDataDeepClone(formState.data),
      };
      if (reason !== undefined) detail.reason = reason;

      try {
        onCancelled?.(detail);
      } catch (e) {
        log.error({ component: "FormShell", entity, error: coerceMessage(e) }, "onCancelled threw");
      }
    }
  }

  // ========================================================================
  // DERIVED PROPERTIES
  // ========================================================================

  /**
   * Reactive props for header snippet - includes current data and dirty state
   */
  const headerProps = $derived.by(
    (): HeaderProps<T> => ({
      data: formState.data,
      dirty: isDirty(),
    }),
  );

  /**
   * Reactive props for fields snippet - includes data manipulation methods
   */
  const fieldsProps = $derived.by(
    (): FieldsProps<T> => ({
      data: formState.data,
      set: set,
      get,
      getS,
      errors: formState.errors,
      touched: formState.touched,
      markTouched,
      validate: runValidate,
    }),
  );

  /**
   * Reactive props for actions snippet - form controls and validation state
   */
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

  // ========================================================================
  // LIFECYCLE & EVENT HANDLING
  // ========================================================================

  /**
   * Initialize keyboard shortcuts and logging on component mount
   */
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

  log.debug(`props:`, {
    entity,
    initial,
    autoValidate,
    disabled,
    hasHeader: !!header,
    hasFields: !!fields,
    hasActions: !!actions,
    hasFooter: !!footer,
  });
</script>

<!-- ====================================================================== -->
<!-- TEMPLATE -->
<!-- ====================================================================== -->

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
  <details class="component-debug-boundary">
    <summary>FormShell Debug:</summary>
    <div>
      <pre>{@html JSON.stringify({ initial, disabled, entity, formState_data: formState.data }, null, 4)}</pre>
    </div>
  </details>

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

  <!-- Fields region -->
  <div
    class="pc-grid__scroller"
    style="padding: 0.5rem 0.75rem;"
  >
    {#if fields}
      {@render fields(fieldsProps)}
    {:else}
      <em style="color: var(--pc-grid-muted);">No fields snippet provided</em>
    {/if}
  </div>

  <!-- Error region -->
  {#if Object.keys(formState.errors).length > 0}
    <div
      class="component-info-boundary"
      aria-live="polite"
    >
      <!-- Compact summary of first messages per field -->
      {#each Object.entries(formState.errors) as [path, msgs]}
        <div>
          <strong>{path}</strong>
          : {msgs[0]}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Footer / actions -->
  <div
    class="pc-grid__toolbar"
    style="justify-content: end; gap: .5rem;"
  >
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
        {#if formState.submitting}<span
            class="pc-grid__spinner"
            aria-hidden="true"
          ></span>{/if}
        Save
      </button>
    {/if}
  </div>

  {#if footer}
    {@render footer({ data: formState.data })}
  {/if}
</form>
