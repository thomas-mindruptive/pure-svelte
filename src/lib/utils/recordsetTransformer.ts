import { z } from 'zod';

// Type für branded schemas mit _meta
type BrandedSchema = z.ZodObject<z.ZodRawShape> & {
  _meta?: { alias: string; tableName: string; dbSchema: string };
};

/**
 * Transform flat DB recordset into nested object structure based on schema.
 *
 * Converts database results with qualified column names (e.g., "pd.name", "pc.category_id")
 * into structured objects matching the provided Zod schema.
 *
 * @param recordset - Array of flat DB result objects with qualified column names
 * @param schema - Zod schema defining the expected nested structure (with branded nested schemas)
 * @returns Array of structured objects matching the schema
 * @throws Error if recordset contains unexpected columns not defined in schema
 */
export function transformToNestedObjects<T extends z.ZodObject<z.ZodRawShape>>(
  recordset: Record<string, unknown>[],
  schema: T
): z.infer<T>[] {
  return recordset.map((row, index) => {
    const result: Record<string, unknown> = {};

    // Single loop over recordset columns
    for (const [column, value] of Object.entries(row)) {
      const processed = processColumn(column, value, schema, result);
      if (!processed) {
        throw new Error(`Row ${index}: Unexpected column '${column}' not defined in schema`);
      }
    }

    return result as z.infer<T>;
  });
}

/**
 * Process a single column from the recordset and assign it to the result object.
 *
 * @param column - Column name from recordset (e.g., "quantity" or "pd.name")
 * @param value - Column value
 * @param schema - Zod schema to match against
 * @param result - Result object being built
 * @returns true if column was processed, false if unexpected
 */
function processColumn<T extends z.ZodObject<z.ZodRawShape>>(
  column: string,
  value: unknown,
  schema: T,
  result: Record<string, unknown>
): boolean {
  const shape = schema.shape;

  // Check if it's a qualified column (e.g., "pd.name")
  if (column.includes('.')) {
    const [alias, fieldName] = column.split('.');

    // Find which nested object this belongs to
    for (const [schemaFieldName, zodType] of Object.entries(shape)) {
      if (zodType instanceof z.ZodObject) {
        // Check if this branded schema has the matching alias
        const meta = (zodType as any).__brandMeta;
        
        if (meta?.alias === alias) {
          const nestedKeys = zodType.keyof().options as readonly string[];
          if (nestedKeys.includes(fieldName)) {
            // Initialize nested object if not exists
            if (!result[schemaFieldName]) {
              result[schemaFieldName] = {};
            }
            (result[schemaFieldName] as Record<string, unknown>)[fieldName] = value;
            return true;
          }
        }
      }
    }
    return false; // Qualified column not found in schema
  } else {
    // Direct column - check if it exists in schema
    if (column in shape && !(shape[column] instanceof z.ZodObject)) {
      result[column] = value;
      return true;
    }
    return false; // Direct column not found in schema
  }
}