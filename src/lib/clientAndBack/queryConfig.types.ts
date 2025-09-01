// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration types.
 */

import type * as Domain from '$lib/domain/types';
import type { aliasedTablesConfig } from './queryConfig';

// --- Type Generation for Compile-Time Safety ---

export type AliasToEntityMap = {
  // Für jeden Schlüssel (Alias) in unserer `aliasedTablesConfig`...
  [Alias in keyof typeof aliasedTablesConfig]:
    // ...hole den zugehörigen Tabellennamen (z.B. 'dbo.wholesalers')...
    (typeof aliasedTablesConfig)[Alias]['tableName'] extends keyof Domain.TableNameToEntityMap
      // ...und schlage damit den echten Entitäts-Typ (z.B. `Wholesaler`) in unserer Brücken-Map nach.
      ? Domain.TableNameToEntityMap[(typeof aliasedTablesConfig)[Alias]['tableName']]
      : never;
} & {
    // Manuelle Erweiterungen für spezielle Fälle wie 'oc' bleiben möglich.
    oc: { offering_count: number };
};

export type AllQualifiedColumns = {
  [Alias in keyof AliasToEntityMap]: `${Alias}.${Extract<keyof AliasToEntityMap[Alias], string>}`
}[keyof AliasToEntityMap];

export type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

/**
 * Validate column names against the domain model.
 */
export type BaseTableConfig = {
  'dbo.wholesalers': (keyof Domain.Wholesaler)[];
  'dbo.product_categories': (keyof Domain.ProductCategory)[];
  'dbo.wholesaler_categories': (keyof Domain.WholesalerCategory)[];
  'dbo.product_definitions': (keyof Domain.ProductDefinition)[];
  'dbo.wholesaler_item_offerings': (keyof Domain.WholesalerItemOffering)[];
  'dbo.wholesaler_offering_attributes': (keyof Domain.WholesalerOfferingAttribute)[];
  'dbo.wholesaler_offering_links': (keyof Domain.WholesalerOfferingLink)[];
  'dbo.attributes': (keyof Domain.Attribute)[];
};

/**
 * Validate column names of predefined queries against the domain model.
 */
export type PredefinedQueryConfig = {
  supplier_categories: (AllQualifiedColumns | AllAliasedColumns)[];
  category_offerings: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_attributes: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_links: (AllQualifiedColumns | AllAliasedColumns)[];
};
