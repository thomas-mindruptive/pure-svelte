import type { Snippet } from 'svelte';

// These types are now defined once, in a central place.
export type Errors = Record<string, string[]>;
export type ValidateResult = { valid: boolean; errors?: Errors };

// This generic Props interface defines the component's public API.
export type FormShellProps<T extends Record<string, any>> = {
  initial: T;
  validate?: (data: T) => ValidateResult | Promise<ValidateResult>;
  submit: (data: T) => unknown | Promise<unknown>;
  onCancel?: (data: T) => void | Promise<void>;
  autoValidate?: 'submit' | 'blur' | 'change';
  disabled?: boolean;
  formId?: string;
  entity?: string;

  header?: Snippet<[{ data: T; dirty: boolean }]>;
  fields?: Snippet<[{
    data: T;
    set: <K extends keyof T>(path: K, value: T[K]) => void;
    get: <K extends keyof T>(path: K) => T[K];
    errors: Errors;
    touched: Set<keyof T>;
    markTouched: (path: keyof T) => void;
    validate: (path?: keyof T) => Promise<boolean>;
  }]>;
  actions?: Snippet<[{
    submit: () => Promise<void>;
    cancel: () => void;
    submitting: boolean;
    valid: boolean;
    dirty: boolean;
    disabled: boolean;
  }]>;
  footer?: Snippet<[{ data: T }]>;

  onSubmitted?: (p: { data: T; result: unknown }) => void;
  onSubmitError?: (p: { data: T; error: unknown }) => void;
  onCancelled?: (p: { data: T; reason?: string }) => void;
  onChanged?: (p: { data: T; dirty: boolean }) => void;
};