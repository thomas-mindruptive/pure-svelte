// $lib/api/client/common.ts

/**
 * Client-Side API Utilities
 * 
 * @description Client-specific utilities for API functions including fetch wrapper,
 * loading state management, and retry logic. Reuses shared types from ../types/common
 * for consistent API response handling.
 * 
 * @features
 * - Type-safe fetch wrapper with error handling
 * - Loading state management utilities
 * - Retry logic for failed requests
 * - URL and body creation helpers
 */

import { log } from '$lib/utils/logger';
import {
  type BaseApiErrorResponse,
  type ValidationErrors,
} from '../types/common';

/**
 * Client-side API error class for additional context
 * Extends Error with structured information from server responses
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: ValidationErrors,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Options for API requests
 */
export interface ApiRequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Whether to include credentials */
  credentials?: RequestCredentials;
  /** Custom error message for logging */
  context?: string;
}

/**
 * Type-safe fetch wrapper with comprehensive error handling
 * 
 * @template T - Expected response type
 * @param url - Request URL
 * @param init - Fetch init options
 * @param options - Additional API options
 * @returns Promise resolving to typed response data
 * @throws ApiError with structured error information
 * 
 * @example
 * ```typescript
 * const suppliers = await apiFetch<Wholesaler[]>('/api/suppliers', {
 *   method: 'POST',
 *   body: JSON.stringify(queryPayload)
 * }, { context: 'loadSuppliers' });
 * ```
 */
export async function apiFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {}
): Promise<T> {
  const { timeout = 30000, context = 'API Request', headers = {}, credentials } = options;
  
  // Create AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // Prepare request init with defaults
  const requestInit: RequestInit = {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...headers,
      ...init.headers,
    },
    credentials: credentials || 'same-origin',
    signal: controller.signal,
  };

  try {
    log.info("API Request", {
      url,
      method: init.method || 'GET',
      context,
      hasBody: !!init.body
    });

    const response = await fetch(url, requestInit);
    clearTimeout(timeoutId);

    // Handle non-JSON responses (e.g., HTML error pages)
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      throw new ApiError(
        `Server returned ${response.status}: ${response.statusText}`,
        response.status,
        undefined,
        { text, contentType }
      );
    }

    // Parse JSON response
    let data: unknown;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new ApiError(
        `Failed to parse server response as JSON`,
        response.status,
        undefined,
        { parseError: String(parseError) }
      );
    }

    // Handle successful responses
    if (response.ok) {
      log.info("API Success", {
        url,
        method: init.method || 'GET',
        status: response.status,
        context
      });
      return data as T;
    }

    // Handle error responses with structured data
    const errorData = data as BaseApiErrorResponse;
    
    log.warn("API Error Response", {
      url,
      method: init.method || 'GET',
      status: response.status,
      context,
      message: errorData.message,
      hasValidationErrors: !!errorData.errors
    });

    throw new ApiError(
      errorData.message || `Request failed with status ${response.status}`,
      response.status,
      errorData.errors,
      errorData
    );

  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle fetch-level errors (network, timeout, etc.)
    if (error instanceof ApiError) {
      throw error; // Re-throw structured API errors
    }

    // Handle network and other fetch errors
    if (error instanceof TypeError || error instanceof DOMException) {
      log.error("API Network Error", {
        url,
        method: init.method || 'GET',
        context,
        error: String(error)
      });

      throw new ApiError(
        `Network error: Unable to reach server`,
        0, // Network errors don't have HTTP status
        undefined,
        { originalError: String(error) }
      );
    }

    // Handle unknown errors
    log.error("API Unknown Error", {
      url,
      method: init.method || 'GET',
      context,
      error: String(error)
    });

    throw new ApiError(
      `Unexpected error: ${String(error)}`,
      500,
      undefined,
      { originalError: String(error) }
    );
  }
}

/**
 * Creates a GET request with query parameters
 * 
 * @param baseUrl - Base URL without query params
 * @param params - Query parameters as key-value object
 * @returns Complete URL with encoded query string
 * 
 * @example
 * ```typescript
 * const url = createGetUrl('/api/suppliers', { status: 'active', limit: 50 });
 * // Returns: '/api/suppliers?status=active&limit=50'
 * ```
 */
export function createGetUrl(baseUrl: string, params: Record<string, unknown> = {}): string {
  const validParams = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [key, String(value)]);
  
  if (validParams.length === 0) {
    return baseUrl;
  }
  
  const searchParams = new URLSearchParams(validParams);
  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * Creates a POST request body from object
 * 
 * @param data - Object to serialize
 * @returns JSON string for request body
 */
export function createPostBody(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Type guard to check if error is a client ApiError
 */
export function isClientApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Extracts user-friendly error message from various error types
 * 
 * @param error - Error of unknown type
 * @returns Human-readable error message
 */
export function getErrorMessage(error: unknown): string {
  if (isClientApiError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Formats validation errors for display
 * 
 * @param errors - Validation errors from API response
 * @returns Array of formatted error messages
 */
export function formatValidationErrors(errors: Record<string, string[]>): string[] {
  return Object.entries(errors).flatMap(([field, messages]) =>
    messages.map(message => `${field}: ${message}`)
  );
}

/**
 * Loading state manager for API operations
 */
export class LoadingState {
  private loadingOperations = new Set<string>();
  private callbacks = new Set<() => void>();

  /**
   * Starts a loading operation
   */
  start(operationId: string): void {
    this.loadingOperations.add(operationId);
    this.notifyCallbacks();
  }

  /**
   * Finishes a loading operation
   */
  finish(operationId: string): void {
    this.loadingOperations.delete(operationId);
    this.notifyCallbacks();
  }

  /**
   * Checks if any operation is loading
   */
  get isLoading(): boolean {
    return this.loadingOperations.size > 0;
  }

  /**
   * Checks if specific operation is loading
   */
  isOperationLoading(operationId: string): boolean {
    return this.loadingOperations.has(operationId);
  }

  /**
   * Subscribe to loading state changes
   */
  subscribe(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => callback());
  }
}

/**
 * Retry configuration for failed requests
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay between retries in milliseconds */
  baseDelay: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
  /** Status codes that should trigger retries */
  retryOn: number[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  exponentialBackoff: true,
  retryOn: [500, 502, 503, 504], // Server errors
};

/**
 * Fetch with automatic retry logic
 * 
 * @template T - Expected response type
 * @param url - Request URL
 * @param init - Fetch init options
 * @param options - API options
 * @param retryConfig - Retry configuration
 * @returns Promise resolving to typed response data
 */
export async function apiFetchWithRetry<T = unknown>(
  url: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: ApiError;
  
  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      return await apiFetch<T>(url, init, {
        ...options,
        context: `${options.context} (attempt ${attempt}/${retryConfig.maxAttempts})`
      });
    } catch (error) {
      // Only retry on configured status codes
      if (isClientApiError(error) && !retryConfig.retryOn.includes(error.status)) {
        throw error;
      }
      
      lastError = error as ApiError;
      
      // Don't delay after the last attempt
      if (attempt < retryConfig.maxAttempts) {
        const delay = retryConfig.exponentialBackoff
          ? retryConfig.baseDelay * Math.pow(2, attempt - 1)
          : retryConfig.baseDelay;
        
        log.info("API Retry", {
          url,
          attempt,
          maxAttempts: retryConfig.maxAttempts,
          delayMs: delay,
          error: String(error)
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}