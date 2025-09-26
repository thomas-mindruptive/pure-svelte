// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration types.
 */

import type * as Domain from "$lib/domain/domainTypes";
import type { TableNameToEntityMap } from "$lib/domain/tableToEntityMap";

// --- Type Generation for Compile-Time Safety ---

export type AliasToEntityMap = {
  // Für jeden Schlüssel (Alias) in unserer `aliasedTablesConfig`...
  [Alias in keyof typeof aliasedTablesConfig]: // ...hole den zugehörigen Tabellennamen (z.B. 'dbo.wholesalers')...
  (typeof aliasedTablesConfig)[Alias]["tableName"] extends keyof TableNameToEntityMap
    ? // ...und schlage damit den echten Entitäts-Typ (z.B. `Wholesaler`) in unserer Brücken-Map nach.
      TableNameToEntityMap[(typeof aliasedTablesConfig)[Alias]["tableName"]]
    : never;
} & {
  // Manuelle Erweiterungen für spezielle Fälle wie 'oc' bleiben möglich.
  oc: { offering_count: number };
};

/**
 * Creates a union of all valid {table, alias} pairs based on `aliasedTablesConfig`.
 * This is the core of compile-time safety for the FROM clause.
 *
 * How it works:
 * 1. `[Alias in keyof typeof aliasedTablesConfig]`: This mapped type iterates through each alias ('w', 'pc', 'pd', etc.).
 * 2. `{ table: ..., alias: ... }`: For each alias, it creates a specific object type.
 * 3. `['tableName']`: It looks up the corresponding table name string from the config.
 * 4. `[keyof typeof aliasedTablesConfig]`: This final step extracts all the generated object types and combines them into a single union type.
 *    e.g., { table: 'dbo.wholesalers', alias: 'w' } | { table: 'dbo.product_categories', alias: 'pc' } | ...
 */
export type ValidFromClause = {
  [Alias in keyof typeof aliasedTablesConfig]: {
    table: (typeof aliasedTablesConfig)[Alias]["tableName"];
    alias: Alias;
  };
}[keyof typeof aliasedTablesConfig];

export type AllQualifiedColumns = {
  [Alias in keyof AliasToEntityMap]: `${Alias}.${Extract<keyof AliasToEntityMap[Alias], string>}`;
}[keyof AliasToEntityMap];

export type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

/**
 * Validate column names against the domain model.
 */
export type BaseTableConfig = {
  "dbo.wholesalers": (keyof Domain.Wholesaler)[];
  "dbo.product_categories": (keyof Domain.ProductCategory)[];
  "dbo.wholesaler_categories": (keyof Domain.WholesalerCategory)[];
  "dbo.product_definitions": (keyof Domain.ProductDefinition)[];
  "dbo.wholesaler_item_offerings": (keyof Domain.WholesalerItemOffering)[];
  "dbo.wholesaler_offering_attributes": (keyof Domain.WholesalerOfferingAttribute)[];
  "dbo.wholesaler_offering_links": (keyof Domain.WholesalerOfferingLink)[];
  "dbo.attributes": (keyof Domain.Attribute)[];
  "dbo.orders": (keyof Domain.Order)[];
  "dbo.order_items": (keyof Domain.OrderItem)[];
};

/**
 * Validate column names of predefined queries against the domain model.
 */
export type PredefinedQueryConfig = {
  supplier_categories: (AllQualifiedColumns | AllAliasedColumns)[];
  category_offerings: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_attributes: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_links: (AllQualifiedColumns | AllAliasedColumns)[];
  product_definition_offerings: (AllQualifiedColumns | AllAliasedColumns)[];
  order_order_items: (AllQualifiedColumns | AllAliasedColumns)[];
};

/**
 * Allowed table aliases and their columns.
 */
export const aliasedTablesConfig = {
  w: {
    tableName: "dbo.wholesalers",
    columns: [
      "wholesaler_id",
      "name",
      "region",
      "status",
      "dropship",
      "created_at",
      "email",
      "website",
      "b2b_notes",
      "relevance",
      "price_range",
    ],
  },
  pc: {
    tableName: "dbo.product_categories",
    columns: ["category_id", "name", "description"],
  },
  wc: {
    tableName: "dbo.wholesaler_categories",
    columns: ["wholesaler_id", "category_id", "comment", "link", "created_at"],
  },
  wio: {
    tableName: "dbo.wholesaler_item_offerings",
    columns: [
      "offering_id",
      "wholesaler_id",
      "category_id",
      "product_def_id",
      "size",
      "dimensions",
      "price",
      "currency",
      "comment",
      "created_at",
    ],
  },
  woa: {
    tableName: "dbo.wholesaler_offering_attributes",
    columns: ["offering_id", "attribute_id", "value"],
  },
  wol: {
    tableName: "dbo.wholesaler_offering_links",
    columns: ["link_id", "offering_id", "url", "notes", "created_at"],
  },
  pd: {
    tableName: "dbo.product_definitions",
    columns: ["product_def_id", "title", "description", "category_id"],
  },
  a: {
    tableName: "dbo.attributes",
    columns: ["attribute_id", "name", "description"],
  },
  ord: {
    tableName: "dbo.orders",
    columns: ["order_id", "order_date", "order_number", "total_amount", "currency", "notes", "created_at"],
  },
  ori: {
    tableName: "dbo.order_items",
    columns: ["order_item_id", "order_id", "offering_id", "quantity", " unit_price", "line_total", " item_notes", "created_at"],
  },
} as const;
