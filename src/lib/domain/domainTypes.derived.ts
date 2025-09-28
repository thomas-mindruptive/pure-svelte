import type { TableRegistry, IAliasedTableRegistry } from "$lib/backendQueries/tableRegistry";
import z from "zod";
import type { OrderItem_ProdDef_Category_Schema } from "./domainTypes";

// ===== TYPE-LEVEL COMPUTATION =====

/**
 * Extract all qualified column names from a schema, mirroring recordsetTransformer logic
 * This works by checking the actual shape of the schema, not the inferred type
 */
export type QualifiedColumnsFromSchema<T extends z.ZodObject<any>> = T extends z.ZodObject<infer Shape>
  ? {
      [K in keyof Shape]: Shape[K] extends z.ZodObject<any>
        ? QualifiedColumnsForNestedObject<Shape[K]>
        : K extends string ? K : never;
    }[keyof Shape]
  : never;

/**
 * Helper type to find alias by schema matching in TableRegistry
 */
type FindAliasBySchema<TSchema> = {
  [K in keyof typeof TableRegistry]: (typeof TableRegistry)[K]["schema"] extends TSchema
    ? (typeof TableRegistry)[K]["alias"]
    : never;
}[keyof typeof TableRegistry];

/**
 * Generate qualified column names for nested objects (e.g., "pd.product_def_id", "pc.category_id")
 */
export type QualifiedColumnsForNestedObject<TObject> =
  FindAliasBySchema<TObject> extends string
    ? `${FindAliasBySchema<TObject>}.${Extract<keyof TObject, string>}`
    : never;

// ===== RUNTIME IMPLEMENTATION =====
// Note: The actual genTypedQualifiedColumns function is implemented in domainTypes.utils.ts

/**
 * Utility type to extract the expected shape after recordsetTransformer processing
 */
export type TransformedShape<T extends z.ZodObject<any>> = z.infer<T>;

// ===== USAGE EXAMPLES & TESTS =====

;

// Example usage:
// const columns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
// The return type will be: ("order_item_id" | "quantity" | "pd.product_def_id" | "pd.title" | "pc.category_id" | "pc.name")[]
