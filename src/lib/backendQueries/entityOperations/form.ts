import type { Transaction } from "mssql";
import { FormSchema, type Form } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import type { QueryPayload } from "../queryGrammar";
import type { LanguageCode } from "../language";
import { generateMapFromData } from "../mapUtils";
import { loadData } from "../genericEntityOperations";

/**
 * Loads forms from the base forms table or a translation table.
 * 
 * @param transaction - Active database transaction
 * @param payload - Optional QueryPayload from client (WHERE, LIMIT, ORDER BY, etc.)
 * @param language - Optional language code (e.g., 'en', 'fr'). If set, loads from translation table (e.g., forms_en)
 * @returns Array of Form records
 */
export async function loadForms(
  transaction: Transaction,
  payload?: Partial<QueryPayload<Form>>,
  language?: LanguageCode
): Promise<Form[]> {
  const tableName = language 
    ? `dbo.forms_${language}`  // Translation table, e.g., "dbo.forms_en"
    : "dbo.forms";              // Base table
  
  const completePayload: QueryPayload<Form> = {
    from: { table: tableName as "dbo.forms", alias: "f" },
    select: genTypedQualifiedColumns(FormSchema, false), // IMPORTANT: set second param to false! Otherwise we mus referenece the properties through "f.prop"!!!
    ...(payload?.where && { where: payload.where }),
    ...(payload?.limit && { limit: payload.limit }),
    ...(payload?.offset && { offset: payload.offset }),
    ...(payload?.orderBy && { orderBy: payload.orderBy }),
  };
  
  return loadData<Form>(transaction, completePayload);
}

/**
 * Generates a Map from an array of Form records, keyed by form_id.
 * 
 * @param forms - Array of Form records
 * @returns Map with form_id as key and Form as value
 * 
 * @example
 * const forms = await loadForms(transaction);
 * const map = generateFormsMap(forms);
 * const form = map.get(123); // Get form with ID 123
 */
export function generateFormsMap(forms: Form[]): Map<number, Form> {
  return generateMapFromData(forms, (f) => f.form_id);
}

