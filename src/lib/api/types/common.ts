// src/lib/api/types/common.ts

/**
 * @file Common API Types - TYPE-SAFE FINAL VERSION
 * @description The single source of truth for all API request and response structures.
 * This version provides proper compile-time type safety by enforcing actual entity
 * field names instead of generic IDs.
 */

import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type {
    Wholesaler,
    ProductCategory,
    WholesalerCategory,
    WholesalerItemOffering,
    WholesalerOfferingAttribute,
    WholesalerOfferingLink
} from '$lib/domain/types';

// ===== BASE RESPONSE ENVELOPES =====

export const HTTP_STATUS = {
    OK: 200, CREATED: 201, NO_CONTENT: 204, BAD_REQUEST: 400, UNAUTHORIZED: 401,
    FORBIDDEN: 403, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405, CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422, TOO_MANY_REQUESTS: 429, INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
} as const;

export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export interface ApiMeta {
    timestamp: string;
    api_version?: string;
    request_id?: string;
    processing_time_ms?: number;
}

export type ValidationErrors = Record<string, string[]>;

export interface ApiSuccessResponse<TData extends Record<string, unknown>> {
    success: true;
    message: string;
    data: TData;
    meta: ApiMeta;
}

export interface ApiErrorResponse extends Record<string, unknown> {
    success: false;
    message: string;
    status_code: HttpStatusCode;
    error_code?: string;
    errors?: ValidationErrors;
    details?: Record<string, unknown>;
    meta: ApiMeta;
}

export type ApiResponse<TSuccessData extends Record<string, unknown>> =
    | ApiSuccessResponse<TSuccessData>
    | ApiErrorResponse;

// ===== GENERIC REQUEST ENVELOPES =====

/**
 * Request for a simple entity query. Uses the strictly generic `QueryPayload<T>`.
 */
export interface QueryRequest<T> {
    payload: QueryPayload<T>;
}

/**
 * Request for a predefined, named JOIN query.
 */
export interface PredefinedQueryRequest {
    namedQuery: string;
    payload: QueryPayload<unknown>;
}

/**
 * Request envelope for creating a new entity. The body is the entity data itself.
 * For a `Wholesaler`, `T` would be `Partial<Omit<Wholesaler, 'wholesaler_id'>>`.
 */
export type CreateRequest<T> = T;

/**
 * Request envelope for updating an existing entity.
 */
export interface UpdateRequest<TId, TData> {
    id: TId;
    data: TData;
}

// ===== TYPE-SAFE RELATIONSHIP REQUESTS =====

/**
 * Type-safe assignment request for supplier-categories relationship
 */
export interface SupplierCategoryAssignmentRequest {
    parentId: Wholesaler['wholesaler_id'];      // Type-safe: must be number
    childId: ProductCategory['category_id'];    // Type-safe: must be number
    comment?: WholesalerCategory['comment'];    // Type-safe: optional string
    link?: WholesalerCategory['link'];          // Type-safe: optional string
}

/**
 * Type-safe assignment request for offering-attributes relationship
 */
export interface OfferingAttributeAssignmentRequest {
    parentId: WholesalerItemOffering['offering_id'];           // Type-safe: offering_id
    childId: WholesalerOfferingAttribute['attribute_id'];      // Type-safe: attribute_id
    value?: WholesalerOfferingAttribute['value'];              // Type-safe: optional string
}

/**
 * Type-safe creation request for offering links
 */
export interface OfferingLinkCreateRequest {
    offering_id: WholesalerOfferingLink['offering_id'];  // Type-safe: number
    url: WholesalerOfferingLink['url'];                  // Type-safe: string (required)
    notes?: WholesalerOfferingLink['notes'];             // Type-safe: optional string
}

/**
 * Type-safe update request for offering links
 */
export interface OfferingLinkUpdateRequest {
    link_id: WholesalerOfferingLink['link_id'];          // Type-safe: number (required for updates)
    offering_id?: WholesalerOfferingLink['offering_id']; // Type-safe: optional number
    url?: WholesalerOfferingLink['url'];                 // Type-safe: optional string
    notes?: WholesalerOfferingLink['notes'];             // Type-safe: optional string
}

/**
 * Type-safe removal request for supplier-categories relationship
 */
export interface SupplierCategoryRemovalRequest {
    parentId: Wholesaler['wholesaler_id'];      // Type-safe: must be number
    childId: ProductCategory['category_id'];    // Type-safe: must be number
    cascade?: boolean;                          // Optional cascade flag
}

/**
 * Type-safe removal request for offering-attributes relationship
 */
