// src/lib/backendQueries/tableRegistry.ts

/**
 * @file Table Registry - Single Source of Truth for Table-Schema Mapping
 * @description Defines all tables with their Zod schemas, DB metadata and aliases.
 * Replaces hardcoded column lists in queryConfig with schema-based validation.
 */

import { type z } from 'zod';
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
  OrderItemSchema
} from '$lib/domain/domainTypes';

/**
 * Table Definition Interface
 */
export interface TableDefinition {
  schema: z.ZodObject<any>;
  tableName: string;
  dbSchema: string;
  alias: string;
}

/**
 * Primary Table Registry - Lookup by Entity Names
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
 * Transformation function: Entity-Registry → DB-Table-Registry
 */
function createDbSchemaTableRegistry<T extends Record<string, TableDefinition>>(
  tableRegistry: T
): Record<string, T[keyof T]> {
  return Object.fromEntries(
    Object.entries(tableRegistry).map(([, config]) => [
      `${config.dbSchema}.${config.tableName}`,
      config
    ])
  ) as Record<string, T[keyof T]>;
}

/**
 * Derived Registry - Lookup by full DB table names
 */
export const DbSchemaTableRegistry = createDbSchemaTableRegistry(TableRegistry);

/**
 * Helper functions for schema validation
 */
export function getTableConfig(identifier: string): TableDefinition | null {
  // Try entity name first
  if (identifier in TableRegistry) {
    return TableRegistry[identifier as keyof typeof TableRegistry];
  }

  // Then try full DB table name
  if (identifier in DbSchemaTableRegistry) {
    return DbSchemaTableRegistry[identifier];
  }

  return null;
}

/**
 * Validates SELECT columns against the schema
 */
export function validateSelectColumns(identifier: string, selectColumns: string[]): void {
  const tableConfig = getTableConfig(identifier);

  if (!tableConfig) {
    // No validation for unknown tables
    return;
  }

  // Zod correct API: keyof() returns ZodEnum, .options contains the keys
  const allowedColumns = tableConfig.schema.keyof().options;

  for (const column of selectColumns) {
    // Handle qualified columns (e.g., "w.wholesaler_id")
    let cleanColumn = column.includes('.') ? column.split('.')[1] : column;

    // Handle AS clauses (e.g., "w.name AS supplier_name")
    if (cleanColumn.includes(' AS ')) {
      cleanColumn = cleanColumn.split(' AS ')[0].trim();
    }

    // Skip wildcard and aggregate functions
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
 * ===== ALIAS-BASED REGISTRY (Phase 1: Replaces queryConfig.types.ts) =====
 */

/**
 * Transformation function: Entity-Registry → Alias-Registry
 * Creates a lookup object by aliases (w, pc, pd, etc.)
 */
function createAliasedTableRegistry<T extends Record<string, TableDefinition>>(
  tableRegistry: T
): Record<string, T[keyof T]> {
  return Object.fromEntries(
    Object.entries(tableRegistry).map(([, config]) => [
      config.alias,
      config
    ])
  ) as Record<string, T[keyof T]>;
}

/**
 * Alias-based Registry - Lookup by aliases (w, pc, pd, etc.)
 * Replaces aliasedTablesConfig from queryConfig.types.ts
 */
export const AliasedTableRegistry = createAliasedTableRegistry(TableRegistry);

/**
 * ===== TYPE GENERATION (Replaces queryConfig.types.ts) =====
 */

/**
 * Generates AliasToEntityMap from Table Registry
 * Replaces manual type definition in queryConfig.types.ts
 */
export type AliasToEntityMap = {
  [Alias in keyof typeof AliasedTableRegistry]: z.infer<(typeof AliasedTableRegistry)[Alias]["schema"]>;
};

/**
 * Generates ValidFromClause from Table Registry
 * Replaces manual type definition in queryConfig.types.ts
 */
export type ValidFromClause = {
  [Alias in keyof typeof AliasedTableRegistry]: {
    table: `${(typeof AliasedTableRegistry)[Alias]["dbSchema"]}.${(typeof AliasedTableRegistry)[Alias]["tableName"]}`;
    alias: Alias;
  };
}[keyof typeof AliasedTableRegistry];

/**
 * Helper type to extract string keys from Zod schema
 */
type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;

/**
 * Auto-generated qualified column names from Table Registry schemas
 */
export type AllQualifiedColumns = {
  [K in keyof typeof TableRegistry]: `${(typeof TableRegistry)[K]["alias"]}.${ExtractSchemaKeys<(typeof TableRegistry)[K]["schema"]>}`;
}[keyof typeof TableRegistry];

/**
 * Generates aliased column names (alias.column AS name)
 */
export type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

/**
 * ===== ENHANCED VALIDATION FUNCTIONS =====
 */

/**
 * Enhanced getTableConfig - Support for aliases
 */
export function getTableConfigByAlias(alias: string): TableDefinition | null {
  // Try alias first
  if (alias in AliasedTableRegistry) {
    return AliasedTableRegistry[alias];
  }

  // Fallback to normal getTableConfig
  return getTableConfig(alias);
}

/**
 * Validates SELECT columns for JOIN queries with multiple aliases
 */
export function validateJoinSelectColumns(selectColumns: string[]): void {
  for (const column of selectColumns) {
    // Handle qualified columns (e.g., "w.wholesaler_id")
    if (column.includes('.')) {
      const [alias, columnName] = column.split('.');
      let cleanColumn = columnName;

      // Handle AS clauses (e.g., "w.name AS supplier_name")
      if (cleanColumn.includes(' AS ')) {
        cleanColumn = cleanColumn.split(' AS ')[0].trim();
      }

      // Skip wildcard and aggregate functions
      if (cleanColumn === '*' ||
          cleanColumn.startsWith('COUNT(') ||
          cleanColumn.startsWith('SUM(') ||
          cleanColumn.startsWith('AVG(') ||
          cleanColumn.startsWith('MAX(') ||
          cleanColumn.startsWith('MIN(')) {
        continue;
      }

      // Validate against Table Registry
      const tableConfig = getTableConfigByAlias(alias);
      if (tableConfig) {
        // Zod correct API: keyof() returns ZodEnum, .options contains the keys
        const allowedColumns = tableConfig.schema.keyof().options;
        if (!allowedColumns.includes(cleanColumn)) {
          throw new Error(
            `Column '${cleanColumn}' not found in schema for alias '${alias}'. ` +
            `Available columns: ${allowedColumns.join(', ')}`
          );
        }
      }
    } else {
      // Unqualified column - use existing validation
      validateSelectColumns('unknown', [column]);
    }
  }
}

/**
 * Type Utilities
 */
export type TableRegistryKeys = keyof typeof TableRegistry;
export type DbTableNames = keyof typeof DbSchemaTableRegistry;
export type AliasKeys = keyof typeof AliasedTableRegistry;
export type AllTableIdentifiers = TableRegistryKeys | DbTableNames | AliasKeys;