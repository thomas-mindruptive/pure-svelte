// src/lib/api/client/common.ts

/**
 * @file Client-Side API Utilities - FINAL ARCHITECTURE
 * @description This file provides the foundational, reusable utilities for all client-side API
 * interactions. It features two distinct, type-safe fetch wrappers that form the core
 * of the client-side data fetching strategy.
 */

import { log } from '$lib/utils/logger';
import { type ApiErrorResponse, type ApiSuccessResponse, type ValidationErrors, HTTP_STATUS, type QueryRequest } from '../types/common';
import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';

/**
 * A custom client-side error class that extends the native Error.
 * It enriches the error with structured information from API responses,
 * such as the HTTP status code and field-specific validation errors.
 */
export class ApiError extends Error {
	constructor(
		public message: string,
		public status: number,
		public errors?: ValidationErrors,
		public response?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/**
 * Defines configuration options for API requests made via the fetch wrappers.
 */
export interface ApiRequestOptions {
	/** The request timeout in milliseconds. Defaults to 30000. */
	timeout?: number;
	/** A string context for improved logging and debugging. */
	context?: string;
}

/**
 * The standard fetch wrapper for API calls that are expected to succeed.
 * It directly returns the `data` payload from a successful (2xx) response.
 * For any non-2xx server response or network failure, it throws a structured `ApiError`.
 *
 * @template TSuccessData The expected type of the `data` property within a successful `ApiSuccessResponse`.
 * @param url The API endpoint URL.
 * @param init Standard `RequestInit` options (e.g., method, body).
 * @param options Custom options for the API request, like `context`.
 * @returns A promise that resolves with the `data` object from the successful API response.
 * @throws {ApiError} If the fetch fails or the server returns a non-2xx status.
 */
export async function apiFetch<TSuccessData extends Record<string, unknown>>(
	url: string,
	init: RequestInit = {},
	options: ApiRequestOptions = {}
): Promise<TSuccessData> {
	const { timeout = 30000, context = 'API Request' } = options;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		log.info(`API Request: ${context}`, { url, method: init.method || 'GET' });

		const response = await fetch(url, {
			...init,
			headers: { 'content-type': 'application/json', ...init.headers },
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		// Attempt to parse JSON, even for errors, to get structured error messages.
		const data: unknown = await response.json().catch(() => ({ message: 'Invalid JSON response from server' }));

		if (response.ok) {
			// On success, return only the nested `data` payload, as defined by the architecture.
			return (data as ApiSuccessResponse<TSuccessData>).data;
		}

		// Any non-ok response is treated as an exception to be thrown.
		const errorData = data as ApiErrorResponse;
		throw new ApiError(
			errorData.message || `Request failed with status ${response.status}`,
			response.status,
			errorData.errors,
			errorData
		);
	} catch (error) {
		clearTimeout(timeoutId);
		// Re-throw known API errors to be caught by the calling function.
		if (error instanceof ApiError) throw error;

		// Wrap unknown errors (network issues, etc.) in a standard ApiError.
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error(`API Fetch failed: ${context}`, { url, error: errorMessage });
		throw new ApiError(`Network error: ${errorMessage}`, 0);
	}
}

/**
 * A specialized fetch wrapper for operations that can return a union of success
 * and expected, structured error types (e.g., DeleteApiResponse which includes DeleteConflictResponse).
 * This function returns the entire response object for type guarding, instead of throwing on handled errors like 409 or 400.
 *
 * @template TUnion The expected union type of the API response (e.g., `DeleteApiResponse<...>` or `AssignmentApiResponse<...>`).
 * @param url The API endpoint URL.
 * @param init Standard `RequestInit` options.
 * @param options Custom options for the API request.
 * @returns A promise that resolves with the full API response object (success or handled error).
 * @throws {ApiError} Only for unexpected server errors (e.g., 500) or network failures.
 */
export async function apiFetchUnion<TUnion>(
	url: string,
	init: RequestInit = {},
	options: ApiRequestOptions = {}
): Promise<TUnion> {
	const { timeout = 30000, context = 'API Request' } = options;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		log.info(`API Union Request: ${context}`, { url, method: init.method || 'GET' });

		const response = await fetch(url, {
			...init,
			headers: { 'content-type': 'application/json', ...init.headers },
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		const data: unknown = await response.json().catch(() => ({ message: 'Invalid JSON response from server' }));

		// For success OR expected, structured errors (like conflict or validation), return the full payload.
		if (response.ok || response.status === HTTP_STATUS.CONFLICT || response.status === HTTP_STATUS.BAD_REQUEST) {
			return data as TUnion;
		}

		// Throw only for unexpected server errors (e.g., 500, 503).
		const errorData = data as ApiErrorResponse;
		throw new ApiError(
			errorData.message || `Request failed with status ${response.status}`,
			response.status,
			errorData.errors,
			errorData
		);
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof ApiError) throw error;
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error(`API Union Fetch failed: ${context}`, { url, error: errorMessage });
		throw new ApiError(`Network error: ${errorMessage}`, 0);
	}
}

/**
 * Creates a JSON string for a standard POST or PUT request body.
 * Use this for simple data payloads that are not queries.
 * @param data The object to serialize.
 * @returns A JSON string representation of the data.
 */
export function createPostBody(data: unknown): string {
	return JSON.stringify(data);
}

/**
 * Creates a JSON string for a Query POST request.
 * This correctly wraps the `QueryPayload` in the standard `QueryRequest`
 * envelope, as expected by the server's query endpoints.
 * @param payload The `QueryPayload` defining the desired query.
 * @returns A JSON string representation of the `QueryRequest`.
 */
export function createQueryBody<T>(payload: QueryPayload<T>): string {
	const request: QueryRequest<T> = { payload };
	return JSON.stringify(request);
}

/**
 * A utility function to safely extract a human-readable error message
 * from various potential error types caught in a try-catch block.
 * @param error The caught error, of type `unknown`.
 * @returns A user-friendly string.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof ApiError) return error.message;
	if (error instanceof Error) return error.message;
	return 'An unexpected error occurred.';
}

/**
 * A generic class to manage loading states for multiple concurrent API operations.
 * This allows the UI to show loading indicators for specific actions (e.g., deleting a specific row)
 * or for any ongoing operation.
 */
export class LoadingState {
	private loadingOperations = new Set<string>();
	private callbacks = new Set<() => void>();

	/** Marks an operation as started. */
	start(operationId: string) { this.loadingOperations.add(operationId); this.notifyCallbacks(); }
	/** Marks an operation as finished. */
	finish(operationId: string) { this.loadingOperations.delete(operationId); this.notifyCallbacks(); }
	/** Returns true if any operation is currently in progress. */
	get isLoading(): boolean { return this.loadingOperations.size > 0; }
	/** Returns true if a specific operation is in progress. */
	isOperationLoading(operationId: string): boolean { return this.loadingOperations.has(operationId); }
	/** Subscribes to changes in the loading state. Returns an unsubscribe function. */
	subscribe(callback: () => void): () => void {
		this.callbacks.add(callback);
		return () => this.callbacks.delete(callback);
	}
	private notifyCallbacks() { this.callbacks.forEach((cb) => cb()); }
}