// src/routes/api/suppliers/[id]/categories-offering-count/+server.ts

/**
 * @file Supplier Categories with Offering Count API Endpoint
 * @description Returns categories with offering counts specific to a supplier
 * using the SQL function dbo.fn_categories_with_offering_count.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { v4 as uuidv4 } from "uuid";
import type { QuerySuccessResponse, QueryRequestWithPartialPayload } from "$lib/api/api.types";
import type { CategoryWithOfferingCount } from "$lib/domain/domainTypes";
import { buildUnexpectedError, validateIdUrlParam } from "$lib/backendQueries/genericEntityOperations";
import type { WhereCondition, SortDescriptor } from "$lib/backendQueries/queryGrammar";

/**
 * GET /api/suppliers/[id]/categories-offering-count
 * Get categories with offering counts for this supplier.
 */
export const GET: RequestHandler = async ({ params }) => {
  const operationId = uuidv4();
  const info = `GET /api/suppliers/${params.id}/categories-offering-count - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const result = await db.request()
      .input("supplierId", id)
      .query("SELECT * FROM dbo.fn_categories_with_offering_count(@supplierId) ORDER BY category_name");

    const categories = result.recordset as CategoryWithOfferingCount[];

    // Format the response using the standard QuerySuccessResponse type pattern from /api/categories
    const response: QuerySuccessResponse<CategoryWithOfferingCount> = {
      success: true,
      message: "Categories with offering counts retrieved successfully.",
      data: {
        results: categories,
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: categories.length,
          columns_selected: ["category_id", "category_name", "description", "offering_count"],
          has_joins: false,
          has_where: false,
          parameter_count: 1,
          table_fixed: `dbo.fn_categories_with_offering_count(${id})`,
          sql_generated: `SELECT * FROM dbo.fn_categories_with_offering_count(@supplierId) ORDER BY category_name`
        }
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${categories.length} categories.`);
    return json(response);
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};

/**
 * POST /api/suppliers/[id]/categories-offering-count
 * Get categories with offering counts with optional filtering and sorting.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/suppliers/${params.id}/categories-offering-count - ${operationId}`;
  log.infoHeader(info);

  try {
    const { id, errorResponse } = validateIdUrlParam(params.id);
    if (errorResponse) {
      return errorResponse;
    }

    const requestBody = await request.json() as QueryRequestWithPartialPayload<CategoryWithOfferingCount>;
    const clientPayload = requestBody.payload;
    log.info(`[${operationId}] Parsed request body`, { clientPayload });

    // Build SQL query
    let query = "SELECT * FROM dbo.fn_categories_with_offering_count(@supplierId)";

    // Add WHERE clause if provided
    // Note: This is a simplified implementation for the common case
    if (clientPayload?.where) {
      const where = clientPayload.where as WhereCondition<CategoryWithOfferingCount>;
      if (where.key === 'offering_count' && where.whereCondOp === '>') {
        query += ` WHERE offering_count > ${parseInt(where.val as string)}`;
      }
    }

    // Add ORDER BY clause
    if (clientPayload?.orderBy && clientPayload.orderBy.length > 0) {
      const orderClauses = clientPayload.orderBy.map((sort: SortDescriptor<CategoryWithOfferingCount>) => {
        // Clean up column names (remove aliases)
        const col = (sort.key as string).replace('c.', '').replace('cwoc.', '');
        return `${col} ${sort.direction.toUpperCase()}`;
      });
      query += ` ORDER BY ${orderClauses.join(', ')}`;
    } else {
      query += " ORDER BY category_name";
    }

    const result = await db.request()
      .input("supplierId", id)
      .query(query);

    const categories = result.recordset as CategoryWithOfferingCount[];

    // Format the response using the standard QuerySuccessResponse type pattern from /api/categories
    const response: QuerySuccessResponse<CategoryWithOfferingCount> = {
      success: true,
      message: "Categories with offering counts retrieved successfully.",
      data: {
        results: categories,
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: categories.length,
          columns_selected: ["category_id", "category_name", "description", "offering_count"],
          has_joins: false,
          has_where: !!clientPayload?.where,
          parameter_count: 1,
          table_fixed: `dbo.fn_categories_with_offering_count(${id})`,
          sql_generated: query
        }
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    };

    log.info(`[${operationId}] FN_SUCCESS: Returning ${categories.length} categories.`);
    return json(response);
  } catch (err: unknown) {
    return buildUnexpectedError(err, info);
  }
};