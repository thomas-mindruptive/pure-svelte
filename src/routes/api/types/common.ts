// src/lib/api/types/common.ts

/**
 * Common API Types - Shared Types for All API Endpoints
 * 
 * @description Provides shared type definitions, constants, and utilities used across
 * all API endpoints. Eliminates code duplication between domain-specific API types
 * and ensures consistent response patterns throughout the application.
 * 
 * @features
 * - Generic API response structures (success/error)
 * - HTTP status code constants and mappings
 * - Pagination and query parameter types
 * - Validation error structures
 * - Type guards for response handling
 * - Metadata structures for API responses
 * 
 * @architecture
 * - Generic types that can be extended by domain-specific APIs
 * - Consistent error handling patterns across all endpoints
 * - Type-safe HTTP status code handling
 * - Reusable pagination and filtering interfaces
 * 
 * @example
 * ```typescript
 * import { BaseApiResponse, isApiSuccess, HTTP_STATUS } from '$lib/api/types/common';
 * 
 * interface CreateUserSuccess extends Record<string, unknown> {
 *   user: User;
 * }
 * 
 * type CreateUserResponse = BaseApiResponse<CreateUserSuccess>;
 * 
 * if (isApiSuccess(response)) {
 *   console.log('User created:', response.user.name);
 * }
 * ```
 */

// ===== HTTP STATUS CODES =====

/**
 * HTTP status code constants for consistent API responses
 */
export const HTTP_STATUS = {
  // Success responses
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  
  // Client error responses  
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  
  // Server error responses
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * HTTP status code type
 */
export type HttpStatusCode = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];

/**
 * Maps HTTP status codes to their standard descriptions
 */
export const HTTP_STATUS_MESSAGES: Record<HttpStatusCode, string> = {
  [HTTP_STATUS.OK]: 'OK',
  [HTTP_STATUS.CREATED]: 'Created',
  [HTTP_STATUS.NO_CONTENT]: 'No Content',
  [HTTP_STATUS.BAD_REQUEST]: 'Bad Request',
  [HTTP_STATUS.UNAUTHORIZED]: 'Unauthorized', 
  [HTTP_STATUS.FORBIDDEN]: 'Forbidden',
  [HTTP_STATUS.NOT_FOUND]: 'Not Found',
  [HTTP_STATUS.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HTTP_STATUS.CONFLICT]: 'Conflict',
  [HTTP_STATUS.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HTTP_STATUS.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HTTP_STATUS.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HTTP_STATUS.SERVICE_UNAVAILABLE]: 'Service Unavailable',
};

// ===== COMMON API RESPONSE STRUCTURES =====

/**
 * Base metadata structure for all API responses
 */
export interface BaseApiMeta extends Record<string, unknown> {
  /** ISO timestamp when response was generated */
  timestamp: string;
  /** API version that generated this response */
  api_version?: string;
  /** Request ID for tracing/debugging */
  request_id?: string;
  /** Processing time in milliseconds */
  processing_time_ms?: number;
}

/**
 * Generic successful API response structure
 * All success responses follow this pattern for consistency
 */
export interface BaseApiSuccessResponse<TData extends Record<string, unknown> = Record<string, unknown>> 
  extends Record<string, unknown> {
  /** Always true for successful responses */
  success: true;
  /** Human-readable success message */
  message: string;
  /** Response metadata */
  meta: BaseApiMeta;
  /** Success-specific data (extends this interface) */
  data?: TData;
}

/**
 * Generic error API response structure  
 * All error responses follow this pattern for consistency
 */
export interface BaseApiErrorResponse extends Record<string, unknown> {
  /** Always false for error responses */
  success: false;
  /** Human-readable error message */
  message: string;
  /** HTTP status code */
  status_code: HttpStatusCode;
  /** Error code for programmatic handling */
  error_code?: string;
  /** Field-specific validation errors */
  errors?: ValidationErrors;
  /** Additional error context */
  details?: Record<string, unknown>;
  /** Response metadata */
  meta: BaseApiMeta;
}

/**
 * Union type for all API responses
 * @template TSuccess - Success response data type
 */
export type BaseApiResponse<TSuccess extends Record<string, unknown> = Record<string, unknown>> = 
  | (BaseApiSuccessResponse<TSuccess> & TSuccess)
  | BaseApiErrorResponse;

// ===== VALIDATION TYPES =====

/**
 * Field-specific validation errors
 * Maps field names to arrays of error messages
 */
export interface ValidationErrors extends Record<string, string[]> {
  [fieldName: string]: string[];
}

/**
 * Validation error response (400 Bad Request)
 */
