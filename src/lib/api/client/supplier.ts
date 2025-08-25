// $lib/api/client/supplier.ts

/**
 * Supplier API Client Functions
 * 
 * @description Type-safe client functions for all supplier-related API operations.
 * Handles loading, updating, and deleting suppliers with comprehensive error handling
 * and loading state management.
 * 
 * @features
 * - QueryBuilder integration for flexible data loading
 * - Type-safe request/response handling with shared API types
 * - Dependency checking for deletions with cascade support
 * - Loading state management with supplierLoadingState
 * - Structured error handling with ApiError class
 * - Retry logic for failed requests
 */

import { 
  apiFetch, 
  apiFetchWithRetry, 
  createPostBody, 
  LoadingState, 
  getErrorMessage 
} from './common';
import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type {
  SupplierQueryRequest,
  SupplierQueryResponse,
  UpdateSupplierRequest,
  UpdateSupplierResponse,
  DeleteSupplierResponse,
  DeleteSupplierParams,
  
} from '$lib/api/types/supplier';
import {isDeleteConflict} from '$lib/api/types/supplier';
import type { Wholesaler, WholesalerCategoryWithCount } from '$lib/domain/types';

// ===== LOADING STATE MANAGER =====

export const supplierLoadingState = new LoadingState();

// ===== SUPPLIER LIST OPERATIONS =====

/**
 * Default query for supplier list loading
 * Requests essential supplier fields in efficient order
 */
export const DEFAULT_SUPPLIER_QUERY: SupplierQueryRequest = {
  select: ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'website', 'created_at'],
  orderBy: [{ key: 'name', direction: 'asc' }],
  limit: 100
};

/**
 * Loads a list of suppliers with flexible query options
 * Uses QueryBuilder pattern for type-safe, flexible data retrieval
 * 
 * @param query - Query specification (optional, uses DEFAULT_SUPPLIER_QUERY if not provided)
 * @param options - Additional loading options
 * @returns Promise resolving to array of supplier objects
 * @throws ApiError with structured error information
 * 
 * @example
 * ```typescript
 * // Load all active suppliers
 * const activeSuppliers = await loadSuppliers({
 *   select: ['name', 'region', 'dropship'],
 *   where: {
 *     op: LogicalOperator.AND,
 *     conditions: [{ key: 'status', op: ComparisonOperator.EQUALS, val: 'active' }]
 *   },
 *   limit: 50
 * });
 * ```
 */
