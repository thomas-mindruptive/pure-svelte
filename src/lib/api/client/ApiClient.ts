// src/lib/api/client/ApiClient.ts

import { log } from '$lib/utils/logger';
import type { LoadEvent } from '@sveltejs/kit';

// Import types and constants from common.ts
import {
	ApiError,
	type ApiRequestOptions,
} from './common';
import type { ApiSuccessResponse, ApiErrorResponse } from '../api.types';
import { HTTP_STATUS } from '../api.types';

type SvelteKitFetch = typeof fetch;

/**
 * A class that encapsulates the context of a SvelteKit server request 
 * (especially `event.fetch`) to make type-safe and SSR-compatible API calls.
 */
export class ApiClient {
	private fetcher: SvelteKitFetch;

	/**
	 * Creates a new instance of the ApiClient.
	 * @param eventOrFetch The SvelteKit `LoadEvent` or its `fetch` function.
	 *                     This ensures that server-side calls use the correct, context-aware fetch.
	 */
	constructor(eventOrFetch: LoadEvent | SvelteKitFetch) {
		this.fetcher = 'fetch' in eventOrFetch ? eventOrFetch.fetch : eventOrFetch;
	}

	/**
	 * Standard fetch wrapper for API calls that are expected to succeed.
	 * It directly returns the `data` payload from a successful (2xx) response.
	 * For any non-2xx server response or network failure, it throws a structured `ApiError`.
	 */
	async apiFetch<TSuccessData extends Record<string, unknown>>(
		url: string,
		init: RequestInit = {},
		options: ApiRequestOptions = {}
	): Promise<TSuccessData> {
		const { timeout = 30000, context = 'API Request' } = options;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			log.info(`API Request: ${context}-${url}`, { url, method: init.method || 'GET' });

			const response = await this.fetcher(url, {
				...init,
				headers: { 'content-type': 'application/json', ...init.headers },
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			log.info(`ApiClient.fetch - ${url}, response`, { status: response.status, ok: response.ok, statusText: response.statusText });

			// STABILE PARSING-LOGIK
			const responseText = await response.text();
			let parsedData: unknown;
			try {
				parsedData = responseText ? JSON.parse(responseText) : null;
			} catch {
				log.error("ApiClient: Failed to parse JSON. Server Response Text:", responseText);
				throw new ApiError('Invalid JSON response from server', response.status);
			}

			if (response.ok) {
				return (parsedData as ApiSuccessResponse<TSuccessData>).data;
			} else {
				// Bei Fehlern den gesamten geparsten Body als Detail an den ApiError anhängen.
				const errorData = parsedData as ApiErrorResponse;
				const err = new ApiError(
					errorData.message || `${response.status} ${response.statusText}`,
					response.status,
					errorData.errors,
					errorData
				);
				throw err;
			}

		} catch (error) {
			// ROBUSTES CATCH-HANDLING
			if (error instanceof ApiError) {
				throw error; // Wichtige ApiError-Details weiterreichen, nicht neu verpacken.
			}
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error(`API Fetch failed: ${context}`, { url, error: errorMessage });
			throw new ApiError(`Network or parsing error: ${errorMessage}`, 0); // Andere Fehler standardisieren.
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * A specialized fetch wrapper for operations that can return a union of success
	 * and expected, structured error types (e.g., DeleteApiResponse).
	 * This function returns the entire response object for type guarding, instead of throwing on handled errors like 409.
	 */
	async apiFetchUnion<TUnion>(
		url: string,
		init: RequestInit = {},
		options: ApiRequestOptions = {}
	): Promise<TUnion> {
		const { timeout = 30000, context = 'API Union Request' } = options;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			log.info(`API Union Request: ${context}-${url}`, { url, method: init.method || 'GET' });

			const response = await this.fetcher(url, {
				...init,
				headers: { 'content-type': 'application/json', ...init.headers },
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			log.info(`ApiClient.fetchUnion - ${url}, response`, { status: response.status, ok: response.ok, statusText: response.statusText });

			// STABILE PARSING-LOGIK (identisch zu apiFetch)
			const responseText = await response.text();
			let parsedData: unknown;
			try {
				parsedData = responseText ? JSON.parse(responseText) : null;
			} catch {
				log.error("ApiClient(Union): Failed to parse JSON. Server Response Text:", responseText);
				throw new ApiError('Invalid JSON response from server', response.status);
			}

			// KORREKTE LOGIK: Bei Erfolg ODER erwarteten Fehlern das Ergebnis ZURÜCKGEBEN.
			if (response.ok || response.status === HTTP_STATUS.CONFLICT || response.status === HTTP_STATUS.BAD_REQUEST) {
				return parsedData as TUnion;
			}

			// Nur bei UNERWARTETEN Fehlern einen ApiError WERFEN.
			const errorData = parsedData as ApiErrorResponse;
			throw new ApiError(
				errorData.message || `Request failed with status ${response.status}`,
				response.status,
				errorData.errors,
				errorData
			);

		} catch (error) {
			// ROBUSTES CATCH-HANDLING (identisch zu apiFetch)
			if (error instanceof ApiError) {
				throw error; // Wichtige ApiError-Details weiterreichen.
			}
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error(`API Union Fetch failed: ${context}`, { url, error: errorMessage });
			throw new ApiError(`Network or parsing error: ${errorMessage}`, 0); // Andere Fehler standardisieren.
		} finally {
			clearTimeout(timeoutId);
		}
	}
}