export interface ValidationErrorResponse extends BaseApiErrorResponse {
  status_code: typeof HTTP_STATUS.BAD_REQUEST;
  error_code: 'VALIDATION_ERROR';
  errors: ValidationErrors;
}

/**
 * Resource not found error response (404 Not Found)
 */
export interface NotFoundErrorResponse extends BaseApiErrorResponse {
  status_code: typeof HTTP_STATUS.NOT_FOUND;
  error_code: 'RESOURCE_NOT_FOUND';
  details: {
    resource_type: string;
    resource_id: string | number;
  };
}

/**
 * Conflict error response (409 Conflict)
 */
export interface ConflictErrorResponse extends BaseApiErrorResponse {
  status_code: typeof HTTP_STATUS.CONFLICT;
  error_code: 'RESOURCE_CONFLICT' | 'CASCADE_REQUIRED';
  details: {
    conflict_type: string;
    conflicting_resource?: string | number;
    dependencies?: string[] | DependencyInfo[];
  };
}

// ===== PAGINATION TYPES =====

/**
 * Pagination query parameters for list endpoints
 */
export interface PaginationParams extends Record<string, unknown> {
  /** Number of items to return (max configurable per endpoint) */
  limit?: number;
  /** Number of items to skip for pagination */
  offset?: number;
  /** Page number (alternative to offset) */
  page?: number;
}

/**
 * Search and filtering parameters
 */
export interface FilterParams extends Record<string, unknown> {
  /** Search term for text-based filtering */
  search?: string;
  /** Sort field name */
  sort_by?: string;
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
  /** Filter by creation date (ISO string) */
  created_after?: string;
  /** Filter by creation date (ISO string) */
  created_before?: string;
  /** Filter by update date (ISO string) */
  updated_after?: string;
  /** Filter by update date (ISO string) */
  updated_before?: string;
}

/**
 * Combined query parameters for list endpoints
 */
export interface ListQueryParams extends PaginationParams, FilterParams {
  /** Include additional related data */
  include?: string[];
  /** Exclude specific fields from response */
  exclude?: string[];
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta extends Record<string, unknown> {
  /** Total number of items available */
  total: number;
  /** Number of items returned in this response */
  returned: number;
  /** Limit used for this request */
  limit: number;
  /** Offset used for this request */
  offset: number;
  /** Whether there are more items available */
  has_more: boolean;
  /** Current page number (if using page-based pagination) */
  current_page?: number;
  /** Total number of pages (if using page-based pagination) */
  total_pages?: number;
}

/**
 * Generic paginated list response
 */
export interface PaginatedListResponse<TItem> extends BaseApiSuccessResponse {
  /** Array of items */
  items: TItem[];
  /** Pagination metadata */
  pagination: PaginationMeta;
}

// ===== BULK OPERATION TYPES =====

/**
 * Bulk operation request structure
 */
export interface BulkOperationRequest<TData extends Record<string, unknown> = Record<string, unknown>> 
  extends Record<string, unknown> {
  /** Array of IDs to operate on */
  ids: (string | number)[];
  /** Operation-specific data */
  data?: TData;
  /** Additional operation options */
  options?: Record<string, unknown>;
}

/**
 * Bulk operation result for a single item
 */
export interface BulkOperationResult extends Record<string, unknown> {
  /** Item ID that was processed */
  id: string | number;
  /** Whether the operation succeeded for this item */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Additional result data */
  data?: Record<string, unknown>;
}

/**
 * Bulk operation response
 */
export interface BulkOperationResponse extends BaseApiSuccessResponse {
  /** Results for each item */
  results: BulkOperationResult[];
  /** Summary statistics */
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
}

// ===== CASCADE DELETE TYPES =====

/**
 * Dependency information for cascade operations
 */
export interface DependencyInfo extends Record<string, unknown> {
  /** Type of dependent resource */
  resource_type: string;
  /** Number of dependent items */
  count: number;
  /** Sample of dependent item names/titles */
  sample_items?: string[];
}

/**
 * Cascade delete conflict response (409 Conflict)
 */
export interface CascadeConflictResponse extends ConflictErrorResponse {
  error_code: 'CASCADE_REQUIRED';
  details: {
    conflict_type: 'dependencies';
    dependencies: DependencyInfo[];
    cascade_available: boolean;
    cascade_recommended: boolean;
  };
}

/**
 * Cascade delete success response
 */
export interface CascadeDeleteResponse extends BaseApiSuccessResponse {
  /** Information about the deleted primary resource */
  deleted_resource: {
    id: string | number;
    type: string;
    name?: string;
  };
  /** Whether cascade delete was performed */
  cascade_performed: boolean;
  /** Dependencies that were removed */
  dependencies_removed: DependencyInfo[];
  /** Total number of items removed */
  total_removed: number;
}

// ===== GENERIC TYPE GUARDS =====

/**
 * Type guard to check if response is a success response
 * Works with any success response type
 */
export function isApiSuccess<TSuccess extends Record<string, unknown>>(
  response: BaseApiResponse<TSuccess>
): response is BaseApiSuccessResponse<TSuccess> & TSuccess {
  return response.success === true;
}

/**
 * Type guard to check if response is an error response
 */
export function isApiError<TSuccess extends Record<string, unknown>>(
  response: BaseApiResponse<TSuccess>
): response is BaseApiErrorResponse {
  return response.success === false;
}

/**
 * Type guard to check if response is a validation error
 */
export function hasValidationErrors<TSuccess extends Record<string, unknown>>(
  response: BaseApiResponse<TSuccess>
): response is ValidationErrorResponse {
  return (
    !response.success && 
    response.status_code === HTTP_STATUS.BAD_REQUEST &&
    'errors' in response && 
    typeof response.errors === 'object'
  );
}

/**
 * Type guard to check if response is a not found error
 */
export function isNotFoundError<TSuccess extends Record<string, unknown>>(
  response: BaseApiResponse<TSuccess>
): response is NotFoundErrorResponse {
  return (
    !response.success && 
    response.status_code === HTTP_STATUS.NOT_FOUND
  );
}

/**
 * Type guard to check if response is a conflict error
 */
export function isConflictError<TSuccess extends Record<string, unknown>>(
  response: BaseApiResponse<TSuccess>
): response is ConflictErrorResponse {
  return (
    !response.success && 
    response.status_code === HTTP_STATUS.CONFLICT
  );
}

/**
 * Type guard to check if conflict is a cascade delete requirement
 */
export function isCascadeConflict<TSuccess extends Record<string, unknown>>(
  response: BaseApiResponse<TSuccess>
): response is CascadeConflictResponse {
  return (
    isConflictError(response) && 
    'error_code' in response &&
    response.error_code === 'CASCADE_REQUIRED'
  );
}

/**
 * Type guard to check if response is a paginated list
 */
export function isPaginatedResponse<TItem>(
  response: unknown
): response is PaginatedListResponse<TItem> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as Record<string, unknown>).success === true &&
    'items' in response &&
    Array.isArray((response as Record<string, unknown>).items) &&
    'pagination' in response &&
    typeof (response as Record<string, unknown>).pagination === 'object'
  );
}

