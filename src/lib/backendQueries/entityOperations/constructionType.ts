import type { Transaction } from "mssql";
import { ConstructionTypeSchema, type ConstructionType } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import type { QueryPayload } from "../queryGrammar";
import type { LanguageCode } from "../language";
import { generateMapFromData } from "../mapUtils";
import { loadData } from "../genericEntityOperations";

/**
 * Loads construction types from the base construction_types table or a translation table.
 * 
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @param language - Optional language code (e.g., 'en', 'fr'). If set, loads from translation table (e.g., construction_types_en)
 * @returns Array of ConstructionType records
 */
export async function loadConstructionTypes(
  transaction: Transaction,
  payload?: Partial<QueryPayload<ConstructionType>>,
  language?: LanguageCode
): Promise<ConstructionType[]> {
  const tableName = language 
    ? `dbo.construction_types_${language}`  // Translation table, e.g., "dbo.construction_types_en"
    : "dbo.construction_types";              // Base table
  
  const completePayload: QueryPayload<ConstructionType> = {
    from: { table: tableName as "dbo.construction_types", alias: "ct" },
    select: genTypedQualifiedColumns(ConstructionTypeSchema, true),
    ...(payload?.where && { where: payload.where }),
    ...(payload?.limit && { limit: payload.limit }),
    ...(payload?.offset && { offset: payload.offset }),
    ...(payload?.orderBy && { orderBy: payload.orderBy }),
  };
  
  return loadData<ConstructionType>(transaction, completePayload);
}

/**
 * Generates a Map from an array of ConstructionType records, keyed by construction_type_id.
 * 
 * @param constructionTypes - Array of ConstructionType records
 * @returns Map with construction_type_id as key and ConstructionType as value
 * 
 * @example
 * const constructionTypes = await loadConstructionTypes(transaction);
 * const map = generateConstructionTypesMap(constructionTypes);
 * const constructionType = map.get(123); // Get construction type with ID 123
 */
export function generateConstructionTypesMap(constructionTypes: ConstructionType[]): Map<number, ConstructionType> {
  return generateMapFromData(constructionTypes, (ct) => ct.construction_type_id);
}

