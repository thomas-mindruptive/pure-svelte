// src/lib/api/types/common.ts

/**
 * Common API Types - FINAL ARCHITECTURE
 *
 * @description The single source of truth for all API structures. This version
 * implements the clean separation between a direct `QueryRequest` and a
 * `PredefinedQueryRequest` to remove ambiguity and enforce security.
 */
import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';

// ===== HTTP STATUS CODES =====
export const HTTP_STATUS = {
	OK: 200, CREATED: 201, NO_CONTENT: 204, BAD_REQUEST: 400, UNAUTHORIZED: 401,
	FORBIDDEN: 403, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405, CONFLICT: 409,
	UNPROCESSABLE_ENTITY: 422, TOO_MANY_REQUESTS: 429, INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503
} as const;
export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

// ===== BASE RESPONSE ENVELOPES =====
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
 * Request envelope for a direct, ad-hoc query.
 * The `from` field in the payload will be validated against a server whitelist.
 */
export interface QueryRequest {
	payload: QueryPayload;
}

/**
 * Request envelope for a predefined, named query.
 * The server will use the `namedQuery` to load a secure query template
 * and apply the `payload`'s select, where, and orderBy clauses to it.
 * The `from` and `joins` in the payload will be ignored.
 */
export interface PredefinedQueryRequest {
	namedQuery: string;
	payload: Omit<QueryPayload, 'from' | 'joins'>;
}

// ===== GENERIC PATTERNS FOR OPERATIONS =====

// --- 1. Query Pattern ---
export interface QueryResponseData<T> extends Record<string, unknown> {
	results: Partial<T>[];
	meta: {
		retrieved_at: string; result_count: number; columns_selected: string[];
		has_joins: boolean; has_where: boolean; parameter_count: number;
		table_fixed: string; sql_generated: string;
	};
}
export type QuerySuccessResponse<T> = ApiSuccessResponse<QueryResponseData<T>>;

// --- 2. N:M Assignment Pattern ---
export interface AssignmentRequest<TParentId, TChildId> {
	parentId: TParentId;
	childId: TChildId;
	comment?: string;
	link?: string;
}
export interface AssignmentSuccessData<TAssignment> extends Record<string, unknown> {
	assignment: TAssignment;
	meta: { assigned_at: string; parent_name: string; child_name: string; };
}
export type AssignmentSuccessResponse<TAssignment> = ApiSuccessResponse<AssignmentSuccessData<TAssignment>>;
export interface AssignmentConflictResponse<TDetails extends Record<string, unknown>> extends ApiErrorResponse {
	error_code: 'ASSIGNMENT_CONFLICT';
	details: TDetails;
}
export type AssignmentApiResponse<TAssignment, TConflictDetails extends Record<string, unknown>> =
	| AssignmentSuccessResponse<TAssignment>
	| AssignmentConflictResponse<TConflictDetails>
	| ApiErrorResponse;

// --- 3. Delete Pattern ---
export interface RemoveAssignmentRequest<TParentId, TChildId> {
	parentId: TParentId;
	childId: TChildId;
	cascade?: boolean;
}
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
	| DeleteSuccessResponse<TDeletedResource>
	| DeleteConflictResponse<TDependencies>
	| ApiErrorResponse;

// ===== GENERIC TYPE GUARDS =====
export function isApiError(response: unknown): response is ApiErrorResponse {
	const res = response as Record<string, unknown> | null;
	return res?.success === false;
}
export function isAssignmentConflict<TDetails extends Record<string, unknown>>(response: unknown): response is AssignmentConflictResponse<TDetails> {
	if (typeof response !== 'object' || response === null) return false;
	const res = response as Record<string, unknown>;
	return res.success === false && res.error_code === 'ASSIGNMENT_CONFLICT' && 'details' in res;
}
export function isDeleteConflict<TDependencies>(response: unknown): response is DeleteConflictResponse<TDependencies> {
	if (typeof response !== 'object' || response === null) return false;
	const res = response as Record<string, unknown>;
	return res.success === false && res.error_code === 'DEPENDENCY_CONFLICT' && 'cascade_available' in res && 'dependencies' in res;
}