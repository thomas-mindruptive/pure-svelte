// src/lib/api/types/appSpecific.ts

/**
 * @file App-Specific API Types
 * @description Defines the explicit, fully-typed API response shapes for the SupplierBrowser application.
 * This provides a clear contract of "what you get" for each API operation.
 */

import type { 
    Wholesaler, 
    WholesalerCategory_Category, 
    ProductCategory, 
    WholesalerItemOffering 
} from '$lib/domain/domainTypes';
import type { DeleteSuccessResponse, DeleteConflictResponse, ApiErrorResponse } from '../api.types';

// =================================================================
// OPERATION: deleteSupplier
// =================================================================

/** The shape of the `deleted_resource` payload on successful supplier deletion. */
type DeletedSupplierData = Pick<Wholesaler, 'wholesaler_id' | 'name'>;

/** The exact success response for deleting a supplier. */
export type DeleteSupplierSuccessResponse = DeleteSuccessResponse<DeletedSupplierData>;

/** The dependency structure for a supplier deletion conflict. */
type SupplierDependencies = string[];

/** The exact conflict response for deleting a supplier. */
export type DeleteSupplierConflictResponse = DeleteConflictResponse<SupplierDependencies>;

/** The complete, explicit response union for the `deleteSupplier` operation. */
export type DeleteSupplierApiResponse = 
  | DeleteSupplierSuccessResponse 
  | DeleteSupplierConflictResponse
  | ApiErrorResponse;


// =================================================================
// OPERATION: removeCategoryFromSupplier
// =================================================================

/** The shape of the `deleted_resource` payload on successful category assignment removal. */
type DeletedSupplierCategoryData = Pick<WholesalerCategory_Category, 'wholesaler_id' | 'category_id' | 'category_name'>;

/** The exact success response for removing a category assignment. */
export type RemoveCategorySuccessResponse = DeleteSuccessResponse<DeletedSupplierCategoryData>;

/** The dependency structure for a category assignment removal conflict. */
type SupplierCategoryDependencies = { offering_count: number };

/** The exact conflict response for removing a category assignment. */
export type RemoveCategoryConflictResponse = DeleteConflictResponse<SupplierCategoryDependencies>;

/** The complete, explicit response union for the `removeCategoryFromSupplier` operation. */
export type RemoveCategoryApiResponse = 
  | RemoveCategorySuccessResponse
  | RemoveCategoryConflictResponse
  | ApiErrorResponse;


// =================================================================
// OPERATION: deleteCategory
// =================================================================

/** The shape of the `deleted_resource` payload on successful category deletion. */
type DeletedCategoryData = Pick<ProductCategory, 'category_id' | 'name'>;

/** The exact success response for deleting a category. */
export type DeleteCategorySuccessResponse = DeleteSuccessResponse<DeletedCategoryData>;

/** The dependency structure for a category deletion conflict. */
type CategoryDependencies = string[];

/** The exact conflict response for deleting a category. */
export type DeleteCategoryConflictResponse = DeleteConflictResponse<CategoryDependencies>;

/** The complete, explicit response union for the `deleteCategory` operation. */
export type DeleteCategoryApiResponse = 
  | DeleteCategorySuccessResponse
  | DeleteCategoryConflictResponse
  | ApiErrorResponse;


// =================================================================
// OPERATION: deleteOffering
// =================================================================

/** The shape of the `deleted_resource` payload on successful offering deletion. */
type DeletedOfferingData = Pick<WholesalerItemOffering, 'offering_id'>;

/** The exact success response for deleting an offering. */
export type DeleteOfferingSuccessResponse = DeleteSuccessResponse<DeletedOfferingData>;

/** The dependency structure for an offering deletion conflict. */
type OfferingDependencies = string[];

/** The exact conflict response for deleting an offering. */
export type DeleteOfferingConflictResponse = DeleteConflictResponse<OfferingDependencies>;

/** The complete, explicit response union for the `deleteOffering` operation. */
export type DeleteOfferingApiResponse =
  | DeleteOfferingSuccessResponse
  | DeleteOfferingConflictResponse
  | ApiErrorResponse;