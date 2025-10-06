// src/lib/api/api.types.ts

import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { ValidationErrors, ValidationErrorTree } from "$lib/components/validation/validation.types";

/**
 * @file Common API Types - ORGANIZED GENERIC TYPE SYSTEM
 * @description The single source of truth for all API request and response structures.
 * Uses compile-time validated generic types with automatic field derivation.
 */

// ===== 1. BASE CONSTANTS & UTILITIES =====

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export interface ApiMeta {
  timestamp: string;
  api_version?: string;
  request_id?: string;
  processing_time_ms?: number;
}

// ===== 2. CORE RESPONSE ENVELOPES =====

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

export type ApiResponse<TSuccessData extends Record<string, unknown>> = ApiSuccessResponse<TSuccessData> | ApiErrorResponse;

// ===== 3. GENERIC TYPE SYSTEM =====

/**
 * Automatic ID field extraction from entity types
 */
type IdField<T> = Extract<keyof T, `${string}_id`>;

/**
 * Assignment between two master entities (n:m relationships)
 */
export type AssignmentRequest<TParent1, TParent2, TChild> = {
  parent1Id: TParent1[IdField<TParent1>];
  parent2Id: TParent2[IdField<TParent2>];
  data?: TChild;
};

/**
 * Update assignment between two master entities
 */
export type AssignmentUpdateRequest<TParent1, TParent2, TChild> = {
  parent1Id: TParent1[IdField<TParent1>];
  parent2Id: TParent2[IdField<TParent2>];
  data?: TChild;
};

/**
 * Remove assignment between two master entities
 */
export type RemoveAssignmentRequest<TParent1, TParent2> = {
  parent1Id: TParent1[IdField<TParent1>];
  parent2Id: TParent2[IdField<TParent2>];
  cascade: boolean;
  forceCascade: boolean;
};

/**
 * Create child entity in parent context (1:n compositions)
 */
export type CreateChildRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  data: TChild;
};

/**
 * Delete entity by its ID
 */
export type DeleteRequest<T> = {
  id: T[IdField<T>];
  cascade?: boolean;
  forceCascade?: boolean;
};

// ===== 4. REQUEST ENVELOPES =====

/**
 * Request for entity query using QueryPayload
 */
export interface QueryRequest<T> {
  payload: QueryPayload<T>;
}

export interface QueryRequestWithOptionalPayload<T> {
  payload?: QueryPayload<T>;
}

/**
 * Request for predefined named JOIN query
 * Note: TypeScript cannot prevent excess properties in variable assignments due to structural typing.
 * Use explicit type annotation on payload variable to catch excess properties.
 */
export interface PredefinedQueryRequest<T> {
  namedQuery: string;
  payload?: Partial<QueryPayload<T>>;
}

// ===== 5. RESPONSE DATA TYPES =====

// --- Query Responses ---
export interface QueryResponseData<T> extends Record<string, unknown> {
  results: Partial<T>[];
  meta: {
    retrieved_at: string;
    result_count: number;
    columns_selected: string[];
    has_joins: boolean;
    has_where: boolean;
    parameter_count: number;
    table_fixed: string;
    sql_generated: string;
  };
}

export type QuerySuccessResponse<T> = ApiSuccessResponse<QueryResponseData<T>>;

export interface SingleEntityResponseData<T> extends Record<string, unknown> {
  entity: Partial<T> | null;
}

export type SingleEntitySuccessResponse<T> = ApiSuccessResponse<SingleEntityResponseData<T>>;

// --- Assignment Responses ---
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
  error_code: "ASSIGNMENT_CONFLICT";
  details: TDetails;
}

export type AssignmentApiResponse<TAssignment, TConflictDetails extends Record<string, unknown>> =
  | AssignmentSuccessResponse<TAssignment>
  | AssignmentConflictResponse<TConflictDetails>
  | ApiErrorResponse;

// --- Delete Responses ---
export interface DeleteSuccessData<TDeletedResource> extends Record<string, unknown> {
  deleted_resource: TDeletedResource;
  cascade_performed: boolean;
  dependencies_cleared: number;
}

export type DeleteSuccessResponse<TDeletedResource> = ApiSuccessResponse<DeleteSuccessData<TDeletedResource>>;

export interface DeleteConflictResponse<TDependencies> extends ApiErrorResponse {
  error_code: "DEPENDENCY_CONFLICT";
  dependencies: { hard: TDependencies; soft: TDependencies };
  cascade_available: boolean;
}

export type DeleteApiResponse<TDeletedResource, TDependencies> =
  | DeleteSuccessResponse<TDeletedResource>
  | DeleteConflictResponse<TDependencies>
  | ApiErrorResponse;

// ===== 6. API TYPE GUARDS =====

export function isApiError(response: unknown): response is ApiErrorResponse {
  const res = response as Record<string, unknown> | null;
  return res?.success === false;
}

export function isAssignmentConflict<TDetails extends Record<string, unknown>>(
  response: unknown,
): response is AssignmentConflictResponse<TDetails> {
  if (typeof response !== "object" || response === null) return false;
  const res = response as Record<string, unknown>;
  return res.success === false && res.error_code === "ASSIGNMENT_CONFLICT" && "details" in res;
}

export function isDeleteConflict(
    response: unknown
): response is DeleteConflictResponse<string[]> {
    if (typeof response !== 'object' || response === null) return false;
    const res = response as Record<string, unknown>;
    return (
        res.success === false && 
        res.error_code === 'DEPENDENCY_CONFLICT' && 
        'cascade_available' in res && 
        'dependencies' in res
    );
}

// ===== API CLIENT ERRORS =====/

export type ApiValidationError = {valTree: ValidationErrorTree}

export function isApiValidationError(err: unknown): err is ApiValidationError {
    if (typeof err !== "object" || err === null) return false;
    const e = err as Record<string, unknown>;
    return (
      typeof e.valTree === "object" &&
      e.valTree !== null
    );
  }
