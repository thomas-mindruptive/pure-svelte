export type Errors<T> = Partial<Record<keyof T, string[]>>;
export type ValidateResult<T> = { valid: boolean; errors?: Errors<T> };

export type FormData<T> = T;

export type ValidateCallback<T = any> = (
    data: T,
) => ValidateResult<T> | Promise<ValidateResult<T>>;

export type SubmitCallback<T = any> = (data: T) => unknown | Promise<unknown>;
export type CancelCallback<T = any> = (data: T) => void | Promise<void>;

export type SubmittedCallback<T = any> = (p: {
    data: T;
    result: unknown;
}) => void;

export type CancelledCallback<T = any> = (p: {
    data: T;
    reason?: string;
}) => void;

export type SubmitErrorCallback<T = any> = (info: {
    data: T;
    error: unknown;
}) => void;

export type ChangedCallback<T = any> = (p: { 
    data: T; 
    dirty: boolean 
}) => void;