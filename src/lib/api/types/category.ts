// src/lib/api/types/category.ts

/**
 * Category API Types - Category Assignment & Management
 * 
 * @description Complete type definitions for category-related API endpoints.
 * Handles supplier-category relationships (n:m) and category management operations.
 * 
 * @endpoints
 * - POST /api/supplier-categories - Assign category to supplier
 * - DELETE /api/supplier-categories - Remove category from supplier
 * - GET /api/categories - List all available categories
 * - PUT /api/supplier-categories/[id] - Update category assignment
 * 
 * @features
 * - Category assignment/removal with validation
 * - Dependency checking for category removal
 * - Available vs assigned category filtering
 * - Type-safe relationship management
 */

import type { 
  ProductCategory, 
  WholesalerCategory, 
  WholesalerCategory_Category,
  WholesalerCategoryWithCount 
} from '$lib/domain/types';

// ===== COMMON CATEGORY API TYPES =====

/**
 * Generic API success response structure
 */
export interface CategoryApiSuccessResponse extends Record<string, unknown> {
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
export interface CategoryApiErrorResponse extends Record<string, unknown> {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * Union type for category API responses
 */
export type CategoryApiResponse<TSuccess extends Record<string, unknown> = Record<string, unknown>> = 
  | (CategoryApiSuccessResponse & TSuccess)
  | CategoryApiErrorResponse;

// ===== GET /api/categories - LIST AVAILABLE CATEGORIES =====

/**
 * Query parameters for category list endpoint
 */
export interface ListCategoriesParams extends Record<string, unknown> {
  /** Number of categories to return (max 1000) */
  limit?: number;
  /** Number of categories to skip for pagination */
  offset?: number;
  /** Search term to filter category names */
  search?: string;
  /** Only return categories not assigned to specific supplier */
  excludeSupplier?: number;
  /** Only return categories assigned to specific supplier */
  onlySupplier?: number;
}

/**
 * Successful category list response
 */
export interface ListCategoriesSuccess extends Record<string, unknown> {
  /** Array of categories */
  categories: ProductCategory[];
  /** Pagination metadata */
  meta: {
    total: number;
    returned: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

/**
 * Response from category list endpoint
 */
export type ListCategoriesResponse = CategoryApiResponse<ListCategoriesSuccess>;

// ===== POST /api/supplier-categories - ASSIGN CATEGORY =====

/**
 * Request to assign a category to a supplier
 */
export interface AssignCategoryRequest extends Record<string, unknown> {
  /** Supplier ID to assign category to */
  supplierId: number;
  /** Category ID to assign */
  categoryId: number;
  /** Optional comment about the assignment */
  comment?: string;
  /** Optional link related to this category for the supplier */
  link?: string;
}

/**
 * Successful category assignment response
 */
export interface AssignCategorySuccess extends Record<string, unknown> {
  /** The created assignment record */
  assignment: WholesalerCategory;
  /** Assignment metadata */
  meta: {
    assigned_at: string;
    supplier_name: string;
    category_name: string;
  };
}

/**
 * Response from category assignment endpoint
 */
export type AssignCategoryResponse = CategoryApiResponse<AssignCategorySuccess>;

// ===== DELETE /api/supplier-categories - REMOVE CATEGORY =====

/**
 * Request to remove a category assignment
 */
export interface RemoveCategoryRequest extends Record<string, unknown> {
  /** Supplier ID */
  supplierId: number;
  /** Category ID to remove */
  categoryId: number;
  /** Whether to perform cascade delete of offerings */
  cascade?: boolean;
}

/**
 * Category assignment dependency information
 */
export interface CategoryDependencies extends Record<string, unknown> {
  /** Number of offerings that would be affected */
  offering_count: number;
  /** List of offering details that would be removed */
  affected_offerings?: Array<{
    offering_id: number;
    product_name?: string;
    price?: number;
  }>;
  /** Whether cascade delete is recommended */
  cascade_recommended: boolean;
}

/**
 * Response when category has dependencies (409 Conflict)
 */
export interface RemoveCategoryConflict extends Record<string, unknown> {
  success: false;
  message: string;
  /** Dependency information */
  dependencies: CategoryDependencies;
  /** Whether cascade delete is available */
  cascade_available: boolean;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * Successful category removal response
 */
export interface RemoveCategorySuccess extends Record<string, unknown> {
  /** Information about the removed assignment */
  removed_assignment: {
    supplier_id: number;
    category_id: number;
    supplier_name: string;
    category_name: string;
  };
  /** Whether cascade delete was performed */
  cascade_performed: boolean;
  /** Number of offerings removed (if cascade) */
  offerings_removed: number;
  /** Removal metadata */
  meta: {
    removed_at: string;
  };
}

/**
 * Response from category removal endpoint
 */
export type RemoveCategoryResponse = 
  | (CategoryApiSuccessResponse & RemoveCategorySuccess)
  | RemoveCategoryConflict
  | CategoryApiErrorResponse;

// ===== PUT /api/supplier-categories/[id] - UPDATE ASSIGNMENT =====

/**
 * Request to update a category assignment
 */
export interface UpdateCategoryAssignmentRequest extends Record<string, unknown> {
  /** Updated comment */
  comment?: string;
  /** Updated link */
  link?: string;
}

/**
 * Successful assignment update response
 */
export interface UpdateCategoryAssignmentSuccess extends Record<string, unknown> {
  /** Updated assignment record */
  assignment: WholesalerCategory_Category;
  /** Update metadata */
  meta: {
    updated_at: string;
  };
}

/**
 * Response from assignment update endpoint
 */
export type UpdateCategoryAssignmentResponse = CategoryApiResponse<UpdateCategoryAssignmentSuccess>;

// ===== GET /api/supplier-categories/[supplierId] - SUPPLIER'S CATEGORIES =====

/**
 * Query parameters for supplier's categories
 */
export interface SupplierCategoriesParams extends Record<string, unknown> {
  /** Include offering counts for each category */
  includeOfferingCounts?: boolean;
  /** Only return categories with offerings */
  onlyWithOfferings?: boolean;
  /** Search term to filter categories */
  search?: string;
}

/**
 * Successful supplier categories response
 */
export interface SupplierCategoriesSuccess extends Record<string, unknown> {
  /** Supplier information */
  supplier: {
    wholesaler_id: number;
    name: string;
  };
  /** Array of assigned categories with details */
  categories: WholesalerCategoryWithCount[];
  /** Category summary */
  meta: {
    total_categories: number;
    total_offerings: number;
    supplier_name: string;
  };
}

/**
 * Response from supplier categories endpoint
 */
export type SupplierCategoriesResponse = CategoryApiResponse<SupplierCategoriesSuccess>;

// ===== VALIDATION TYPES =====

/**
 * Validation errors for category operations
 */
export interface CategoryValidationErrors extends Record<string, string[]> {
  supplierId?: string[];
  categoryId?: string[];
  comment?: string[];
  link?: string[];
}

/**
 * Response for validation failures (400 Bad Request)
 */
export interface CategoryValidationError extends Record<string, unknown> {
  success: false;
  message: string;
  errors: CategoryValidationErrors;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

// ===== TYPE GUARDS =====

/**
 * Type guard to check if response is a success response
 */
export function isCategoryApiSuccess<T extends Record<string, unknown>>(
  response: CategoryApiResponse<T>
): response is CategoryApiSuccessResponse & T {
  return response.success === true;
}

/**
 * Type guard to check if response is an error response
 */
export function isCategoryApiError<T extends Record<string, unknown>>(
  response: CategoryApiResponse<T>
): response is CategoryApiErrorResponse {
  return response.success === false;
}

/**
 * Type guard to check if removal response is a conflict (has dependencies)
 */
export function isRemoveConflict(
  response: RemoveCategoryResponse
): response is RemoveCategoryConflict {
  return !response.success && 'cascade_available' in response;
}

/**
 * Type guard to check if response has validation errors
 */
export function hasCategoryValidationErrors<T extends Record<string, unknown>>(
  response: CategoryApiResponse<T>
): response is CategoryValidationError {
  return !response.success && 'errors' in response && typeof response.errors === 'object';
}

// ===== USAGE EXAMPLES =====

/**
 * Example: Type-safe category assignment
 */
export type ExampleCategoryAssignment = {
  request: AssignCategoryRequest;
  response: AssignCategoryResponse;
  usage: `
    const assignRequest: AssignCategoryRequest = {
      supplierId: 123,
      categoryId: 456,
      comment: 'High priority category for this supplier',
      link: 'https://example.com/category-info'
    };
    
    const response = await fetch('/api/supplier-categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(assignRequest)
    });
    
    const result: AssignCategoryResponse = await response.json();
    
    if (isCategoryApiSuccess(result)) {
      console.log('Category assigned:', result.assignment.category_name);
      console.log('To supplier:', result.meta.supplier_name);
    } else {
      console.error('Assignment failed:', result.message);
      if (hasCategoryValidationErrors(result)) {
        console.error('Validation errors:', result.errors);
      }
    }
  `;
};

/**
 * Example: Type-safe category removal with dependency handling
 */
export type ExampleCategoryRemoval = {
  request: RemoveCategoryRequest;
  response: RemoveCategoryResponse;
  usage: `
    // First attempt: normal removal
    let removeRequest: RemoveCategoryRequest = {
      supplierId: 123,
      categoryId: 456,
      cascade: false
    };
    
    let response = await fetch('/api/supplier-categories', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(removeRequest)
    });
    
    let result: RemoveCategoryResponse = await response.json();
    
    if (isRemoveConflict(result)) {
      // Category has offerings, ask user about cascade delete
      const cascadeConfirmed = await confirm(
        \`This category has \${result.dependencies.offering_count} offerings. Delete them too?\`
      );
      
      if (cascadeConfirmed) {
        // Perform cascade delete
        removeRequest.cascade = true;
        response = await fetch('/api/supplier-categories', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(removeRequest)
        });
        result = await response.json();
      }
    }
    
    if (isCategoryApiSuccess(result)) {
      console.log('Category removed from:', result.removed_assignment.supplier_name);
      if (result.cascade_performed) {
        console.log('Offerings removed:', result.offerings_removed);
      }
    }
  `;
};

/**
 * Example: Type-safe available categories fetch
 */
export type ExampleAvailableCategories = {
  params: ListCategoriesParams;
  response: ListCategoriesResponse;
  usage: `
    const params: ListCategoriesParams = {
      excludeSupplier: 123,  // Don't show categories already assigned to supplier 123
      search: 'electronics',
      limit: 50
    };
    
    const queryString = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    
    const response = await fetch(\`/api/categories?\${queryString}\`);
    const result: ListCategoriesResponse = await response.json();
    
    if (isCategoryApiSuccess(result)) {
      console.log('Available categories:', result.categories.length);
      console.log('Total available:', result.meta.total);
      
      // Use in dropdown
      result.categories.forEach(cat => {
        console.log(\`\${cat.category_id}: \${cat.name}\`);
      });
    }
  `;
};