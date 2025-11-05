// src/lib/pages/categories/categoryDetailPage.types.ts

/**
 * <refact01> CHANGED: No more assignmentDetails (wholesaler_categories removed)
 * @file Type definitions for the Supplier Category Detail Page.
 * @description Displays offerings for a specific supplier and category combination.
 */

import {
	ProductCategorySchema,
	Wio_PDef_Cat_Supp_Nested_WithLinks_Schema
} from '$lib/domain/domainTypes';
import type { PromisifyComplex } from '$lib/utils/typeUtils';
import { z } from 'zod';


/**
 * Defines the schema for the fully resolved data required by the Supplier Category Detail Page.
 * This schema is used to validate the data after all promises from the `load` function
 * have been resolved in the component.
 *
 * <refact01> CHANGED: No more assignmentDetails - now supplierId, categoryId, category, offerings
 */
export const SupplierCategoryDetailPage_LoadDataSchema = z.object({
	/**
	 * The supplier ID from route params (not a promise)
	 */
	supplierId: z.number(),

	/**
	 * The category ID from route params (not a promise)
	 */
	categoryId: z.number(),

	/**
	 * The category details for the page header (resolved from promise)
	 */
	category: ProductCategorySchema,

	/**
	 * The list of offerings for this specific supplier and category (resolved from promise)
	 */
	offerings: z.array(Wio_PDef_Cat_Supp_Nested_WithLinks_Schema)
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
 * Simple values (supplierId, categoryId) stay as-is, complex objects become Promises.
 */
export type SupplierCategoryDetailPage_LoadDataAsync = PromisifyComplex<SupplierCategoryDetailPage_LoadData>;
