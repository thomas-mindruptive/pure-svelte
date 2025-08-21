import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSuppliers } from '$lib/server/supplierQueryConfig';
import { log } from '$lib/utils/logger';

/**
 * GET /api/suppliers
 * Returns list of all suppliers with basic information
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    // Parse query parameters
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam), 1000) : 100; // Cap at 1000
    
    log.info("API: Getting suppliers list", { limit, userAgent: url.searchParams.get('ua') });
    
    // Use convenience function from domain config
    const suppliers = await getSuppliers(limit);
    
    log.info("API: Suppliers retrieved successfully", { count: suppliers.length });
    
    return json({ 
      suppliers,
      meta: {
        count: suppliers.length,
        limit
      }
    });
    
  } catch (err: any) {
    log.error("API: Failed to get suppliers", { 
      error: err.message,
      stack: err.stack
    });
    
    throw error(500, 'Failed to retrieve suppliers');
  }
};

/**
 * POST /api/suppliers  
 * Creates a new supplier (placeholder for future implementation)
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const supplierData = await request.json();
    
    log.info("API: Creating new supplier", { name: supplierData?.name });
    
    // TODO: Implement supplier creation logic
    // This would use INSERT statements, not the QueryBuilder
    
    throw error(501, 'Supplier creation not yet implemented');
    
  } catch (err: any) {
    log.error("API: Failed to create supplier", { error: err.message });
    throw error(500, 'Failed to create supplier');
  }
};