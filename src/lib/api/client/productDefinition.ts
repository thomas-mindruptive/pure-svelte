// src/lib/api/client/productDefinition.ts

/**
 * @file Product Definition Master-Data API Client
 * @description Provides type-safe client functions for product definition master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from "$lib/utils/logger";
import { type QueryPayload } from "$lib/backendQueries/queryGrammar";
import { WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema, type ProductDefinition, type WholesalerItemOffering_ProductDef_Category_Supplier_Nested } from "$lib/domain/domainTypes";
import type { ApiClient } from "./ApiClient";
import { createJsonBody, createJsonAndWrapInPayload, getErrorMessage } from "./common";
import type { DeleteApiResponse, DeleteRequest, PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import { LoadingState } from "./loadingState";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";


// Create a dedicated loading state manager for this entity.
const productDefinitionLoadingManager = new LoadingState();
export const productDefinitionLoadingState = productDefinitionLoadingManager.isLoadingStore;

/**
 * The default query payload used when fetching product definitions.
 */
export const DEFAULT_PRODUCT_DEFINITION_QUERY: QueryPayload<ProductDefinition> = {
  select: ["product_def_id", "title", "description", "category_id"],
  orderBy: [{ key: "title", direction: "asc" }],
  limit: 200,
};

/**
 * Factory function to create a product-definition-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all product definition API methods.
 */
export function getProductDefinitionApi(client: ApiClient) {
  return {
    /**
     * Loads a list of product definitions.
     */
    async loadProductDefinitions(query: Partial<QueryPayload<ProductDefinition>> = {}): Promise<ProductDefinition[]> {
      const operationId = "loadProductDefinitions";
      productDefinitionLoadingManager.start(operationId);
      try {
        const fullQuery: QueryPayload<ProductDefinition> = {
          ...DEFAULT_PRODUCT_DEFINITION_QUERY,
          ...query,
        };
        const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
          "/api/product-definitions",
          { method: "POST", body: createJsonAndWrapInPayload(fullQuery) },
          { context: operationId },
        );
        return responseData.results as ProductDefinition[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads a single product definition by its ID.
     */
    async loadProductDefinition(productDefId: number): Promise<ProductDefinition> {
      const operationId = `loadProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ productDefinition: ProductDefinition }>(
          `/api/product-definitions/${productDefId}`,
          { method: "GET" },
          { context: operationId },
        );
        return responseData.productDefinition;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new product definition.
     */
    async createProductDefinition(productDefData: Omit<ProductDefinition, "product_def_id">): Promise<ProductDefinition> {
      const operationId = "createProductDefinition";
      productDefinitionLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ productDefinition: ProductDefinition }>(
          "/api/product-definitions/new",
          { method: "POST", body: createJsonBody(productDefData) },
          { context: operationId },
        );
        return responseData.productDefinition;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefData, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing product definition.
     */
    async updateProductDefinition(productDefId: number, updates: Partial<ProductDefinition>): Promise<ProductDefinition> {
      const operationId = `updateProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ productDefinition: ProductDefinition }>(
          `/api/product-definitions/${productDefId}`,
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
        );
        return responseData.productDefinition;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },

    /**
     * Deletes a product definition.
     * Note: Cascade might fail due to due to hard dependencies. => To be configured on server in "checkProductDefinitionDependencies".
     */
    async deleteProductDefinition(
      productDefId: number,
      cascade = false,
      forceCascade = false
    ): Promise<DeleteApiResponse<Pick<ProductDefinition, "product_def_id" | "title">, string[]>> {
      const operationId = `deleteProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        // Note: Cascade might fail due to due to hard dependencies. => To be configured on server in "checkProductDefinitionDependencies".
        const removeRequest: DeleteRequest<ProductDefinition> = {
          id: productDefId,
          cascade,
          forceCascade
        };
        const body = createJsonBody(removeRequest);

        const url = `/api/product-definitions/${productDefId}`;
        return await client.apiFetchUnion<DeleteApiResponse<Pick<ProductDefinition, "product_def_id" | "title">, string[]>>(
          url,
          { method: "DELETE", body },
          { context: operationId },
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },

    // === RELATED LISTS ============================================================================

    /**
     * Loads all offerings for a specific product definition across all suppliers.
     * Uses a named query to join with supplier and category data for a rich result.
     * @param productDefId The ID of the product definition.
     * @returns A promise that resolves to an array of offerings with details.
     */
    async loadOfferingsForProductDefinition(productDefId: number): Promise<WholesalerItemOffering_ProductDef_Category_Supplier_Nested[]> {
      const operationId = `loadOfferingsForProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        const cols = genTypedQualifiedColumns(WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema, true);
        const payload: QueryPayload<WholesalerItemOffering_ProductDef_Category_Supplier_Nested> = {
          select: cols,
          where: {
            whereCondOp: "AND",
            conditions: [{ key: "wio.product_def_id", whereCondOp: "=", val: productDefId }],
          },
          orderBy: [{ key: "w.name", direction: "asc" }],
        };

        const request: PredefinedQueryRequest<WholesalerItemOffering_ProductDef_Category_Supplier_Nested> = {
          namedQuery: "product_definition_offerings",
          payload: payload,
        };

        const responseData = await client.apiFetch<QueryResponseData<WholesalerItemOffering_ProductDef_Category_Supplier_Nested>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        const transformed = transformToNestedObjects(
          responseData.results as Record<string, unknown>[],
          WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema,
        );
        return transformed;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },
  };
}
