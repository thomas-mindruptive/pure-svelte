// src/lib/api/client/common.ts

/**
 * @file Client-Side API Utilities - FINAL ARCHITECTURE
 * @description This file provides the foundational, reusable utilities for all client-side API
 * interactions. It features two distinct, type-safe fetch wrappers that form the core
 * of the client-side data fetching strategy.
 */

import { type QueryRequest } from '../api.types';
import type { QueryPayload } from '$lib/backendQueries/queryGrammar';
import type { ValidationErrors } from '$lib/components/validation/validation.types';
import { coerceErrorMessage } from '$lib/utils/errorUtils';

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
 * Creates a JSON string for a standard POST or PUT request body.
 * Use this for simple data payloads that are not queries.
 * @param data The object to serialize.
 * @returns A JSON string representation of the data.
 */
export function createJsonBody(data: unknown): string {
	return JSON.stringify(data);
}

/**
 * Creates a JSON string for a Query POST request.
 * This correctly wraps the `QueryPayload` in the standard `QueryRequest`
 * envelope, as expected by the server's query endpoints.
 * @param payload The `QueryPayload` defining the desired query.
 * @returns A JSON string representation of the `QueryRequest`.
 */
export function createJsonAndWrapInPayload<T>(payload: QueryPayload<T>): string {
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
	if (error instanceof ApiError) {
		let message = error.message;
		if (error.errors) {
			message += " - " + JSON.stringify(error.errors, null, 4);
		}
		return message;
	}
	if (error instanceof Error) return error.message;
	const msg = coerceErrorMessage(error);
	return msg;
}

