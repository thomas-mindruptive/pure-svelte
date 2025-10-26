// src/lib/api/client/productCategory.ts

/**
 * @file Product Category Master-Data API Client
 * @description Provides type-safe client functions for product category master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import { ProductCategorySchema, type ProductCategory } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./ApiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

const productCategoryLoadingManager = new LoadingState();
export const productCategoryLoadingState = productCategoryLoadingManager.isLoadingStore;

/**
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with API methods.
 */
export function getProductCategoryApi(client: ApiClient) {
  return {
    /**
     * Loads a list of product categories.
     * Uses the generic query endpoint with a standard QueryRequest.
     */
    async loadProductCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
      const operationId = "loadProductCategories";
      productCategoryLoadingManager.start(operationId);
      try {
        const cols = genTypedQualifiedColumns(ProductCategorySchema, false);
        const fullQuery: QueryPayload<ProductCategory> = {
          from: { table: "dbo.product_categories", alias: "pc" },
          select: cols,
          orderBy: [{ key: "name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const request: QueryRequest<ProductCategory> = {
          payload: fullQuery,
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        return responseData.results as ProductCategory[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        productCategoryLoadingManager.finish(operationId);
      }
    },
  };
}
