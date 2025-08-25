// $lib/api/client/category.ts

/**
 * Category API Client Functions
 * 
 * @description Type-safe client functions for all category-related API operations.
 * Handles category listing, supplier-category assignments/removals with comprehensive
 * error handling and loading state management.
 * 
 * @features
 * - QueryBuilder integration for flexible category data loading
 * - Type-safe request/response handling with shared API types
 * - Category assignment and removal with dependency checking
 * - Loading state management with categoryLoadingState
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

import type {
  ListCategoriesParams,
  ListCategoriesResponse,
  AssignCategoryRequest,
  AssignCategoryResponse,
  RemoveCategoryRequest,
  RemoveCategoryResponse,
  SupplierCategoriesParams,
  SupplierCategoriesResponse,
  UpdateCategoryAssignmentRequest,
  UpdateCategoryAssignmentResponse,
} from '$lib/api/types/category';
import {
  isCategoryApiSuccess,
  isRemoveConflict,
  hasCategoryValidationErrors
} from '$lib/api/types/category';
import type { ProductCategory, WholesalerCategory_Category } from '$lib/domain/types';

// ===== LOADING STATE MANAGER =====

export const categoryLoadingState = new LoadingState();

// ===== CATEGORY LIST OPERATIONS =====


/**
 * Loads available categories with filtering options
 * 
 * @param params - Query parameters for filtering and pagination
 * @param options - Additional loading options
 * @returns Promise resolving to array of categories
 * @throws ApiError with structured error information
 * 
 * @example
 * ```typescript
 * // Load categories not assigned to supplier 123
 * const available = await loadAvailableCategories({
 *   excludeSupplier: 123,
 *   search: 'electronics',
 *   limit: 50
 * });
 * ```
 */
export async function loadAvailableCategories(
  params: ListCategoriesParams = {},
  options: { useRetry?: boolean; operationId?: string } = {}
): Promise<ProductCategory[]> {
  const { useRetry = true, operationId = 'loadAvailableCategories' } = options;
  
  categoryLoadingState.start(operationId);
  
  try {
    log.info("Loading available categories", {
      excludeSupplier: params.excludeSupplier,
      onlySupplier: params.onlySupplier,
      search: params.search,
      limit: params.limit,
      useRetry
    });

    // Build query parameters
    const queryString = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');

    const url = `/api/categories${queryString ? `?${queryString}` : ''}`;
    
    const fetchFn = useRetry ? apiFetchWithRetry : apiFetch;
    
    const response = await fetchFn<ListCategoriesResponse>(
      url,
      { method: 'GET' },
      { context: 'loadAvailableCategories' }
    );

    if (!isCategoryApiSuccess(response)) {
      throw new Error(response.message || 'Failed to load categories');
    }

    log.info("Categories loaded successfully", {
      count: response.categories.length,
      total: response.meta.total,
      operationId
    });

    return response.categories;

  } catch (error) {
    log.error("Failed to load categories", {
      error: getErrorMessage(error),
      operationId,
      params
    });
    throw error;
  } finally {
    categoryLoadingState.finish(operationId);
  }
}

/**
 * Loads all categories in the system (convenience function)
 * 
 * @returns Promise resolving to array of all categories
 */
export async function loadAllCategories(): Promise<ProductCategory[]> {
  return loadAvailableCategories({
    limit: 1000 // High limit to get all categories
  }, { operationId: 'loadAllCategories' });
}

// ===== SUPPLIER-CATEGORY ASSIGNMENT OPERATIONS =====

/**
 * Assigns a category to a supplier
 * Creates a new wholesaler_categories relationship
 * 
 * @param request - Assignment request data
 * @returns Promise resolving to assignment details
 * @throws ApiError if assignment fails or validation errors occur
 * 
 * @example
 * ```typescript
 * const assignment = await assignCategoryToSupplier({
 *   supplierId: 123,
 *   categoryId: 456,
 *   comment: 'High priority category',
 *   link: 'https://example.com/category-info'
 * });
 * ```
 */
