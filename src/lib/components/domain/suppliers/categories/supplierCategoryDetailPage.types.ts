// src/lib/pages/categories/categoryDetailPage.types.ts

/**
 * @file Type definitions for the Category Detail Page.
 * @description Defines the data structures based on the efficient, join-based loading strategy.
 */

import { z } from 'zod';
import {
	WholesalerCategory_CategorySchema,
	WholesalerItemOffering_ProductDef_Category_SupplierSchema
} from '$lib/domain/domainTypes';
import type { PromisifyComplex } from '$lib/utils/typeUtils';


/**
 * Defines the schema for the fully resolved data required by the Category Detail Page.
 * This schema is used to validate the data after all promises from the `load` function
 * have been resolved in the component.
 */
export const SupplierCategoryDetailPage_LoadDataSchema = z.object({
	/**
	 * Contains all details for the page header, loaded in a single API call.
	 * This includes category name, description, and assignment-specific data like comments.
	 * Can be null if the assignment is not found.
	 */
	assignmentDetails: WholesalerCategory_CategorySchema.nullable(),

	/**
	 * The list of offerings for this specific supplier and category.
	 */
	offerings: z.array(WholesalerItemOffering_ProductDef_Category_SupplierSchema)
});

// --- TypeScript Type Exports ---

/**
 * The type representing the final, resolved data structure for the page,
 * inferred directly from the Zod schema for consistency.
 */
export type SupplierCategoryDetailPage_LoadData = z.infer<typeof SupplierCategoryDetailPage_LoadDataSchema>;

/**
 * The asynchronous version of the load data, where complex object properties are Promises.
 * This is the exact type that the `load` function will return.
 */
export type SupplierCategoryDetailPage_LoadDataAsync = PromisifyComplex<SupplierCategoryDetailPage_LoadData>;