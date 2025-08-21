// src/lib/server/supplierQueryConfig.ts - DOMAIN-SPECIFIC configuration
import { type QueryConfig } from './queryBuilder';
import { JoinType, LogicalOperator, ComparisonOperator } from '../../routes/api/query/queryGrammar';
import { log } from '$lib/utils/logger';

/**
 * Supplier domain-specific query configuration
 * Contains all business rules for allowed tables and JOINs
 */
export const supplierQueryConfig: QueryConfig = {
  // Security whitelist: allowed tables and their queryable columns
  allowedTables: {
    // Base tables
    'dbo.wholesalers': [
      'wholesaler_id', 'name', 'region', 'status', 'dropship', 'created_at', 'website'
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
    ],
    'supplier_detail': [
      'w.wholesaler_id', 'w.name', 'w.region', 'w.status', 'w.dropship', 'w.website', 'w.created_at'
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
    },

    // Single supplier detail (for edit forms)
    'supplier_detail': {
      from: 'dbo.wholesalers w',
      joins: []
    }
  }
};

/**
 * Convenience functions for common supplier domain queries
 * These provide a higher-level API for typical operations
 */

/**
 * Get all suppliers with basic information
 * @param limit - Maximum number of suppliers to return
 * @returns Promise resolving to supplier list
 */
export async function getSuppliers(limit: number = 100): Promise<any[]> {
  try {
    const { executeGenericQuery } = await import('./queryBuilder');
    
    log.info("Getting suppliers list", { limit });
    
    return executeGenericQuery({
      select: ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'website'],
      from: 'dbo.wholesalers',
      orderBy: [{ key: 'name', direction: 'asc' }],
      limit
    }, supplierQueryConfig);
    
  } catch (error: any) {
    log.error("Failed to get suppliers", { error: error.message, limit });
    throw new Error(`Failed to retrieve suppliers: ${error.message}`);
  }
}

/**
 * Get single supplier with detailed information
 * @param supplierId - ID of the supplier to retrieve
 * @returns Promise resolving to supplier details or null if not found
 */
export async function getSupplierDetail(supplierId: number): Promise<any | null> {
  try {
    const { executeGenericQuery } = await import('./queryBuilder');
    
    log.info("Getting supplier detail", { supplierId });
    
    const suppliers = await executeGenericQuery({
      select: ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'website', 'created_at'],
      from: 'dbo.wholesalers',
      where: {
        op: LogicalOperator.AND,
        conditions: [{ key: 'wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId }]
      },
      limit: 1
    }, supplierQueryConfig);

    return suppliers.length > 0 ? suppliers[0] : null;
    
  } catch (error: any) {
    log.error("Failed to get supplier detail", { error: error.message, supplierId });
    throw new Error(`Failed to retrieve supplier details: ${error.message}`);
  }
}

/**
 * Get supplier with all its categories (using JOIN)
 * @param supplierId - ID of the supplier
 * @returns Promise resolving to supplier data with categories
 */
export async function getSupplierWithCategories(supplierId: number): Promise<any[]> {
  try {
    const { executeGenericQuery } = await import('./queryBuilder');
    
    log.info("Getting supplier with categories", { supplierId });
    
    return executeGenericQuery({
      select: [
        'w.wholesaler_id', 'w.name AS supplier_name', 'w.region', 'w.status', 'w.dropship', 'w.website',
        'wc.category_id', 'pc.name AS category_name', 'pc.description AS category_description', 'wc.comment'
      ],
      from: 'supplier_categories',
      where: {
        op: LogicalOperator.AND,
        conditions: [{ key: 'w.wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId }]
      },
      orderBy: [{ key: 'pc.name', direction: 'asc' }]
    }, supplierQueryConfig);
    
  } catch (error: any) {
    log.error("Failed to get supplier with categories", { error: error.message, supplierId });
    throw new Error(`Failed to retrieve supplier categories: ${error.message}`);
  }
}

/**
 * Get category with all its offerings (using JOIN)
 * @param categoryId - ID of the category
 * @param wholesalerId - Optional: filter by specific wholesaler
 * @returns Promise resolving to category data with offerings
 */
export async function getCategoryWithOfferings(categoryId: number, wholesalerId?: number): Promise<any[]> {
  try {
    const { executeGenericQuery } = await import('./queryBuilder');
    
    log.info("Getting category with offerings", { categoryId, wholesalerId });
    
    const conditions = [{ key: 'pc.category_id', op: ComparisonOperator.EQUALS, val: categoryId }];
    if (wholesalerId) {
      conditions.push({ key: 'wio.wholesaler_id', op: ComparisonOperator.EQUALS, val: wholesalerId });
    }
    
    return executeGenericQuery({
      select: [
        'pc.category_id', 'pc.name AS category_name', 'pc.description AS category_description',
        'wio.offering_id', 'wio.product_name', 'wio.price', 'wio.stock', 'wio.status', 'wio.wholesaler_id'
      ],
      from: 'category_offerings',
      where: {
        op: LogicalOperator.AND,
        conditions
      },
      orderBy: [{ key: 'wio.product_name', direction: 'asc' }]
    }, supplierQueryConfig);
    
  } catch (error: any) {
    log.error("Failed to get category with offerings", { error: error.message, categoryId, wholesalerId });
    throw new Error(`Failed to retrieve category offerings: ${error.message}`);
  }
}

/**
 * Get offering with all its attributes (using JOIN)
 * @param offeringId - ID of the offering
 * @returns Promise resolving to offering data with attributes
 */
export async function getOfferingWithAttributes(offeringId: number): Promise<any[]> {
  try {
    const { executeGenericQuery } = await import('./queryBuilder');
    
    log.info("Getting offering with attributes", { offeringId });
    
    return executeGenericQuery({
      select: [
        'wio.offering_id', 'wio.product_name', 'wio.price', 'wio.status',
        'woa.attribute_id', 'woa.name AS attribute_name', 'woa.value', 'woa.category AS attribute_category'
      ],
      from: 'offering_attributes',
      where: {
        op: LogicalOperator.AND,
        conditions: [{ key: 'wio.offering_id', op: ComparisonOperator.EQUALS, val: offeringId }]
      },
      orderBy: [{ key: 'woa.name', direction: 'asc' }]
    }, supplierQueryConfig);
    
  } catch (error: any) {
    log.error("Failed to get offering with attributes", { error: error.message, offeringId });
    throw new Error(`Failed to retrieve offering attributes: ${error.message}`);
  }
}