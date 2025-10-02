// src/lib/pages/suppliers/supplierDetailPage.types.ts
/**
 * @file Type definitions for the Supplier Detail Page.
 * @description Defines the data structures for both the resolved data used by the Svelte component
 * and the asynchronous promise-based data returned by the `load` function.
 * This ensures type safety throughout the data-loading lifecycle.
 */

// --- Types ---



// --- Zod Schema ---

/**
 * Supplier detail, e.g. for SullierForm
 */
// export const SupplierDetail_LoadDataSchema = z.object({
// 	// The core supplier entity being displayed.
// 	// Optional for CREATE mode!
// 	supplier: z.optional(WholesalerSchema).nullable(),
// });

// export type SupplierDetail_LoadData = z.infer<typeof SupplierDetail_LoadDataSchema>;
// export type SupplierDetail_LoadDataAsync = PromisifyComplex<SupplierDetail_LoadData>;

// /**
//  * Defines the schema for the fully resolved data required by the Supplier Detail Page.
//  * This is used to validate the data shape after all promises from the `load` function have been resolved.
//  */
// export const SupplierDetailPage_LoadDataSchema = SupplierDetail_LoadDataSchema.extend({
// 	// The list of categories already assigned to this supplier, enriched with category details.
// 	assignedCategories: z.array(WholesalerCategory_CategorySchema),

// 	// The list of categories available for assignment to this supplier.
// 	availableCategories: z.array(ProductCategorySchema),

// 	// We render the page with different datagrids depending on the path we are on.
// 	activeChildPath: z.enum(ChildRelationshipsArray),

// 	// "New" route?
// 	isCreateMode: z.boolean(),
// });

// // --- ZOD => TypeScript Type Exports ---

// /**
//  * The type representing the final, resolved data structure for the page.
//  * This is inferred directly from the Zod schema to ensure consistency.
//  */
// export type SupplierDetailPage_LoadData = z.infer<typeof SupplierDetailPage_LoadDataSchema>;

// /**
//  * The asynchronous version of the load data, where complex properties are Promises.
//  * This is the exact type that the `load` function will return and the Svelte component
//  * will receive as its `data` prop.
//  */
// export type SupplierDetailPage_LoadDataAsync = PromisifyComplex<SupplierDetailPage_LoadData>;