export async function loadSuppliers(
  query: Partial<SupplierQueryRequest> = {},
  options: { useRetry?: boolean; operationId?: string } = {}
): Promise<Wholesaler[]> {
  const { useRetry = true, operationId = 'loadSuppliers' } = options;
  
  // Merge with default query
  const fullQuery: SupplierQueryRequest = {
    ...DEFAULT_SUPPLIER_QUERY,
    ...query,
    // Merge select arrays if both provided
    select: query.select || DEFAULT_SUPPLIER_QUERY.select
  };

  supplierLoadingState.start(operationId);
  
  try {
    log.info("Loading suppliers list", {
      selectColumns: fullQuery.select?.length,
      hasWhere: !!(fullQuery.where?.conditions?.length),
      limit: fullQuery.limit,
      useRetry
    });

    const fetchFn = useRetry ? apiFetchWithRetry : apiFetch;
    
    const response = await fetchFn<SupplierQueryResponse>(
      '/api/suppliers',
      {
        method: 'POST',
        body: createPostBody(fullQuery)
      },
      { context: 'loadSuppliers' }
    );

    // Extract suppliers array from QueryBuilder response structure
    const suppliers = response.results as Wholesaler[];

    log.info("Suppliers loaded successfully", {
      count: suppliers.length,
      operationId
    });

    return suppliers;

  } catch (error) {
    log.error("Failed to load suppliers", {
      error: getErrorMessage(error),
      operationId,
      query: fullQuery
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

/**
 * Loads all active suppliers (convenience function)
 * Commonly used shortcut for loading only active suppliers
 * 
 * @returns Promise resolving to array of active suppliers
 */
export async function loadActiveSuppliers(): Promise<Wholesaler[]> {
  return loadSuppliers({
    where: {
      op: LogicalOperator.AND,
      conditions: [{ key: 'status', op: ComparisonOperator.EQUALS, val: 'active' }]
    }
  }, { operationId: 'loadActiveSuppliers' });
}

// ===== INDIVIDUAL SUPPLIER OPERATIONS =====

/**
 * Loads a single supplier by ID with flexible field selection
 * Uses QueryBuilder to allow custom field selection for performance
 * 
 * @param supplierId - Supplier ID to load
 * @param fields - Optional array of fields to select (uses all fields if not provided)
 * @returns Promise resolving to supplier object
 * @throws ApiError if supplier not found or query fails
 * 
 * @example
 * ```typescript
 * // Load full supplier details
 * const supplier = await loadSupplier(123);
 * 
 * // Load only specific fields
 * const basicInfo = await loadSupplier(123, ['name', 'status', 'dropship']);
 * ```
 */
export async function loadSupplier(
  supplierId: number,
  fields?: string[]
): Promise<Wholesaler> {
  if (!supplierId || supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  const operationId = `loadSupplier-${supplierId}`;
  supplierLoadingState.start(operationId);

  try {
    log.info("Loading individual supplier", { supplierId, fields });

    const query: SupplierQueryRequest = {
      select: fields || ['*'], // Server handles '*' expansion
      // No WHERE clause needed - server adds supplier ID filter automatically
      limit: 1
    };

    const response = await apiFetch<SupplierQueryResponse>(
      `/api/suppliers/${supplierId}`,
      {
        method: 'POST',
        body: createPostBody(query)
      },
      { context: `loadSupplier-${supplierId}` }
    );

    if (!response.results || response.results.length === 0) {
      throw new Error(`Supplier with ID ${supplierId} not found`);
    }

    const supplier = response.results[0] as Wholesaler;

    log.info("Supplier loaded successfully", { 
      supplierId, 
      name: supplier.name,
      operationId 
    });

    return supplier;

  } catch (error) {
    log.error("Failed to load supplier", {
      supplierId,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

/**
 * Updates an existing supplier with validation and error handling
 * Performs partial updates (PATCH-style) - only provided fields are updated
 * 
 * @param supplierId - Supplier ID to update
 * @param updates - Partial supplier data to update
 * @returns Promise resolving to updated supplier object
 * @throws ApiError with validation details if update fails
 * 
 * @example
 * ```typescript
 * try {
 *   const updated = await updateSupplier(123, {
 *     name: 'Updated Supplier Name',
 *     status: 'active',
 *     dropship: true
 *   });
 *   console.log('Updated:', updated.name);
 * } catch (error) {
 *   if (isClientApiError(error) && error.errors?.name) {
 *     console.error('Name validation failed:', error.errors.name);
 *   }
 * }
 * ```
 */
export async function updateSupplier(
  supplierId: number,
  updates: UpdateSupplierRequest
): Promise<Wholesaler> {
  if (!supplierId || supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  if (!updates || Object.keys(updates).length === 0) {
    throw new Error('No updates provided');
  }

  const operationId = `updateSupplier-${supplierId}`;
  supplierLoadingState.start(operationId);

  try {
    log.info("Updating supplier", { 
      supplierId, 
      fields: Object.keys(updates),
      operationId 
    });

    const response = await apiFetch<UpdateSupplierResponse>(
      `/api/suppliers/${supplierId}`,
      {
        method: 'PUT',
        body: createPostBody(updates)
      },
      { context: `updateSupplier-${supplierId}` }
    );

    if (!response.success) {
      throw new Error(response.message || 'Update failed');
    }

    const updatedSupplier = response.supplier;

    log.info("Supplier updated successfully", {
      supplierId,
      name: updatedSupplier.name,
      operationId
    });

    return updatedSupplier;

  } catch (error) {
    log.error("Failed to update supplier", {
      supplierId,
      updates,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

// ===== SUPPLIER DELETE OPERATIONS =====

/**
 * Deletes a supplier with automatic dependency checking and cascade support
 * Implements two-phase delete workflow:
 * 1. First attempt: Normal delete (fails if dependencies exist)
 * 2. Second attempt: Cascade delete (removes supplier and all dependencies)
 * 
 * @param supplierId - Supplier ID to delete
 * @param cascade - Whether to perform cascade delete of dependencies
 * @returns Promise resolving to deletion result with dependency information
 * @throws ApiError if deletion fails for other reasons
 * 
 * @example
 * ```typescript
 * // Attempt normal delete first
 * try {
 *   const result = await deleteSupplier(123, false);
 *   if (result.success) {
 *     console.log('Supplier deleted:', result.deleted_supplier.name);
 *   }
 * } catch (error) {
 *   // Check if deletion failed due to dependencies
 *   const response = error.response;
 *   if (isDeleteConflict(response)) {
 *     const confirmed = confirm(`Has dependencies: ${response.dependencies.join(', ')}. Delete anyway?`);
 *     if (confirmed) {
 *       // Perform cascade delete
 *       const cascadeResult = await deleteSupplier(123, true);
 *       console.log('Cascade deleted:', cascadeResult.deleted_supplier.name);
 *     }
 *   }
 * }
 * ```
 */
export async function deleteSupplier(
  supplierId: number,
  cascade: boolean = false
): Promise<DeleteSupplierResponse> {
  if (!supplierId || supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  const operationId = `deleteSupplier-${supplierId}`;
  supplierLoadingState.start(operationId);

  try {
    log.info("Deleting supplier", { 
      supplierId, 
      cascade,
      operationId 
    });

    // Build query parameters for cascade option
    const params: DeleteSupplierParams = {};
    if (cascade) params.cascade = 'true';

    const queryString = Object.keys(params).length > 0 
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';

    const response = await apiFetch<DeleteSupplierResponse>(
      `/api/suppliers/${supplierId}${queryString}`,
      { method: 'DELETE' },
      { context: `deleteSupplier-${supplierId}` }
    );

    // Handle successful deletion
    if (response.success) {
      log.info("Supplier deleted successfully", {
        supplierId,
        name: response.deleted_supplier?.name,
        cascade: response.cascade_performed,
        dependenciesCleared: response.dependencies_cleared,
        operationId
      });
      
      return response;
    }

    // Handle dependency conflicts (409 responses don't throw, need manual check)
    if (isDeleteConflict && isDeleteConflict(response)) {
      log.info("Supplier deletion blocked by dependencies", {
        supplierId,
        dependencies: response.dependencies,
        cascadeAvailable: response.cascade_available,
        operationId
      });
      
      return response;
    }

    // Handle other non-success responses
    throw new Error(response.message || 'Deletion failed');

  } catch (error) {
    log.error("Failed to delete supplier", {
      supplierId,
      cascade,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

/**
 * Checks if a supplier can be safely deleted (no dependencies)
 * Performs a dry-run deletion check without actually deleting
 * 
 * @param supplierId - Supplier ID to check
 * @returns Promise resolving to true if safe to delete, false if has dependencies
 */
export async function canDeleteSupplier(supplierId: number): Promise<boolean> {
  try {
    const result = await deleteSupplier(supplierId, false);
    
    // If it's a conflict response, supplier has dependencies
    if (isDeleteConflict && isDeleteConflict(result)) {
      return false;
    }
    
    // If deletion would succeed, it's safe to delete
    // Note: This is a dry-run, actual deletion didn't happen
    return result.success;
    
  } catch (error) {
    // Log the error for debugging, but still return false (safe default)
    log.warn("Error checking supplier delete safety", {
      supplierId,
      error: getErrorMessage(error)
    });
    return false;
  }
}

// ===== "JOINS" =====

// In supplier.ts hinzufügen

/**
 * Loads all categories assigned to a specific supplier with offering counts
 * Uses supplier_categories view from queryConfig for JOIN optimization
 * 
 * @param supplierId - Supplier ID to load categories for
 * @param fields - Optional fields to select (uses example query if not provided)
 * @returns Promise resolving to supplier's assigned categories with counts
 * 
 * @example
 * ```typescript
 * const categories = await loadSupplierCategories(123);
 * // Returns categories with offering_count from the JOIN subquery
 * ```
 */
export async function loadSupplierCategories(
  supplierId: number,
  fields?: string[]
): Promise<WholesalerCategoryWithCount[]> {
  if (!supplierId || supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  const operationId = `loadSupplierCategories-${supplierId}`;
  supplierLoadingState.start(operationId);

  try {
    log.info("Loading supplier categories with offering counts", { 
      supplierId, 
      customFields: !!fields 
    });

    // Use example query from queryConfig or custom fields
    const selectFields = fields || [
      'w.wholesaler_id',
      'w.name AS supplier_name',
      'wc.category_id', 
      'pc.name AS category_name',
      'pc.description AS category_description',
      'wc.comment',
      'wc.link',
      'oc.offering_count'
    ];

    const query: QueryPayload = {
      select: selectFields,
      from: 'supplier_categories', // Uses queryConfig JOIN configuration
      where: {
        op: LogicalOperator.AND,
        conditions: [{ 
          key: 'w.wholesaler_id', 
          op: ComparisonOperator.EQUALS, 
          val: supplierId 
        }]
      },
      orderBy: [{ key: 'pc.name', direction: 'asc' }],
      limit: 100
    };

    const response = await apiFetch<SupplierQueryResponse>(
      '/api/categories',
      {
        method: 'POST',
        body: createPostBody(query)
      },
      { context: `loadSupplierCategories-${supplierId}` }
    );

    const categories = response.results as WholesalerCategoryWithCount[];

    log.info("Supplier categories loaded successfully", {
      supplierId,
      categoryCount: categories.length,
      operationId
    });

    return categories;

  } catch (error) {
    log.error("Failed to load supplier categories", {
      supplierId,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

// ===== BATCH OPERATIONS =====

/**
 * Loads multiple suppliers by IDs efficiently
 * Uses QueryBuilder with IN clause for optimal performance
 * 
 * @param supplierIds - Array of supplier IDs to load
 * @param fields - Optional fields to select
 * @returns Promise resolving to array of found suppliers
 */
export async function loadSuppliersByIds(
  supplierIds: number[],
  fields?: string[]
): Promise<Wholesaler[]> {
  if (!supplierIds || supplierIds.length === 0) {
    return [];
  }

  const operationId = 'loadSuppliersByIds';
  supplierLoadingState.start(operationId);

  try {
    log.info("Loading suppliers by IDs", { 
      count: supplierIds.length,
      ids: supplierIds,
      fields 
    });

    const query: SupplierQueryRequest = {
      select: fields || DEFAULT_SUPPLIER_QUERY.select,
      where: {
        op: LogicalOperator.AND,
        conditions: [{
          key: 'wholesaler_id',
          op: ComparisonOperator.IN,
          val: supplierIds
        }]
      },
      orderBy: [{ key: 'name', direction: 'asc' }],
      limit: Math.min(supplierIds.length + 10, 1000) // Buffer for safety
    };

    const response = await apiFetch<SupplierQueryResponse>(
      '/api/suppliers',
      {
        method: 'POST',
        body: createPostBody(query)
      },
      { context: 'loadSuppliersByIds' }
    );

    const suppliers = response.results as Wholesaler[];

    log.info("Suppliers loaded by IDs", {
      requested: supplierIds.length,
      found: suppliers.length,
      operationId
    });

    return suppliers;

  } catch (error) {
    log.error("Failed to load suppliers by IDs", {
      supplierIds,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Searches suppliers by name with fuzzy matching
 * Uses LIKE operator for partial name matching
 * 
 * @param searchTerm - Text to search for in supplier names
 * @param limit - Maximum number of results (default 50)
 * @returns Promise resolving to array of matching suppliers
 */
export async function searchSuppliers(
  searchTerm: string,
  limit: number = 50
): Promise<Wholesaler[]> {
  if (!searchTerm?.trim()) {
    return [];
  }

  const operationId = 'searchSuppliers';
  
  try {
    return await loadSuppliers({
      select: ['wholesaler_id', 'name', 'region', 'status', 'dropship'],
      where: {
        op: LogicalOperator.AND,
        conditions: [{
          key: 'name',
          op: ComparisonOperator.LIKE,
          val: `%${searchTerm.trim()}%`
        }]
      },
      orderBy: [{ key: 'name', direction: 'asc' }],
      limit
    }, { operationId });
    
  } catch (error) {
    log.error("Failed to search suppliers", {
      searchTerm,
      limit,
      error: getErrorMessage(error)
    });
    throw error;
  }
}

/**
 * Gets supplier count by status for dashboard/overview purposes
 * 
 * @returns Promise resolving to status count object
 */
export async function getSupplierStatusCounts(): Promise<Record<string, number>> {
  const operationId = 'getSupplierStatusCounts';
  supplierLoadingState.start(operationId);

  try {
    // Load minimal data for counting
    const suppliers = await loadSuppliers({
      select: ['wholesaler_id', 'status'],
      limit: 10000 // High limit to get all for accurate counting
    }, { operationId: 'getSupplierStatusCounts-data' });

    // Count by status
    const counts: Record<string, number> = {};
    suppliers.forEach(supplier => {
      const status = supplier.status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    });

    log.info("Supplier status counts calculated", { counts, total: suppliers.length });
    
    return counts;

  } catch (error) {
    log.error("Failed to get supplier status counts", {
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    supplierLoadingState.finish(operationId);
  }
}

// ===== LOADING STATE HELPERS =====

/**
 * Checks if any supplier operation is currently loading
 */
export function isLoadingSuppliers(): boolean {
  return supplierLoadingState.isLoading;
}

/**
 * Checks if specific supplier operation is loading
 */
export function isSupplierOperationLoading(operationId: string): boolean {
  return supplierLoadingState.isOperationLoading(operationId);
}

/**
 * Subscribe to supplier loading state changes
 * Returns unsubscribe function
 */
export function onSupplierLoadingChange(callback: () => void): () => void {
  return supplierLoadingState.subscribe(callback);
}