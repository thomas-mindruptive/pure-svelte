import type { Transaction } from "mssql";
import { SurfaceFinishSchema, type SurfaceFinish } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import type { QueryPayload } from "../queryGrammar";
import type { LanguageCode } from "../language";
import { generateMapFromData } from "../mapUtils";
import { loadData } from "../genericEntityOperations";

/**
 * Loads surface finishes from the base surface_finishes table or a translation table.
 * 
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @param language - Optional language code (e.g., 'en', 'fr'). If set, loads from translation table (e.g., surface_finishes_en)
 * @returns Array of SurfaceFinish records
 */
export async function loadSurfaceFinishes(
  transaction: Transaction,
  payload?: Partial<QueryPayload<SurfaceFinish>>,
  language?: LanguageCode
): Promise<SurfaceFinish[]> {
  const tableName = language 
    ? `dbo.surface_finishes_${language}`  // Translation table, e.g., "dbo.surface_finishes_en"
    : "dbo.surface_finishes";              // Base table
  
  const completePayload: QueryPayload<SurfaceFinish> = {
    from: { table: tableName as "dbo.surface_finishes", alias: "sf" },
    select: genTypedQualifiedColumns(SurfaceFinishSchema, false), // IMPORTANT: set second param to false! Otherwise we mus referenece the properties through "sf.prop"!!!
    ...(payload?.where && { where: payload.where }),
    ...(payload?.limit && { limit: payload.limit }),
    ...(payload?.offset && { offset: payload.offset }),
    ...(payload?.orderBy && { orderBy: payload.orderBy }),
  };
  
  return loadData<SurfaceFinish>(transaction, completePayload);
}

/**
 * Generates a Map from an array of SurfaceFinish records, keyed by surface_finish_id.
 * 
 * @param surfaceFinishes - Array of SurfaceFinish records
 * @returns Map with surface_finish_id as key and SurfaceFinish as value
 * 
 * @example
 * const surfaceFinishes = await loadSurfaceFinishes(transaction);
 * const map = generateSurfaceFinishesMap(surfaceFinishes);
 * const surfaceFinish = map.get(123); // Get surface finish with ID 123
 */
export function generateSurfaceFinishesMap(surfaceFinishes: SurfaceFinish[]): Map<number, SurfaceFinish> {
  return generateMapFromData(surfaceFinishes, (sf) => sf.surface_finish_id);
}

