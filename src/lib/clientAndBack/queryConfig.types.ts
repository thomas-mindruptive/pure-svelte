// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration types.
 */

import type * as Domain from '$lib/domain/types';

// --- Type Generation for Compile-Time Safety ---

export type AliasToEntityMap = {
  w: Domain.Wholesaler;
  pc: Domain.ProductCategory;
  wc: Domain.WholesalerCategory;
  oc: { offering_count: number };
  wio: Domain.WholesalerItemOffering;
  woa: Domain.WholesalerOfferingAttribute;
  wol: Domain.WholesalerOfferingLink;
  pd: Domain.ProductDefinition;
  a: Domain.Attribute;
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
};

/**
 * Validate column names of predefined queries against the domain model.
 */
export type PredefinedQueryConfig = {
  supplier_categories: (AllQualifiedColumns | AllAliasedColumns)[];
  category_offerings: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_attributes: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_links: (AllQualifiedColumns | AllAliasedColumns)[];
  product_definitions: (AllQualifiedColumns | AllAliasedColumns)[];
};
