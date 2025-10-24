// src/lib/api/client/productTypes.ts

/**
 * @file Product Type Master-Data API Client
 * @description Provides type-safe client functions for product type master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { ProductType } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./ApiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

const productTypeLoadingManager = new LoadingState();
export const productTypeLoadingState = productTypeLoadingManager.isLoadingStore;

/**
 * Factory function to create a product-type-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with product type API methods.
 */
export function getProductTypeApi(client: ApiClient) {
  return {
    /**
     * Loads a list of product types.
     * Uses the generic query endpoint with a standard QueryRequest.
     */
    async loadProductTypes(query: Partial<QueryPayload<ProductType>> = {}): Promise<ProductType[]> {
      const operationId = "loadProductTypes";
      productTypeLoadingManager.start(operationId);
      try {
        const fullQuery: QueryPayload<ProductType> = {
          from: { table: "dbo.product_types", alias: "pt" },
          select: ["product_type_id", "name"],
          orderBy: [{ key: "name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const request: QueryRequest<ProductType> = {
          payload: fullQuery,
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductType>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        return responseData.results as ProductType[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        productTypeLoadingManager.finish(operationId);
      }
    },
  };
}
