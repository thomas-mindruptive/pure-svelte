// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;         // Required by SvelteKit
			code?: string | undefined;           // e.g., "VALIDATION_ERROR", "NOT_FOUND"
			details?: unknown | undefined;       // Validation issues or additional context
			suggestion?: string;     // User-friendly suggestion for fixing
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
