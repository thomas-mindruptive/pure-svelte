// === TYPE GUARDS ==============================================================================

import type { ValidationErrorTree } from "$lib/components/validation/validation.types";

/**
 * Type guard for SvelteKit error with App.Error body
 */
export function isAppError(error: unknown): error is { body: App.Error } {
  return (
    typeof error === "object" &&
    error !== null &&
    "body" in error &&
    typeof (error as any).body === "object" &&
    (error as any).body !== null &&
    "message" in (error as any).body &&
    typeof (error as any).body.message === "string"
  );
}

/**
 * Convert svelte app error to ValidationErrorTree.
 * @param err
 */
export function convertAppErrorToValTree(err: { body: App.Error }) {
  const body = err.body ?? {};
  const errorTree: ValidationErrorTree = {
    errors: [body.message ?? "Unknown error"],
  };

  if (body.code !== undefined) {
    errorTree.code = [body.code];
  }

  if (body.suggestion !== undefined) {
    errorTree.suggestion = [body.suggestion];
  }

  if (body.details !== undefined && Array.isArray(body.details)) {
    errorTree.details = (body.details as any[]).map((issue: any) =>
      issue?.path && issue?.message ? `${issue.path.join(".")}: ${issue.message}` : String(issue),
    );
  }

  return errorTree;
}

/**
 * Safely converts any error to a readable string message
 */
export function coerceErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;

  if (typeof e === "object" && e !== null && "body" in e) {
    const err = e as { body?: App.Error };
    if (err.body?.message) return err.body.message;
  }

  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
