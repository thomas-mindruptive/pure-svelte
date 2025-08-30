// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration with FINAL, CORRECTED Type Safety
 * @description This object contains all security whitelists for database queries.
 * It is now strictly validated against the UNMODIFIED `domain/types.ts`.
 */

import { ComparisonOperator, JoinType, LogicalOperator, type JoinClause, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type { BaseTableConfig, PredefinedQueryConfig } from './queryConfig.types';


export interface QueryConfig {
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
    'dbo.product_definitions': ['product_def_id', 'title', 'description', 'category_id'],

    // Validated against PredefinedQueryConfig
    'supplier_categories': [
      'w.wholesaler_id', 'w.name AS supplier_name', 'wc.wholesaler_id', 'wc.category_id', 'pc.category_id', 'pc.name','pc.name AS category_name',
      'pc.description AS category_description', 'wc.comment', 'wc.link'
    ],
    'category_offerings': [
      'pc.category_id', 'pc.name AS category_name', 'pc.description AS category_description',
      'wio.category_id', 'wio.offering_id', 'wio.price', 'wio.created_at',
      'wio.wholesaler_id'
    ],
    'offering_attributes': [
      'wio.offering_id', 'wio.price', 'wio.category_id',
      'woa.attribute_id', 'woa.value'
    ],
    'offering_links': [
      'wio.offering_id', 'wio.price', 'wio.category_id', 'wol.offering_id',
      'wol.link_id', 'wol.url', 'wol.notes'
    ],
    'product_definitions': [
      'pd.product_def_id', 'pd.category_id', 'pd.title', 'pd.description', 'pd.category_id', 'pd.material_id', 'pd.form_id', 'pd.material_id'
    ]
  },
  joinConfigurations: {
    'supplier_categories': {
      from: 'dbo.wholesalers w',
      joins: [
        {
          type: JoinType.INNER,
          table: 'dbo.wholesaler_categories',
          alias: 'wc',
          on: {
            op: LogicalOperator.AND,
            conditions: [
              { columnA: 'w.wholesaler_id', op: ComparisonOperator.EQUALS, columnB: 'wc.wholesaler_id' }
            ]
          }
        },
        {
          type: JoinType.INNER,
          table: 'dbo.product_categories',
          alias: 'pc',
          on: {
            op: LogicalOperator.AND,
            conditions: [
              { columnA: 'wc.category_id', op: ComparisonOperator.EQUALS, columnB: 'pc.category_id' }
            ]
          }
        }
      ]
    },
    'category_offerings': {
      from: 'dbo.product_categories pc',
      joins: [
        {
          type: JoinType.INNER,
          table: 'dbo.wholesaler_item_offerings',
          alias: 'wio',
          on: {
            op: LogicalOperator.AND,
            conditions: [
              { columnA: 'pc.category_id', op: ComparisonOperator.EQUALS, columnB: 'wio.category_id' }
            ]
          }
        }
      ]
    },
    'wholesaler_category_offerings': {
      from: 'dbo.wholesaler_categories wc',
      joins: [
        {
          type: JoinType.INNER,
          table: 'dbo.wholesaler_item_offerings',
          alias: 'wio',
          on: {
            op: LogicalOperator.AND,
            conditions: [
              { columnA: 'wc.wholesaler_id', op: ComparisonOperator.EQUALS, columnB: 'wio.wholesaler_id' }
            ]
          }
        }
      ]
    },
    'offering_attributes': {
      from: 'dbo.wholesaler_item_offerings wio',
      joins: [
        {
          type: JoinType.LEFT,
          table: 'dbo.wholesaler_offering_attributes',
          alias: 'woa',
          on: {
            op: LogicalOperator.AND,
            conditions: [
              { columnA: 'wio.offering_id', op: ComparisonOperator.EQUALS, columnB: 'woa.offering_id' }
            ]
          }
        }
      ]
    },
    'offering_links': {
      from: 'dbo.wholesaler_item_offerings wio',
      joins: [
        {
          type: JoinType.LEFT,
          table: 'dbo.wholesaler_offering_links',
          alias: 'wol',
          on: {
            op: LogicalOperator.AND,
            conditions: [
              { columnA: 'wio.offering_id', op: ComparisonOperator.EQUALS, columnB: 'wol.offering_id' }
            ]
          }
        }
      ]
    }
  }
};