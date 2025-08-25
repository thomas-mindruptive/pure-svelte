// src/lib/api/types/supplier.ts

/**
 * Supplier API Types - End-to-End Type Safety
 * 
 * @description Complete type definitions for all supplier-related API endpoints.
 * Provides type safety between client and server for /api/suppliers/[id] operations.
 * 
 * @endpoints
 * - POST /api/suppliers/[id] - Flexible supplier queries via QueryBuilder
 * - PUT /api/suppliers/[id] - Update existing supplier
 * - DELETE /api/suppliers/[id] - Delete supplier with dependency handling
 * 
 * @features
 * - Request/Response type pairs for all endpoints
 * - Strict typing with domain entity integration
 * - Error handling types with validation details
 * - QueryBuilder integration types
 */

import type { Wholesaler } from '$lib/domain/types';
import type { QueryPayload } from '$lib/clientAndBack/queryGrammar';

// ===== COMMON SUPPLIER API TYPES =====

/**
 * Generic API success response structure
 */
export interface ApiSuccessResponse extends Record<string, unknown> {
  success: true;
  message: string;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * Generic API error response structure
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * Union type for all API responses
 */
export type ApiResponse<TSuccess extends Record<string, unknown> = Record<string, unknown>> = 
  | (ApiSuccessResponse & TSuccess)
  | ApiErrorResponse;

// ===== POST /api/suppliers/[id] - FLEXIBLE QUERY =====

/**
 * Client query request for supplier data
 * Uses QueryBuilder pattern but WITHOUT 'from' field (server sets table)
 */
export type SupplierQueryRequest = QueryPayload;

/**
 * Query result metadata from QueryBuilder
 */
export interface QueryResultMeta extends Record<string, unknown> {
  /** When the query was executed */
  retrieved_at: string;
  /** Number of results returned */
  result_count: number;
  /** Columns that were selected */
  columns_selected: string[];
  /** Whether JOINs were used in the query */
  has_joins: boolean;
  /** Whether WHERE clause was applied */
  has_where: boolean;
  /** Number of parameters used in the query */
  parameter_count: number;
  /** Table that was queried (always 'dbo.wholesalers' for security) */
  table_fixed: string;
  /** Generated SQL query (for debugging) */
  sql_generated: string;
}

/**
 * Response from supplier query endpoint
 */
export interface SupplierQueryResponse extends Record<string, unknown> {
  /** Array of supplier records matching the query */
  results: Partial<Wholesaler>[];
  /** Query execution metadata */
  meta: QueryResultMeta;
}

// ===== PUT /api/suppliers/[id] - UPDATE SUPPLIER =====

/**
 * Request body for updating a supplier
 * All fields are optional for PATCH-style updates
 */
export interface UpdateSupplierRequest extends Record<string, unknown> {
  /** Supplier name (required if provided, must be unique) */
  name?: string;
  /** Geographic region */
  region?: string;
  /** Business status */
  status?: 'active' | 'inactive' | 'new' | 'pending' | 'suspended';
  /** Whether supplier offers dropshipping */
  dropship?: boolean;
  /** Supplier website URL */
  website?: string;
  /** Business-to-business notes */
  b2b_notes?: string;
  /** Email address */
  email?: string;
  /** Country code */
  country?: string;
}

/**
 * Successful supplier update response
 */
export interface UpdateSupplierSuccess extends Record<string, unknown> {
  /** Updated supplier object */
  supplier: Wholesaler;
  /** Update metadata */
  meta: {
    updated_at: string;
  };
}

/**
 * Response from supplier update endpoint
 */
export type UpdateSupplierResponse = ApiResponse<UpdateSupplierSuccess>;

// ===== DELETE /api/suppliers/[id] - DELETE SUPPLIER =====

/**
 * Query parameters for supplier deletion
 */
export interface DeleteSupplierParams extends Record<string, unknown> {
  /** Whether to perform cascade delete of dependencies */
  cascade?: 'true' | 'false';
}

/**
 * Supplier dependency information
 */
export interface SupplierDependencies extends Record<string, unknown> {
  /** List of dependency descriptions */
  dependencies: string[];
  /** Whether cascade delete is available */
  cascade_available: boolean;
}

/**
 * Response when supplier has dependencies (409 Conflict)
 */
export interface DeleteSupplierConflict extends Record<string, unknown> {
  success: false;
  message: string;
  /** Dependency information */
  dependencies: string[];
  /** Whether cascade delete is available */
  cascade_available: boolean;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * Successful supplier deletion response
 */
export interface DeleteSupplierSuccess extends Record<string, unknown> {
  /** Deleted supplier information */
  deleted_supplier: {
    wholesaler_id: number;
    name: string;
  };
  /** Whether cascade delete was performed */
  cascade_performed: boolean;
  /** Number of dependent records removed */
  dependencies_cleared: number;
  /** Deletion metadata */
  meta: {
    deleted_at: string;
  };
}

/**
 * Response from supplier deletion endpoint
 * Can be success, conflict (has dependencies), or error
 */
export type DeleteSupplierResponse = 
  | (ApiSuccessResponse & DeleteSupplierSuccess)
  | DeleteSupplierConflict
  | ApiErrorResponse;

// ===== VALIDATION TYPES =====

/**
 * Validation error details for supplier operations
 * All fields return string arrays, never undefined
 */
export interface SupplierValidationErrors extends Record<string, string[]> {
  name?: string[];
  region?: string[];
  status?: string[];
  dropship?: string[];
  website?: string[];
  b2b_notes?: string[];
  email?: string[];
  country?: string[];
}

/**
 * Response for validation failures (400 Bad Request)
 */
export interface SupplierValidationError extends Record<string, unknown> {
  success: false;
  message: string;
  errors: SupplierValidationErrors;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

// ===== TYPE GUARDS =====

/**
 * Type guard to check if delete response is a conflict (has dependencies)
 */
export function isDeleteConflict(
  response: DeleteSupplierResponse
): response is DeleteSupplierConflict {
  return !response.success && 'cascade_available' in response;
}


// ===== USAGE EXAMPLES =====

/**
 * Example: Type-safe supplier query
 */
export type ExampleSupplierQuery = {
  request: SupplierQueryRequest;
  response: SupplierQueryResponse;
  usage: `
    const queryRequest: SupplierQueryRequest = {
      select: ['name', 'region', 'status', 'dropship'],
      where: {
        op: LogicalOperator.AND,
        conditions: [
          { key: 'status', op: ComparisonOperator.EQUALS, val: 'active' }
        ]
      },
      orderBy: [{ key: 'name', direction: 'asc' }],
      limit: 25
    };
    
    const response = await fetch('/api/suppliers/123', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(queryRequest)
    });
    
    const result: SupplierQueryResponse = await response.json();
  `;
};

/**
 * Example: Type-safe supplier update
 */
export type ExampleSupplierUpdate = {
  request: UpdateSupplierRequest;
  response: UpdateSupplierResponse;
  usage: `
    const updateRequest: UpdateSupplierRequest = {
      name: 'Updated Supplier Name',
      status: 'active',
      dropship: true
    };
    
    const response = await fetch('/api/suppliers/123', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updateRequest)
    });
    
    const result: UpdateSupplierResponse = await response.json();
    
    if (isApiSuccess(result)) {
      console.log('Updated supplier:', result.supplier.name);
    } else {
      console.error('Update failed:', result.message);
      if (hasValidationErrors(result)) {
        console.error('Validation errors:', result.errors);
      }
    }
  `;
};

/**
 * Example: Type-safe supplier deletion with dependency handling
 */
export type ExampleSupplierDelete = {
  response: DeleteSupplierResponse;
  usage: `
    // First attempt: normal delete
    let response = await fetch('/api/suppliers/123', { method: 'DELETE' });
    let result: DeleteSupplierResponse = await response.json();
    
    if (isDeleteConflict(result)) {
      // Supplier has dependencies, ask user about cascade delete
      const cascadeConfirmed = await confirm(
        \`Supplier has dependencies: \${result.dependencies.join(', ')}. Delete anyway?\`
      );
      
      if (cascadeConfirmed) {
        // Perform cascade delete
        response = await fetch('/api/suppliers/123?cascade=true', { method: 'DELETE' });
        result = await response.json();
      }
    }
    
    if (isApiSuccess(result)) {
      console.log('Supplier deleted:', result.deleted_supplier.name);
      console.log('Dependencies cleared:', result.dependencies_cleared);
    }
  `;
};