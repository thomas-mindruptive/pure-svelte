// File: src/lib/components/domain/productDefinitions/productDefinitionDetailPage.types.ts

import { z } from 'zod';
import { 
    ProductDefinitionSchema, 
    WholesalerItemOffering_ProductDef_Category_SupplierSchema 
} from '$lib/domain/domainTypes';
import type { PromisifyComplex } from '$lib/utils/typeUtils';

/**
 * Defines the schema for the fully resolved data required by the Product Definition Detail Page.
 * This is used to validate the data shape after all promises from the `load` function 
 * have been resolved in the component.
 */
export const ProductDefinitionDetailPage_LoadDataSchema = z.object({

  /**
   * Must always be defined, because we must always come from a path like /.../categories/[categoryId]
   */
  categoryId: z.number(),

  /**
   * The core ProductDefinition entity being displayed.
   * Can be null in create mode.
   */
  productDefinition: ProductDefinitionSchema.nullable(),

  /**
   * The list of all offerings across all suppliers for this specific product definition.
   */
  offerings: z.array(WholesalerItemOffering_ProductDef_Category_SupplierSchema),

  /**
   * Create or edit-mode.
   */
  isCreateMode: z.boolean()
});

// --- TypeScript Type Exports ---

/**
 * The type representing the final, resolved data structure for the page.
 */
export type ProductDefinitionDetailPage_LoadData = z.infer<typeof ProductDefinitionDetailPage_LoadDataSchema>;

/**
 * The asynchronous version of the load data, where complex properties are Promises.
 * This is the exact type that the `load` function will return.
 */
export type ProductDefinitionDetailPage_LoadDataAsync = PromisifyComplex<ProductDefinitionDetailPage_LoadData>;