// Vereinfachte FormData (oder einfach T direkt verwenden)
export type FormData<T> = T;

export type Errors = Record<string, string[]>;
export type ValidateResult = { valid: boolean; errors?: Errors };

// Generic Callback Types
export type ValidateFn<T = any> = (
    data: FormData<T>,
) => ValidateResult | Promise<ValidateResult>;

export type SubmitFn<T = any> = (data: FormData<T>) => unknown | Promise<unknown>;
export type CancelFn<T = any> = (data: FormData<T>) => void | Promise<void>;

export type SubmittedCallback<T = any> = (p: {
    data: FormData<T>;
    result: unknown;
}) => void;

export type CancelledCallback<T = any> = (p: {
    data: FormData<T>;
    reason?: string;
}) => void;

export type SubmitErrorCallback<T = any> = (info: {
    data: FormData<T>;
    error: unknown;
}) => void;

export type ChangedCallback<T = any> = (p: { 
    data: FormData<T>; 
    dirty: boolean 
}) => void;