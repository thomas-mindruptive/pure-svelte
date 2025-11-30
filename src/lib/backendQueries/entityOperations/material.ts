import type { Transaction } from "mssql";
import { MaterialSchema, type Material } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import type { QueryPayload } from "../queryGrammar";
import type { LanguageCode } from "../language";
import { generateMapFromData } from "../mapUtils";
import { loadData } from "../genericEntityOperations";

/**
 * Loads materials from the base materials table or a translation table.
 * 
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @param language - Optional language code (e.g., 'en', 'fr'). If set, loads from translation table (e.g., materials_en)
 * @returns Array of Material records
 */
export async function loadMaterials(
  transaction: Transaction,
  payload?: Partial<QueryPayload<Material>>,
  language?: LanguageCode
): Promise<Material[]> {
  const tableName = language 
    ? `dbo.materials_${language}`  // Translation table, e.g., "dbo.materials_en"
    : "dbo.materials";              // Base table
  
  const completePayload: QueryPayload<Material> = {
    from: { table: tableName as "dbo.materials", alias: "m" },
    select: genTypedQualifiedColumns(MaterialSchema, true),
    ...(payload?.where && { where: payload.where }),
    ...(payload?.limit && { limit: payload.limit }),
    ...(payload?.offset && { offset: payload.offset }),
    ...(payload?.orderBy && { orderBy: payload.orderBy }),
  };
  
  return loadData<Material>(transaction, completePayload);
}

/**
 * Generates a Map from an array of Material records, keyed by material_id.
 * 
 * @param materials - Array of Material records
 * @returns Map with material_id as key and Material as value
 * 
 * @example
 * const materials = await loadMaterials(transaction);
 * const map = generateMaterialsMap(materials);
 * const material = map.get(123); // Get material with ID 123
 */
export function generateMaterialsMap(materials: Material[]): Map<number, Material> {
  return generateMapFromData(materials, (m) => m.material_id);
}

