// src/lib/pages/suppliers/supplierDetailPage.types.ts

/**
 * @file Type definitions for the Supplier Detail Page.
 * @description Defines the data structures for both the resolved data used by the Svelte component
 * and the asynchronous promise-based data returned by the `load` function.
 * This ensures type safety throughout the data-loading lifecycle.
 */

import { z } from "zod";
import { ProductCategorySchema, ProductDefinitionSchema, ProductTypeSchema } from "$lib/domain/domainTypes";
import type { PromisifyComplex } from "$lib/utils/typeUtils";

// --- Zod Schema ---

// /**
//  * Supplier detail, e.g. for SullierForm
//  */
// export const CategoryDetail_LoadDataSchema = z.object({
//   // The core supplier entity being displayed.
//   // Optional for CREATE mode!
//   category: z.optional(ProductCategorySchema).nullable(),
// });

// export type CategoryDetail_LoadData = z.infer<typeof CategoryDetail_LoadDataSchema>;
// export type CategoryDetail_LoadDataAsync = PromisifyComplex<CategoryDetail_LoadData>;

/**
 * Defines the schema for the fully resolved data required by the Category Detail Page.
 * This is used to validate the data shape after all promises from the `load` function have been resolved.
 */
export const CategoryDetailPage_LoadDataSchema = z.object({
  category: z.optional(ProductCategorySchema).nullable(),
  productDefinitions: z.array(ProductDefinitionSchema),
  productTypes: z.array(ProductTypeSchema),
  isCreateMode: z.boolean(),
});

// --- TypeScript Type Exports ---

/**
 * The type representing the final, resolved data structure for the page.
 * This is inferred directly from the Zod schema to ensure consistency.
 */
export type CategoryDetailPage_LoadData = z.infer<typeof CategoryDetailPage_LoadDataSchema>;

/**
 * The asynchronous version of the load data, where complex properties are Promises.
 * This is the exact type that the `load` function will return and the Svelte component
 * will receive as its `data` prop.
 */
export type CategoryDetailPage_LoadDataAsync = PromisifyComplex<CategoryDetailPage_LoadData>;
