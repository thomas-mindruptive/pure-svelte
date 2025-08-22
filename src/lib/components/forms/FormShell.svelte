<script lang="ts">
  // FormShell (Svelte 5 + Runes)
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
  // Accessibility:
  // - No onkeydown on <form> (avoids a11y warning). Keyboard shortcuts are bound programmatically.
  // - Error summary has aria-live="polite".

  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { log } from '$lib/utils/logger';

  // Optional typing for DOM CustomEvents (kept for consumers who listen to events)
  export interface $$Events {
    submitted:   CustomEvent<{ data: Record<string, any>; result: unknown }>;
    submitError: CustomEvent<{ data: Record<string, any>; error: unknown }>;
    cancelled:   CustomEvent<{ data: Record<string, any>; reason?: string }>;
    changed:     CustomEvent<{ data: Record<string, any>; dirty: boolean }>;
  }

  type FormData = Record<string, any>;
  export type Errors = Record<string, string[]>;
  export type ValidateResult = { valid: boolean; errors?: Errors };

  export type ValidateFn = (data: FormData) => ValidateResult | Promise<ValidateResult>;
  export type SubmitFn   = (data: FormData) => unknown | Promise<unknown>;
  export type CancelFn   = (data: FormData) => void | Promise<void>;

  // Snippet prop types (tuple generic for Svelte 5)
  type HeaderProps  = { data: FormData; dirty: boolean };
  type FieldsProps  = {
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
  type FooterProps  = { data: FormData };

  const {
    // Data & lifecycle
    initial = {} as FormData,
    validate,                 // optional: (data) => { valid, errors? }
    submit,                   // required
    onCancel,                 // optional (simple callback on cancel)
    autoValidate = 'submit' as 'submit' | 'blur' | 'change',
    disabled = false,
    formId = 'form',
    entity = 'form',          // for logging context

    // Snippets (all optional)
    header,
    fields,
    actions,
    footer,

    // Svelte 5 component-callback props (recommended)
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged
  } = $props<{
    initial?: FormData;
    validate?: ValidateFn;
    submit: SubmitFn;
    onCancel?: CancelFn;
    autoValidate?: 'submit' | 'blur' | 'change';
    disabled?: boolean;
    formId?: string;
    entity?: string;

    header?:  Snippet<[HeaderProps]>;
    fields?:  Snippet<[FieldsProps]>;
    actions?: Snippet<[ActionsProps]>;
    footer?:  Snippet<[FooterProps]>;

    // Callback props (component “events” in Svelte 5)
    onSubmitted?: (p: { data: FormData; result: unknown }) => void;
    onSubmitError?: (p: { data: FormData; error: unknown }) => void;
    onCancelled?: (p: { data: FormData; reason?: string }) => void;
    onChanged?: (p: { data: FormData; dirty: boolean }) => void;
  }>();

  // ---- State (Runes) ----
  const data     = $state<FormData>(structuredClone(initial));
  const snapshot = $state<FormData>(structuredClone(initial)); // for dirty check
  const errors   = $state<Errors>({});
  const touched  = $state<Set<string>>(new Set());
  let submitting = $state(false);
  let validating = $state(false);

  let formEl: HTMLFormElement;

  // ---- Keybindings (programmatic to avoid a11y warning) ----
  onMount(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!formEl || !(t && formEl.isConnected && formEl.contains(t))) return;

      // Ctrl/Cmd + Enter → submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void doSubmit();
        return;
      }
      // Esc → cancel
      if (e.key === 'Escape') {
        e.preventDefault();
        doCancel('escape');
      }
    };

    formEl?.addEventListener('keydown', keyHandler);
    log.info({ component: 'FormShell', entity, autoValidate }, 'FORM_MOUNTED');
    return () => formEl?.removeEventListener('keydown', keyHandler);
  });

  // ---- Helpers ----
  function coerceMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    try { return JSON.stringify(e); } catch { return String(e); }
  }

  function set(path: string, value: unknown) {
    // naive dotted-path setter (sufficient for typical forms)
    try {
      const parts = path.split('.');
      let cur: any = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      cur[parts[parts.length - 1]] = value;
    } catch (e) {
      log.error({ component: 'FormShell', entity, path, error: coerceMessage(e) }, 'set failed');
    }
  }

  function get(path: string): any {
    try {
      const parts = path.split('.');
      let cur: any = data;
      for (const k of parts) {
        if (cur == null) return undefined;
        cur = cur[k];
      }
      return cur;
    } catch (e) {
      log.error({ component: 'FormShell', entity, path, error: coerceMessage(e) }, 'get failed');
      return undefined;
    }
  }

  function isDirty(): boolean {
    try { return JSON.stringify(data) !== JSON.stringify(snapshot); }
    catch { return true; } // assume dirty if stringify fails
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
      log.warn({ component: 'FormShell', entity, error: coerceMessage(e) }, 'validate threw');
      return true; // fail-open on validator errors
    } finally {
      validating = false;
    }
  }

  function markTouched(path: string) {
    touched.add(path);
    if (autoValidate === 'blur') {
      // run validation for this field only; ignore result
      void runValidate(path);
    }
  }

  // ---- Emission helpers: callback props first, then optional DOM events ----
  function emitSubmitted(detail: { data: FormData; result: unknown }) {
    try { onSubmitted?.(detail); } catch (e) {
      log.error({ component: 'FormShell', entity, error: coerceMessage(e) }, 'onSubmitted threw');
    }
    try { formEl?.dispatchEvent(new CustomEvent('submitted', { detail })); } catch {}
  }
  function emitSubmitError(detail: { data: FormData; error: unknown }) {
    try { onSubmitError?.(detail); } catch (e) {
      log.error({ component: 'FormShell', entity, error: coerceMessage(e) }, 'onSubmitError threw');
    }
    try { formEl?.dispatchEvent(new CustomEvent('submitError', { detail })); } catch {}
  }
  function emitCancelled(detail: { data: FormData; reason?: string }) {
    try { onCancelled?.(detail); } catch (e) {
      log.error({ component: 'FormShell', entity, error: coerceMessage(e) }, 'onCancelled threw');
    }
    try { formEl?.dispatchEvent(new CustomEvent('cancelled', { detail })); } catch {}
  }
  function emitChanged(detail: { data: FormData; dirty: boolean }) {
    try { onChanged?.(detail); } catch (e) {
      log.error({ component: 'FormShell', entity, error: coerceMessage(e) }, 'onChanged threw');
    }
    try { formEl?.dispatchEvent(new CustomEvent('changed', { detail })); } catch {}
  }

  // ---- Orchestration ----
  async function doSubmit(): Promise<void> {
    if (disabled || submitting) return;
    submitting = true;

    // validate on submit if needed
    if (autoValidate === 'submit' || autoValidate === 'change') {
      const ok = await runValidate();
      if (!ok) {
        submitting = false;
        emitSubmitError({ data: structuredClone(data), error: { message: 'validation failed' } });
        return;
      }
    }

    try {
      const result = await submit(structuredClone(data));
      Object.assign(snapshot, structuredClone(data)); // update snapshot after success
      emitSubmitted({ data: structuredClone(data), result });
      log.info({ component: 'FormShell', entity }, 'FORM_SUBMITTED');
    } catch (e) {
      log.error({ component: 'FormShell', entity, error: coerceMessage(e) }, 'FORM_SUBMIT_FAILED');
      emitSubmitError({ data: structuredClone(data), error: e });
    } finally {
      submitting = false;
    }
  }

