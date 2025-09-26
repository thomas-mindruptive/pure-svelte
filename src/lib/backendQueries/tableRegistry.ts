// src/lib/backendQueries/tableRegistry.ts

/**
 * @file Table Registry - Single Source of Truth für Table-Schema Mapping
 * @description Definiert alle Tabellen mit ihren Zod Schemas, DB-Metadaten und Aliases.
 * Ersetzt die hardcodierten Column-Listen in queryConfig durch schema-basierte Validierung.
 */

import {
  WholesalerSchema,
  ProductCategorySchema,
  ProductDefinitionSchema,
  WholesalerItemOfferingSchema,
  AttributeSchema,
  WholesalerOfferingLinkSchema,
  WholesalerCategorySchema,
  WholesalerOfferingAttributeSchema,
  OrderSchema,
  OrderItemSchema,
  type z
} from '$lib/domain/domainTypes';

/**
 * Table Definition Interface
 */
export interface TableDefinition {
  schema: z.ZodTypeAny;
  tableName: string;
  dbSchema: string;
  alias: string;
}

/**
 * Primäre Table Registry - Lookup über Entity-Namen
 */
export const TableRegistry = {
  "wholesalers": {
    schema: WholesalerSchema,
    tableName: "wholesalers",
    dbSchema: "dbo",
    alias: "w"
  },
  "categories": {
    schema: ProductCategorySchema,
    tableName: "product_categories",
    dbSchema: "dbo",
    alias: "pc"
  },
  "product_definitions": {
    schema: ProductDefinitionSchema,
    tableName: "product_definitions",
    dbSchema: "dbo",
    alias: "pd"
  },
  "offerings": {
    schema: WholesalerItemOfferingSchema,
    tableName: "wholesaler_item_offerings",
    dbSchema: "dbo",
    alias: "wio"
  },
  "attributes": {
    schema: AttributeSchema,
    tableName: "attributes",
    dbSchema: "dbo",
    alias: "a"
  },
  "links": {
    schema: WholesalerOfferingLinkSchema,
    tableName: "wholesaler_offering_links",
    dbSchema: "dbo",
    alias: "wol"
  },
  "wholesaler_categories": {
    schema: WholesalerCategorySchema,
    tableName: "wholesaler_categories",
    dbSchema: "dbo",
    alias: "wc"
  },
  "wholesaler_offering_attributes": {
    schema: WholesalerOfferingAttributeSchema,
    tableName: "wholesaler_offering_attributes",
    dbSchema: "dbo",
    alias: "woa"
  },
  "orders": {
    schema: OrderSchema,
    tableName: "orders",
    dbSchema: "dbo",
    alias: "ord"
  },
  "order_items": {
    schema: OrderItemSchema,
    tableName: "order_items",
    dbSchema: "dbo",
    alias: "ori"
  }
} as const satisfies Record<string, TableDefinition>;

/**
 * Transformation-Funktion: Entity-Registry → DB-Table-Registry
 */
function createDbSchemaTableRegistry<T extends Record<string, TableDefinition>>(
  tableRegistry: T
): Record<string, T[keyof T]> {
  return Object.fromEntries(
    Object.entries(tableRegistry).map(([entityKey, config]) => [
      `${config.dbSchema}.${config.tableName}`,
      config
    ])
  ) as Record<string, T[keyof T]>;
}

/**
 * Abgeleitete Registry - Lookup über vollständige DB-Table-Namen
 */
export const DbSchemaTableRegistry = createDbSchemaTableRegistry(TableRegistry);

/**
 * Hilfsfunktionen für Schema-Validierung
 */
export function getTableConfig(identifier: string): TableDefinition | null {
  // Erst Entity-Name versuchen
  if (identifier in TableRegistry) {
    return TableRegistry[identifier as keyof typeof TableRegistry];
  }

  // Dann vollständigen DB-Table-Namen versuchen
  if (identifier in DbSchemaTableRegistry) {
    return DbSchemaTableRegistry[identifier];
  }

  return null;
}

/**
 * Validiert SELECT-Columns gegen das Schema
 */
export function validateSelectColumns(identifier: string, selectColumns: string[]): void {
  const tableConfig = getTableConfig(identifier);

  if (!tableConfig) {
    // Keine Validierung für unbekannte Tables
    return;
  }

  const allowedColumns = Object.keys(tableConfig.schema.shape);

  for (const column of selectColumns) {
    // Handle qualified columns (e.g., "w.wholesaler_id")
    let cleanColumn = column.includes('.') ? column.split('.')[1] : column;

    // Handle AS clauses (e.g., "w.name AS supplier_name")
    if (cleanColumn.includes(' AS ')) {
      cleanColumn = cleanColumn.split(' AS ')[0].trim();
    }

    // Skip wildcard und aggregate functions
    if (cleanColumn === '*' ||
        cleanColumn.startsWith('COUNT(') ||
        cleanColumn.startsWith('SUM(') ||
        cleanColumn.startsWith('AVG(') ||
        cleanColumn.startsWith('MAX(') ||
        cleanColumn.startsWith('MIN(')) {
      continue;
    }

    if (!allowedColumns.includes(cleanColumn)) {
      throw new Error(
        `Column '${cleanColumn}' not found in schema for table '${identifier}'. ` +
        `Available columns: ${allowedColumns.join(', ')}`
      );
    }
  }
}

/**
 * Type Utilities
 */
export type TableRegistryKeys = keyof typeof TableRegistry;
export type DbTableNames = keyof typeof DbSchemaTableRegistry;
export type AllTableIdentifiers = TableRegistryKeys | DbTableNames;