export async function assignCategoryToSupplier(
  request: AssignCategoryRequest
): Promise<WholesalerCategory_Category> {
  if (!request.supplierId || request.supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  if (!request.categoryId || request.categoryId <= 0) {
    throw new Error('Invalid category ID provided');
  }

  const operationId = `assignCategory-${request.supplierId}-${request.categoryId}`;
  categoryLoadingState.start(operationId);

  try {
    log.info("Assigning category to supplier", { 
      supplierId: request.supplierId,
      categoryId: request.categoryId,
      hasComment: !!request.comment,
      hasLink: !!request.link,
      operationId 
    });

    const response = await apiFetch<AssignCategoryResponse>(
      '/api/supplier-categories',
      {
        method: 'POST',
        body: createPostBody(request)
      },
      { context: `assignCategory-${request.supplierId}-${request.categoryId}` }
    );

    if (!isCategoryApiSuccess(response)) {
      if (hasCategoryValidationErrors(response)) {
        log.warn("Category assignment validation failed", {
          supplierId: request.supplierId,
          categoryId: request.categoryId,
          errors: response.errors
        });
      }
      throw new Error(response.message || 'Assignment failed');
    }

    log.info("Category assigned successfully", {
      supplierId: request.supplierId,
      categoryId: request.categoryId,
      supplierName: response.meta.supplier_name,
      categoryName: response.meta.category_name,
      operationId
    });

    return response.assignment;

  } catch (error) {
    log.error("Failed to assign category to supplier", {
      supplierId: request.supplierId,
      categoryId: request.categoryId,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    categoryLoadingState.finish(operationId);
  }
}

/**
 * Removes a category assignment from a supplier
 * Handles dependency checking and cascade delete workflow
 * 
 * @param request - Removal request data
 * @returns Promise resolving to removal result
 * @throws ApiError if removal fails
 * 
 * @example
 * ```typescript
 * try {
 *   // First attempt: normal removal
 *   const result = await removeCategoryFromSupplier({
 *     supplierId: 123,
 *     categoryId: 456,
 *     cascade: false
 *   });
 *   
 *   if (result.success) {
 *     console.log('Category removed:', result.removed_assignment.category_name);
 *   }
 * } catch (error) {
 *   // Check if removal failed due to dependencies
 *   if (error.response && isRemoveConflict(error.response)) {
 *     const confirmed = confirm(`Has dependencies. Perform cascade delete?`);
 *     if (confirmed) {
 *       // Retry with cascade delete
 *       const cascadeResult = await removeCategoryFromSupplier({
 *         supplierId: 123,
 *         categoryId: 456,
 *         cascade: true
 *       });
 *     }
 *   }
 * }
 * ```
 */
export async function removeCategoryFromSupplier(
  request: RemoveCategoryRequest
): Promise<RemoveCategoryResponse> {
  if (!request.supplierId || request.supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  if (!request.categoryId || request.categoryId <= 0) {
    throw new Error('Invalid category ID provided');
  }

  const operationId = `removeCategory-${request.supplierId}-${request.categoryId}`;
  categoryLoadingState.start(operationId);

  try {
    log.info("Removing category from supplier", { 
      supplierId: request.supplierId,
      categoryId: request.categoryId,
      cascade: request.cascade || false,
      operationId 
    });

    const response = await apiFetch<RemoveCategoryResponse>(
      '/api/supplier-categories',
      {
        method: 'DELETE',
        body: createPostBody(request)
      },
      { context: `removeCategory-${request.supplierId}-${request.categoryId}` }
    );

    // Handle successful removal
    if (isCategoryApiSuccess(response)) {
      log.info("Category removed successfully", {
        supplierId: request.supplierId,
        categoryId: request.categoryId,
        cascade: response.cascade_performed,
        offeringsRemoved: response.offerings_removed,
        operationId
      });
      
      return response;
    }

    // Handle dependency conflicts (409 responses don't throw, need manual check)
    if (isRemoveConflict(response)) {
      log.info("Category removal blocked by dependencies", {
        supplierId: request.supplierId,
        categoryId: request.categoryId,
        offeringCount: response.dependencies.offering_count,
        cascadeAvailable: response.cascade_available,
        operationId
      });
      
      return response;
    }

    // Handle other non-success responses
    throw new Error(response.message || 'Category removal failed');

  } catch (error) {
    log.error("Failed to remove category from supplier", {
      supplierId: request.supplierId,
      categoryId: request.categoryId,
      cascade: request.cascade,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    categoryLoadingState.finish(operationId);
  }
}

// ===== SUPPLIER'S CATEGORIES OPERATIONS =====

/**
 * Loads all categories assigned to a specific supplier
 * 
 * @param supplierId - Supplier ID to load categories for
 * @param params - Additional query parameters
 * @returns Promise resolving to supplier's assigned categories
 * 
 * @example
 * ```typescript
 * const categories = await loadSupplierCategories(123, {
 *   includeOfferingCounts: true,
 *   onlyWithOfferings: false
 * });
 * ```
 */
export async function loadSupplierCategories(
  supplierId: number,
  params: SupplierCategoriesParams = {}
): Promise<WholesalerCategory_Category[]> {
  if (!supplierId || supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  const operationId = `loadSupplierCategories-${supplierId}`;
  categoryLoadingState.start(operationId);

  try {
    log.info("Loading supplier categories", { 
      supplierId,
      includeOfferingCounts: params.includeOfferingCounts,
      params
    });

    // Build query parameters
    const queryString = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');

    const url = `/api/supplier-categories/${supplierId}${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiFetch<SupplierCategoriesResponse>(
      url,
      { method: 'GET' },
      { context: `loadSupplierCategories-${supplierId}` }
    );

    if (!isCategoryApiSuccess(response)) {
      throw new Error(response.message || 'Failed to load supplier categories');
    }

    log.info("Supplier categories loaded successfully", {
      supplierId,
      categoryCount: response.categories.length,
      totalOfferings: response.meta.total_offerings,
      operationId
    });

    return response.categories;

  } catch (error) {
    log.error("Failed to load supplier categories", {
      supplierId,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    categoryLoadingState.finish(operationId);
  }
}

/**
 * Updates a category assignment (comment, link)
 * 
 * @param assignmentId - Assignment ID to update
 * @param updates - Fields to update
 * @returns Promise resolving to updated assignment
 */
export async function updateCategoryAssignment(
  assignmentId: number,
  updates: UpdateCategoryAssignmentRequest
): Promise<WholesalerCategory_Category> {
  if (!assignmentId || assignmentId <= 0) {
    throw new Error('Invalid assignment ID provided');
  }

  if (!updates || Object.keys(updates).length === 0) {
    throw new Error('No updates provided');
  }

  const operationId = `updateCategoryAssignment-${assignmentId}`;
  categoryLoadingState.start(operationId);

  try {
    log.info("Updating category assignment", { 
      assignmentId,
      fields: Object.keys(updates),
      operationId 
    });

    const response = await apiFetch<UpdateCategoryAssignmentResponse>(
      `/api/supplier-categories/${assignmentId}`,
      {
        method: 'PUT',
        body: createPostBody(updates)
      },
      { context: `updateCategoryAssignment-${assignmentId}` }
    );

    if (!isCategoryApiSuccess(response)) {
      throw new Error(response.message || 'Update failed');
    }

    log.info("Category assignment updated successfully", {
      assignmentId,
      operationId
    });

    return response.assignment;

  } catch (error) {
    log.error("Failed to update category assignment", {
      assignmentId,
      updates,
      error: getErrorMessage(error),
      operationId
    });
    throw error;
  } finally {
    categoryLoadingState.finish(operationId);
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Gets categories available for assignment to a supplier
 * (all categories minus already assigned ones)
 * 
 * @param supplierId - Supplier ID
 * @returns Promise resolving to available categories
 */
export async function getAvailableCategoriesForSupplier(supplierId: number): Promise<ProductCategory[]> {
  if (!supplierId || supplierId <= 0) {
    throw new Error('Invalid supplier ID provided');
  }

  return loadAvailableCategories({
    excludeSupplier: supplierId,
    limit: 1000
  });
}

/**
 * Searches categories by name with partial matching
 * 
 * @param searchTerm - Text to search for in category names
 * @param limit - Maximum number of results
 * @returns Promise resolving to matching categories
 */
export async function searchCategories(
  searchTerm: string,
  limit: number = 50
): Promise<ProductCategory[]> {
  if (!searchTerm?.trim()) {
    return [];
  }

  const operationId = 'searchCategories';
  
  try {
    return await loadAvailableCategories({
      search: searchTerm.trim(),
      limit
    }, { operationId });
    
  } catch (error) {
    log.error("Failed to search categories", {
      searchTerm,
      limit,
      error: getErrorMessage(error)
    });
    throw error;
  }
}

// ===== LOADING STATE HELPERS =====

/**
 * Checks if any category operation is currently loading
 */
export function isLoadingCategories(): boolean {
  return categoryLoadingState.isLoading;
}

/**
 * Checks if specific category operation is loading
 */
export function isCategoryOperationLoading(operationId: string): boolean {
  return categoryLoadingState.isOperationLoading(operationId);
}

/**
 * Subscribe to category loading state changes
 * Returns unsubscribe function
 */
export function onCategoryLoadingChange(callback: () => void): () => void {
  return categoryLoadingState.subscribe(callback);
}