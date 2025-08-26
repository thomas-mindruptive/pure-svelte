// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration with FINAL, CORRECTED Type Safety
 * @description This object contains all security whitelists for database queries.
 * It is now strictly validated against the UNMODIFIED `domain/types.ts`.
 */

import { JoinType, type JoinClause, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type * as Domain from '$lib/domain/types';

// --- Type Generation for Compile-Time Safety ---

type AliasToEntityMap = {
  w: Domain.Wholesaler;
  pc: Domain.ProductCategory;
  wc: Domain.WholesalerCategory;
  oc: { offering_count: number };
  wio: Domain.WholesalerItemOffering;
  woa: Domain.WholesalerOfferingAttribute;
  wol: Domain.WholesalerOfferingLink;
};

type AllQualifiedColumns = {
  [Alias in keyof AliasToEntityMap]: `${Alias}.${Extract<keyof AliasToEntityMap[Alias], string>}`
}[keyof AliasToEntityMap];

type AllAliasedColumns = `${AllQualifiedColumns} AS ${string}`;

type BaseTableConfig = {
  'dbo.wholesalers': (keyof Domain.Wholesaler)[];
  'dbo.product_categories': (keyof Domain.ProductCategory)[];
  'dbo.wholesaler_categories': (keyof Domain.WholesalerCategory)[];
  'dbo.wholesaler_item_offerings': (keyof Domain.WholesalerItemOffering)[];
  'dbo.wholesaler_offering_attributes': (keyof Domain.WholesalerOfferingAttribute)[];
  'dbo.wholesaler_offering_links': (keyof Domain.WholesalerOfferingLink)[];
};

type PredefinedQueryConfig = {
  supplier_categories: (AllQualifiedColumns | AllAliasedColumns)[];
  category_offerings: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_attributes: (AllQualifiedColumns | AllAliasedColumns)[];
  offering_links: (AllQualifiedColumns | AllAliasedColumns)[];
};

interface QueryConfig {
  allowedTables: BaseTableConfig & PredefinedQueryConfig;
  joinConfigurations?: {
    [viewName: string]: {
      from: string;
      joins: JoinClause[];
      exampleQuery?: QueryPayload<unknown>;
    };
  };
}

// --- The Configuration Object ---

export const supplierQueryConfig: QueryConfig = {
  allowedTables: {
    // Validated against BaseTableConfig and the original domain/types.ts
    'dbo.wholesalers': ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'created_at', 'website', 'b2b_notes'],
    'dbo.product_categories': ['category_id', 'name', 'description'],
    'dbo.wholesaler_categories': ['wholesaler_id', 'category_id', 'comment', 'link', 'created_at'],
    'dbo.wholesaler_item_offerings': ['offering_id', 'wholesaler_id', 'category_id', 'product_def_id', 'size', 'dimensions', 'price', 'currency', 'comment', 'created_at'],
    'dbo.wholesaler_offering_attributes': ['offering_id', 'attribute_id', 'value'],
    'dbo.wholesaler_offering_links': ['link_id', 'offering_id', 'url', 'notes', 'created_at'],

    // Validated against PredefinedQueryConfig
    'supplier_categories': [
      'w.wholesaler_id', 'w.name AS supplier_name', 'wc.category_id', 'pc.name AS category_name',
      'pc.description AS category_description', 'wc.comment', 'wc.link', 'oc.offering_count'
    ],
    'category_offerings': [
      'pc.category_id', 'pc.name AS category_name', 'pc.description AS category_description',
      'wio.offering_id', 'wio.price', // 'wio.product_name' and 'wio.stock' REMOVED
      'wio.wholesaler_id'
    ],
    'offering_attributes': [
      'wio.offering_id', 'wio.price', 'wio.category_id', // 'wio.status' and 'wio.product_name' REMOVED
      'woa.attribute_id', 'woa.value' // 'woa.name AS ...' and 'woa.category' REMOVED
    ],
    'offering_links': [
      'wio.offering_id', 'wio.price', 'wio.category_id', // 'wio.status' and 'wio.product_name' REMOVED
      'wol.link_id', 'wol.url', 'wol.notes' // 'wol.type' and 'wol.description' REMOVED
    ]
  },
  joinConfigurations: {
    'supplier_categories': {
      from: 'dbo.wholesalers w',
      joins: [
        { type: JoinType.INNER, table: 'dbo.wholesaler_categories', alias: 'wc', on: 'w.wholesaler_id = wc.wholesaler_id' },
        { type: JoinType.INNER, table: 'dbo.product_categories', alias: 'pc', on: 'wc.category_id = pc.category_id' },
        { type: JoinType.LEFT, table: '(SELECT wholesaler_id, category_id, COUNT(*) as offering_count FROM dbo.wholesaler_item_offerings GROUP BY wholesaler_id, category_id)', alias: 'oc', on: 'wc.wholesaler_id = oc.wholesaler_id AND wc.category_id = oc.category_id' }
      ]
    },
    'category_offerings': {
      from: 'dbo.product_categories pc',
      joins: [
        { type: JoinType.INNER, table: 'dbo.wholesaler_item_offerings', alias: 'wio', on: 'pc.category_id = wio.category_id' }
      ]
    },
    'offering_attributes': {
      from: 'dbo.wholesaler_item_offerings wio',
      joins: [
        { type: JoinType.LEFT, table: 'dbo.wholesaler_offering_attributes', alias: 'woa', on: 'wio.offering_id = woa.offering_id' }
      ]
    },
    'offering_links': {
      from: 'dbo.wholesaler_item_offerings wio',
      joins: [
        { type: JoinType.LEFT, table: 'dbo.wholesaler_offering_links', alias: 'wol', on: 'wio.offering_id = wol.offering_id' }
      ]
    }
  }
};