// ===== DOMAIN-SPECIFIC TYPE GUARD FACTORIES =====

/**
 * Creates a delete conflict type guard for domain-specific responses
 * Used by supplier.ts, category.ts etc. to avoid duplicate implementations
 */
export function createDeleteConflictGuard<TResponse extends Record<string, unknown>>() {
  return function isDeleteConflict(response: TResponse): boolean {
    return (
      typeof response === 'object' &&
      response !== null &&
      'success' in response &&
      response.success === false &&
      'cascade_available' in response &&
      typeof response.cascade_available === 'boolean'
    );
  };
}

/**
 * Creates domain-specific API success type guard
 * Used by category.ts etc. for domain-specific success responses
 */
export function createDomainSuccessGuard<TSuccess extends Record<string, unknown>>() {
  return function isDomainApiSuccess(
    response: BaseApiResponse<TSuccess>
  ): response is BaseApiSuccessResponse<TSuccess> & TSuccess {
    return isApiSuccess(response);
  };
}

/**
 * Creates domain-specific API error type guard  
 * Used by category.ts etc. for domain-specific error responses
 */
export function createDomainErrorGuard<TSuccess extends Record<string, unknown>>() {
  return function isDomainApiError(
    response: BaseApiResponse<TSuccess>
  ): response is BaseApiErrorResponse {
    return isApiError(response);
  };
}

/**
 * Creates domain-specific validation error type guard
 * Used by supplier.ts, category.ts etc. for domain validation errors
 */
export function createDomainValidationGuard<TSuccess extends Record<string, unknown>>() {
  return function hasDomainValidationErrors(
    response: BaseApiResponse<TSuccess>
  ): response is ValidationErrorResponse {
    return hasValidationErrors(response);
  };
}