export interface OfferingAttributeRemovalRequest {
    parentId: WholesalerItemOffering['offering_id'];      // Type-safe: offering_id
    childId: WholesalerOfferingAttribute['attribute_id']; // Type-safe: attribute_id
    cascade?: boolean;                                    // Optional cascade flag
}

/**
 * Type-safe removal request for offering links
 */
export interface OfferingLinkRemovalRequest {
    link_id: WholesalerOfferingLink['link_id'];  // Type-safe: number
    cascade?: boolean;                           // Optional cascade flag
}

/**
 * Type-safe update request for offering-attribute value
 */
export interface OfferingAttributeUpdateRequest {
    parentId: WholesalerItemOffering['offering_id'];      // Type-safe: offering_id
    childId: WholesalerOfferingAttribute['attribute_id']; // Type-safe: attribute_id
    value?: WholesalerOfferingAttribute['value'];         // Type-safe: optional string
}

// ===== GENERIC RESPONSE PATTERNS =====

// --- Query Responses ---
export interface QueryResponseData<T> extends Record<string, unknown> {
    results: Partial<T>[];
    meta: {
        retrieved_at: string; result_count: number; columns_selected: string[];
        has_joins: boolean; has_where: boolean; parameter_count: number;
        table_fixed: string; sql_generated: string;
    };
}
export type QuerySuccessResponse<T> = ApiSuccessResponse<QueryResponseData<T>>;

export interface SingleEntityResponseData<T> extends Record<string, unknown> {
    entity: Partial<T> | null;
}
export type SingleEntitySuccessResponse<T> = ApiSuccessResponse<SingleEntityResponseData<T>>;

// --- Assignment (n:m) Responses ---
export interface AssignmentSuccessData<TAssignment> extends Record<string, unknown> {
    assignment: TAssignment; 
    meta: {
        assigned_at: string; 
        parent_name: string; 
        child_name: string;
    };
}
export type AssignmentSuccessResponse<TAssignment> = ApiSuccessResponse<AssignmentSuccessData<TAssignment>>;

export interface AssignmentConflictResponse<TDetails extends Record<string, unknown>> extends ApiErrorResponse {
    error_code: 'ASSIGNMENT_CONFLICT'; 
    details: TDetails;
}

export type AssignmentApiResponse<TAssignment, TConflictDetails extends Record<string, unknown>> = 
    AssignmentSuccessResponse<TAssignment> | AssignmentConflictResponse<TConflictDetails> | ApiErrorResponse;

// --- Delete Responses ---
export interface DeleteSuccessData<TDeletedResource> extends Record<string, unknown> {
    deleted_resource: TDeletedResource; 
    cascade_performed: boolean; 
    dependencies_cleared: number;
}
export type DeleteSuccessResponse<TDeletedResource> = ApiSuccessResponse<DeleteSuccessData<TDeletedResource>>;

export interface DeleteConflictResponse<TDependencies> extends ApiErrorResponse {
    error_code: 'DEPENDENCY_CONFLICT'; 
    dependencies: TDependencies; 
    cascade_available: boolean;
}

export type DeleteApiResponse<TDeletedResource, TDependencies> = 
    DeleteSuccessResponse<TDeletedResource> |
    DeleteConflictResponse<TDependencies> |
    ApiErrorResponse;

// ===== DEPRECATED - Legacy Generic Types (Remove after client updates) =====

/**
 * @deprecated Use specific typed request interfaces instead
 */
export interface AssignmentRequest<TParentId, TChildId> {
    parentId: TParentId; 
    childId: TChildId; 
    comment?: string; 
    link?: string;
}

/**
 * @deprecated Use specific typed request interfaces instead
 */
export interface RemoveAssignmentRequest<TParentId, TChildId> {
    parentId: TParentId; 
    childId: TChildId; 
    cascade?: boolean;
}

// ===== GENERIC TYPE GUARDS =====

export function isApiError(response: unknown): response is ApiErrorResponse {
    const res = response as Record<string, unknown> | null;
    return res?.success === false;
}

export function isAssignmentConflict<TDetails extends Record<string, unknown>>(
    response: unknown
): response is AssignmentConflictResponse<TDetails> {
    if (typeof response !== 'object' || response === null) return false;
    const res = response as Record<string, unknown>;
    return (res.success === false && res.error_code === 'ASSIGNMENT_CONFLICT' && 'details' in res);
}

export function isDeleteConflict<TDependencies>(
    response: unknown
): response is DeleteConflictResponse<TDependencies> {
    if (typeof response !== 'object' || response === null) return false;
    const res = response as Record<string, unknown>;
    return (res.success === false && res.error_code === 'DEPENDENCY_CONFLICT' && 'cascade_available' in res && 'dependencies' in res);
}