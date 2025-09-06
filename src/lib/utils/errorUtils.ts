  /**
   * Safely converts any error to a readable string message
   */
  export function coerceErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }