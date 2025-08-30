// src/lib/api/client/ApiClient.ts

import { log } from '$lib/utils/logger';
import type { LoadEvent } from '@sveltejs/kit';

// Import types and constants from common.ts
import {
	ApiError,
	type ApiRequestOptions,
} from './common';
import { type ApiSuccessResponse } from '../types';

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
	 *
	 * @template TSuccessData The expected type of the `data` property in a successful response.
	 * @param url The API endpoint URL.
	 * @param init Standard `RequestInit` options (e.g., method, body).
	 * @param options Custom options for the API request, like `context`.
	 * @returns A promise that resolves with the `data` object from the successful API response.
	 * @throws {ApiError} If the fetch fails or the server returns a non-2xx status.
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
			log.info(`API Request: ${context}`, { url, method: init.method || 'GET' });

			const response = await this.fetcher(url, {
				...init,
				headers: { 'content-type': 'application/json', ...init.headers },
				signal: controller.signal
			});
			// NOTE: NEVER log the response object itself => Tries to read the stream => 500 error!!!!!!!!!!!!!!!
			log.info('ApiClient.fetch response', { status: response.status, ok: response.ok, statusText: response.statusText });
			clearTimeout(timeoutId);

			if (response.ok) {
				const responseText = await response.text();
				try {
					const data: unknown = JSON.parse(responseText);
					return (data as ApiSuccessResponse<TSuccessData>).data;
				} catch {
					log.error("ApiClient: Failed to parse JSON. Server Response Text:", responseText);
					throw new ApiError('Invalid JSON response from server', response.status);
				}
			} else {
				const text = await response.text().catch(() => '');
				const trimmed = text.replace(/^\uFEFF/, '').trim();
				let details: unknown = text;
				try { details = text ? JSON.parse(trimmed) : text; } catch {
					log.info('response != OK => try to parse response.text => Failed to parse error response JSON:', text);
				}
				const err = new ApiError(
					`${response.status} ${response.statusText}`,
					response.status
				);
				(err as any).response = {
					status: response.status, statusText: response.statusText, details
				};
				throw err;

			}

		} catch (error) {
			if (error instanceof ApiError) throw error;
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error(`API Fetch failed: ${context}`, { url, error: errorMessage });
			throw new ApiError(`Network error: ${errorMessage}`, 0);
		} finally {
			clearTimeout(timeoutId);
		}
	}


	/**
	 * A specialized fetch wrapper for operations that can return a union of success
	 * and expected, structured error types (e.g., DeleteApiResponse).
	 * This function returns the entire response object for type guarding, instead of throwing on handled errors like 409.
	 *
	 * @template TUnion The expected union type of the API response.
	 * @param url The API endpoint URL.
	 * @param init Standard `RequestInit` options.
	 * @param options Custom options for the API request.
	 * @returns A promise that resolves with the full API response object (success or handled error).
	 * @throws {ApiError} Only for unexpected server errors (e.g., 500) or network failures.
	 */
	async apiFetchUnion<TUnion>(
		url: string,
		init: RequestInit = {},
		options: ApiRequestOptions = {}
	): Promise<TUnion> {
		return this.apiFetch(url, init, options) as Promise<TUnion>;


		// const { timeout = 30000, context = 'API Request' } = options;
		// const controller = new AbortController();
		// const timeoutId = setTimeout(() => controller.abort(), timeout);



		// try {
		// 	log.info(`API Union Request: ${context}`, { url, method: init.method || 'GET' });

		// 	const response = await this.fetcher(url, {
		// 		...init,
		// 		headers: { 'content-type': 'application/json', ...init.headers },
		// 		signal: controller.signal
		// 	});
		// 	log.info('ApiClient response', response.status, response.statusText, response.ok);
		// 	clearTimeout(timeoutId);

		// 	if (!response.ok) {
		// 		const text = await response.text().catch(() => '');
		// 		let details: unknown = text;
		// 		try { details = text ? JSON.parse(text) : text; } catch {
		// 			log.info('Failed to parse error response JSON:', text);
		// 		}
		// 		const err = new Error(`${response.status} ${response.statusText}`);
		// 		(err as any).response = {
		// 			status: response.status, statusText: response.statusText, details
		// 		};
		// 		throw err;
		// 	}

		// 	const data: unknown = await response
		// 		.json()
		// 		.catch(() => ({
		// 			message: 'Invalid JSON response from server **'
		// 		}));

		// 	if (
		// 		response.ok ||
		// 		response.status === HTTP_STATUS.CONFLICT ||
		// 		response.status === HTTP_STATUS.BAD_REQUEST
		// 	) {
		// 		return data as TUnion;
		// 	}

		// 	const errorData = data as ApiErrorResponse;
		// 	throw new ApiError(
		// 		errorData.message || `Request failed with status ${response.status}`,
		// 		response.status,
		// 		errorData.errors,
		// 		errorData
		// 	);
		// } catch (error) {
		// 	clearTimeout(timeoutId);
		// 	if (error instanceof ApiError) throw error;
		// 	const errorMessage = error instanceof Error ? error.message : String(error);
		// 	log.error(`API Union Fetch failed: ${context}`, { url, error: errorMessage });
		// 	throw new ApiError(`Network error: ${errorMessage}`, 0);
		// }
	}
}