// ===== UTILITY FUNCTIONS =====

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<TData extends Record<string, unknown>>(
  message: string,
  data?: TData,
  meta?: Partial<BaseApiMeta>
): BaseApiSuccessResponse<TData> & TData {
  const baseResponse: BaseApiSuccessResponse<TData> = {
    success: true,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    },
    ...(data && { data })
  };
  
  return { ...baseResponse, ...(data || {} as TData) };
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  message: string,
  statusCode: HttpStatusCode,
  errorCode?: string,
  errors?: ValidationErrors,
  details?: Record<string, unknown>,
  meta?: Partial<BaseApiMeta>
): BaseApiErrorResponse {
  return {
    success: false,
    message,
    status_code: statusCode,
    ...(errorCode && { error_code: errorCode }),
    ...(errors && { errors }),
    ...(details && { details }),
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Creates pagination metadata from query parameters and results
 */
export function createPaginationMeta(
  total: number,
  returned: number,
  limit: number,
  offset: number
): PaginationMeta {
  const hasMore = offset + returned < total;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    returned,
    limit,
    offset,
    has_more: hasMore,
    current_page: currentPage,
    total_pages: totalPages
  };
}

/**
 * Extracts standardized query parameters from URL search params
 */
export function extractQueryParams(searchParams: URLSearchParams): ListQueryParams {
  const params: ListQueryParams = {};
  
  // Pagination
  const limit = searchParams.get('limit');
  if (limit) params.limit = parseInt(limit, 10);
  
  const offset = searchParams.get('offset');
  if (offset) params.offset = parseInt(offset, 10);
  
  const page = searchParams.get('page');
  if (page) params.page = parseInt(page, 10);
  
  // Filtering
  const search = searchParams.get('search');
  if (search) params.search = search;
  
  const sortBy = searchParams.get('sort_by');
  if (sortBy) params.sort_by = sortBy;
  
  const sortOrder = searchParams.get('sort_order');
  if (sortOrder && (sortOrder === 'asc' || sortOrder === 'desc')) {
    params.sort_order = sortOrder;
  }
  
  // Date filters
  const createdAfter = searchParams.get('created_after');
  if (createdAfter) params.created_after = createdAfter;
  
  const createdBefore = searchParams.get('created_before');
  if (createdBefore) params.created_before = createdBefore;
  
  const updatedAfter = searchParams.get('updated_after');
  if (updatedAfter) params.updated_after = updatedAfter;
  
  const updatedBefore = searchParams.get('updated_before');
  if (updatedBefore) params.updated_before = updatedBefore;
  
  // Include/exclude
  const include = searchParams.get('include');
  if (include) params.include = include.split(',');
  
  const exclude = searchParams.get('exclude');
  if (exclude) params.exclude = exclude.split(',');
  
  return params;
}

// ===== DOMAIN ADAPTATION HELPERS =====

/**
 * Adapts BaseApiResponse to domain-specific response types
 * Used by domain-specific API type files
 */
export type DomainApiResponse<
  TSuccess extends Record<string, unknown>,
  TError extends BaseApiErrorResponse = BaseApiErrorResponse
> = BaseApiResponse<TSuccess> | TError;

/**
 * Creates domain-specific type guards
 * Example usage in domain files:
 * export const isSupplierApiSuccess = createDomainTypeGuard<SupplierSuccessType>();
 */
export function createDomainTypeGuard<TSuccess extends Record<string, unknown>>() {
  return function isDomainApiSuccess(
    response: BaseApiResponse<TSuccess>
  ): response is BaseApiSuccessResponse<TSuccess> & TSuccess {
    return isApiSuccess(response);
  };
}

// ===== USAGE EXAMPLES =====

/**
 * Example: Creating a domain-specific API response type
 */
export type ExampleDomainUsage = {
  // Domain-specific success type
  interface_definition: `
    interface CreateProductSuccess extends Record<string, unknown> {
      product: Product;
      created_at: string;
    }
  `;
  
  // Domain response type
  response_type: `
    type CreateProductResponse = BaseApiResponse<CreateProductSuccess>;
  `;
  
  // Usage in API handler
  api_handler_usage: `
    export const POST: RequestHandler = async (event) => {
      try {
        const product = await createProduct(data);
        return json(createSuccessResponse(
          'Product created successfully',
          { product, created_at: product.created_at }
        ));
      } catch (error) {
        return json(
          createErrorResponse(
            'Failed to create product',
            HTTP_STATUS.BAD_REQUEST,
            'VALIDATION_ERROR',
            validationErrors
          ),
          { status: HTTP_STATUS.BAD_REQUEST }
        );
      }
    };
  `;
  
  // Client-side usage
  client_usage: `
    const response: CreateProductResponse = await fetch('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    }).then(r => r.json());
    
    if (isApiSuccess(response)) {
      console.log('Product created:', response.product.name);
    } else if (hasValidationErrors(response)) {
      console.error('Validation errors:', response.errors);
    } else {
      console.error('Error:', response.message);
    }
  `;
};