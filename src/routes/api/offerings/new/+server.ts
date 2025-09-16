// src/routes/api/offerings/+server.ts

/**
 * @file Offerings List API Endpoint - FINAL ARCHITECTURE
 * @description POST /api/offerings - Provides type-safe, paginated, and filterable
 * access to the wholesaler_item_offerings list. It strictly follows the "Secure Entity Endpoint"
 * pattern by enforcing the database table name on the server.
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { supplierQueryConfig } from '$lib/backendQueries/queryConfig';
import { mssqlErrorMapper } from '$lib/server/errors/mssqlErrorMapper';
import type { WholesalerItemOffering, WholesalerItemOffering_ProductDef_Category_Supplier } from '$lib/domain/domainTypes';
import type { ApiErrorResponse, ApiSuccessResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';
import type { QueryPayload } from '$lib/backendQueries/queryGrammar';
import { db } from '$lib/backendQueries/db';
import { validateOffering } from '$lib/server/validation/domainValidator';


/**
 * @description Creates a new offering.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  log.infoHeader("POST /api/offerings/new - ${operationId}");

  const transaction = db.transaction();

  try {
    log.info(`Begin DB transaction`);
    await transaction.begin();

    // 1. Expect the request body to be CreateChildRequest.
    const offering = (await request.json()) as Omit<WholesalerItemOffering, "offering_id">;
    log.info(`[${operationId}] Parsed request body`, { fields: Object.keys(offering) });

    // 2. Validate the incoming data in 'create' mode.
    const validation = validateOffering(offering, { mode: "create" });
    if (!validation.isValid) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Server validation failed. Please check the provided data: ${JSON.stringify(validation.errors)}`,
        status_code: 400,
        error_code: "VALIDATION_ERROR",
        errors: validation.errors,
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Validation failed.`, { errors: validation.errors });
      return json(errRes, { status: 400 });
    }

    // 3. Use the sanitized data from the validator for the database operation.
    const { wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment } = validation.sanitized as Partial<
      Omit<WholesalerItemOffering, "offering_id">
    >;

    // 4. Verify that supplier and category exist and are related
    const relationCheck = await transaction.request().input("wholesalerId", wholesaler_id).input("categoryId", category_id).query(`
                SELECT 
                    (SELECT name FROM dbo.wholesalers WHERE wholesaler_id = @wholesalerId) as supplier_name,
                    (SELECT name FROM dbo.product_categories WHERE category_id = @categoryId) as category_name,
                    (SELECT COUNT(*) FROM dbo.wholesaler_categories 
                     WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId) as assignment_exists
            `);

    const { supplier_name, category_name, assignment_exists } = relationCheck.recordset[0];

    if (!supplier_name) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Supplier with ID ${wholesaler_id} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Supplier not found.`, { wholesaler_id });
      return json(errRes, { status: 404 });
    }

    if (!category_name) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Category with ID ${category_id} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Category not found.`, { category_id });
      return json(errRes, { status: 404 });
    }

    if (!assignment_exists) {
      const errRes: ApiErrorResponse = {
        success: false,
        message: `Category "${category_name}" is not assigned to supplier "${supplier_name}". Please assign the category first.`,
        status_code: 400,
        error_code: "BAD_REQUEST",
        meta: { timestamp: new Date().toISOString() },
      };
      log.warn(`[${operationId}] FN_FAILURE: Category not assigned to supplier.`, {
        wholesaler_id,
        category_id,
      });
      return json(errRes, { status: 400 });
    }

    // 5. Execute the INSERT query and use 'OUTPUT INSERTED.*' to get the new record back.
    const result = await transaction
      .request()
      .input("wholesaler_id", wholesaler_id)
      .input("category_id", category_id)
      .input("product_def_id", product_def_id)
      .input("size", size)
      .input("dimensions", dimensions)
      .input("price", price)
      .input("currency", currency)
      .input("comment", comment).query(`
                INSERT INTO dbo.wholesaler_item_offerings (
                    wholesaler_id, category_id, product_def_id, size, dimensions, price, currency, comment
                ) 
                OUTPUT INSERTED.* 
                VALUES (
                    @wholesaler_id, @category_id, @product_def_id, @size, @dimensions, @price, @currency, @comment
                )
            `);

    if (result.recordset.length === 0) {
      log.error(`[${operationId}] FN_EXCEPTION: INSERT operation returned no record.`);
      throw error(500, "Failed to create offering after database operation.");
    }

    const newOffering = result.recordset[0] as WholesalerItemOffering;
    const newOfferingId = newOffering.offering_id;

    // ===== JOIN QUERY TO RETRIEVE OFFERING + PRODCUT_DEF_TITLE =====

    const queryPayloadOfferingPlusProdDef: QueryPayload<WholesalerItemOffering_ProductDef_Category_Supplier> = {
      select: [
        // Select all columns from the offering itself (alias 'wio')
        "wio.offering_id",
        "wio.wholesaler_id",
        "wio.category_id",
        "wio.product_def_id",
        "wio.price",
        "wio.currency",
        "wio.size",
        "wio.dimensions",
        "wio.comment",
        "wio.created_at",
        // And the title from the joined product definition (alias 'pd')
        "pd.title AS product_def_title",
      ],
      where: {
        key: "wio.offering_id",
        whereCondOp: "=",
        val: newOfferingId,
      },
      orderBy: [{ key: "wio.offering_id", direction: "asc" }],
      limit: 1,
    };

    const { sql: builtSql, parameters } = buildQuery(
      queryPayloadOfferingPlusProdDef,
      supplierQueryConfig,
      "wholesaler_item_offering_product_def", // <-- KORREKTER NAME WIRD VERWENDET
    );

    const fullObjectResult = await executeQuery(builtSql, parameters, { transaction });

    if (!fullObjectResult || fullObjectResult.length === 0) {
      throw new Error(`Could not retrieve the newly created offering (ID: ${newOfferingId}) using the predefined query.`);
    }

    const newOfferingFull = fullObjectResult[0] as WholesalerItemOffering_ProductDef_Category_Supplier;

    await transaction.commit();
    log.debug(`[${operationId}] Transaction committed successfully.`);

    const response: ApiSuccessResponse<{ offering: WholesalerItemOffering }> = {
      success: true,
      message: `Offering created successfully in category "${category_name}" for supplier "${supplier_name}". Returning offering including product_def_title`,
      data: { offering: newOfferingFull },
      meta: { timestamp: new Date().toISOString() },
    };

    log.info(`[${operationId}] FN_SUCCESS: Offering created with ID ${newOffering.offering_id}.`);
    return json(response, { status: 201 });
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during offering creation.`, { error: err });
    await transaction.rollback();
    throw error(status, message);
  }
};