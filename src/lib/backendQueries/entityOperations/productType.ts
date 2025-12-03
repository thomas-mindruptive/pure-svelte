import type { Transaction } from "mssql";
import { ProductTypeSchema, type ProductType } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import type { QueryPayload } from "../queryGrammar";
import type { LanguageCode } from "../language";
import { generateMapFromData } from "../mapUtils";
import { loadData } from "../genericEntityOperations";

/**
 * Loads product types from the base product_types table or a translation table.
 * 
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @param language - Optional language code (e.g., 'en', 'fr'). If set, loads from translation table (e.g., product_types_en)
 * @returns Array of ProductType records
 */
export async function loadProductTypes(
  transaction: Transaction,
  payload?: Partial<QueryPayload<ProductType>>,
  language?: LanguageCode
): Promise<ProductType[]> {
  const tableName = language 
    ? `dbo.product_types_${language}`  // Translation table, e.g., "dbo.product_types_en"
    : "dbo.product_types";              // Base table
  
  const completePayload: QueryPayload<ProductType> = {
    from: { table: tableName as "dbo.product_types", alias: "pt" },
    select: genTypedQualifiedColumns(ProductTypeSchema, false), // IMPORTANT: set second param to false! Otherwise we mus referenece the properties through "pt.prop"!!!
    ...(payload?.where && { where: payload.where }),
    ...(payload?.limit && { limit: payload.limit }),
    ...(payload?.offset && { offset: payload.offset }),
    ...(payload?.orderBy && { orderBy: payload.orderBy }),
  };
  
  return loadData<ProductType>(transaction, completePayload);
}

/**
 * Generates a Map from an array of ProductType records, keyed by product_type_id.
 * 
 * @param productTypes - Array of ProductType records
 * @returns Map with product_type_id as key and ProductType as value
 * 
 * @example
 * const productTypes = await loadProductTypes(transaction);
 * const map = generateProductTypesMap(productTypes);
 * const productType = map.get(123); // Get product type with ID 123
 */
export function generateProductTypesMap(productTypes: ProductType[]): Map<number, ProductType> {
  return generateMapFromData(productTypes, (pt) => pt.product_type_id);
}

