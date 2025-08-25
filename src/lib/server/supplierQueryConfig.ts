// src/lib/server/supplierQueryConfig.ts - DOMAIN-SPECIFIC configuration
import { type QueryConfig } from './queryBuilder';
import { JoinType } from '$lib/clientAndBack/queryGrammar';

/**
 * Supplier domain-specific query configuration
 * Contains all business rules for allowed tables and JOINs
 */
export const supplierQueryConfig: QueryConfig = {
  // Security whitelist: allowed tables and their queryable columns
  allowedTables: {
    // Base tables
    'dbo.wholesalers': [
      'wholesaler_id', 'name', 'region', 'status', 'dropship', 'created_at', 'website', 'b2b_notes'
    ],
    'dbo.product_categories': [
      'category_id', 'name', 'description'
    ],
    'dbo.wholesaler_categories': [
      'wholesaler_id', 'category_id', 'comment', 'link'
    ],
    'dbo.wholesaler_item_offerings': [
      'offering_id', 'wholesaler_id', 'category_id', 'product_name', 'price', 'stock', 'status'
    ],
    'dbo.wholesaler_offering_attributes': [
      'attribute_id', 'offering_id', 'name', 'value', 'category'
    ],
    'dbo.wholesaler_offering_links': [
      'link_id', 'offering_id', 'url', 'type', 'description'
    ],
    
    // Virtual "views" for common JOIN queries (performance optimization)
    'supplier_categories': [
      'w.wholesaler_id', 'w.name AS supplier_name', 'w.region', 'w.status', 'w.dropship', 'w.website',
      'wc.category_id', 'pc.name AS category_name', 'pc.description AS category_description', 
      'wc.comment', 'wc.link'
    ],
    'category_offerings': [
      'pc.category_id', 'pc.name AS category_name', 'pc.description AS category_description',
      'wio.offering_id', 'wio.product_name', 'wio.price', 'wio.stock', 'wio.status',
      'wio.wholesaler_id'
    ],
    'offering_attributes': [
      'wio.offering_id', 'wio.product_name', 'wio.price', 'wio.status', 'wio.category_id',
      'woa.attribute_id', 'woa.name AS attribute_name', 'woa.value', 'woa.category AS attribute_category'
    ],
    'offering_links': [
      'wio.offering_id', 'wio.product_name', 'wio.price', 'wio.status', 'wio.category_id',
      'wol.link_id', 'wol.url', 'wol.type', 'wol.description'
    ]
  },

  // Predefined JOIN configurations for virtual views
  joinConfigurations: {
    // Supplier with its categories (including category names)
    'supplier_categories': {
      from: 'dbo.wholesalers w',
      joins: [
        { 
          type: JoinType.INNER, 
          table: 'dbo.wholesaler_categories', 
          alias: 'wc', 
          on: 'w.wholesaler_id = wc.wholesaler_id' 
        },
        { 
          type: JoinType.INNER, 
          table: 'dbo.product_categories', 
          alias: 'pc', 
          on: 'wc.category_id = pc.category_id' 
        }
      ]
    },

    // Category with its offerings
    'category_offerings': {
      from: 'dbo.product_categories pc',
      joins: [
        { 
          type: JoinType.INNER, 
          table: 'dbo.wholesaler_item_offerings', 
          alias: 'wio', 
          on: 'pc.category_id = wio.category_id' 
        }
      ]
    },

    // Offering with its attributes  
    'offering_attributes': {
      from: 'dbo.wholesaler_item_offerings wio',
      joins: [
        { 
          type: JoinType.LEFT, 
          table: 'dbo.wholesaler_offering_attributes', 
          alias: 'woa', 
          on: 'wio.offering_id = woa.offering_id' 
        }
      ]
    },

    // Offering with its links
    'offering_links': {
      from: 'dbo.wholesaler_item_offerings wio',
      joins: [
        { 
          type: JoinType.LEFT, 
          table: 'dbo.wholesaler_offering_links', 
          alias: 'wol', 
          on: 'wio.offering_id = wol.offering_id' 
        }
      ]
    }
  }
};