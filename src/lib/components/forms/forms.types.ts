
export type FormData<T> = { [K in keyof T]: T[K] };

export type Errors = Record<string, string[]>;
export type ValidateResult = { valid: boolean; errors?: Errors };

export type ValidateFn = (
    data: FormData,
) => ValidateResult | Promise<ValidateResult>;
export type SubmitFn = (data: FormData) => unknown | Promise<unknown>;
export type CancelFn = (data: FormData) => void | Promise<void>;

export type SubmittedCallback = (p: {
    data: FormData;
    result: unknown;
}) => void;
export type CancelledCallback = (p: {
    data: FormData;
    reason?: string;
}) => void;
export type SubmitErrorCallback = (info: {
    data: Record<string, any>;
    error: unknown;
}) => void;
export type ChangedCallback = (p: { data: FormData; dirty: boolean }) => void;