function doCancel(reason?: string) {
  try {
    onCancel?.(structuredClone(data));
  } catch (e) {
    log.warn({ component: 'FormShell', entity, error: coerceMessage(e) }, 'onCancel threw');
  } finally {
    const detail: { data: FormData; reason?: string } = { data: structuredClone(data) };
    if (reason !== undefined) detail.reason = reason;
    emitCancelled(detail);
  }
}

  // auto-validate on change mode
  function handleInput(path: string, value: unknown) {
    set(path, value);
    emitChanged({ data: structuredClone(data), dirty: isDirty() });
    if (autoValidate === 'change') {
      void runValidate(path);
    }
  }
</script>

<form
  id={formId}
  class="pc-form pc-grid pc-grid--comfortable"
  bind:this={formEl}
  onsubmit={(e: Event) => { e.preventDefault(); void doSubmit(); }}
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
        set: handleInput,        /* set(path, value) + fires 'changed' + optional auto-validate */
        get,
        errors,
        touched,
        markTouched,
        validate: runValidate
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
        cancel: () => doCancel('button'),
        submitting,
        valid: Object.keys(errors).length === 0,
        dirty: isDirty(),
        disabled
      })}
    {:else}
      <button class="pc-grid__btn" type="button" onclick={() => doCancel('button')} disabled={submitting || disabled}>
        Cancel
      </button>
      <button class="pc-grid__btn pc-grid__btn--danger" type="submit" disabled={submitting || disabled} aria-busy={submitting}>
        {#if submitting}<span class="pc-grid__spinner" aria-hidden="true"></span>{/if}
        Save
      </button>
    {/if}
  </div>

  {#if footer}
    {@render footer({ data })}
  {/if}
</form>
