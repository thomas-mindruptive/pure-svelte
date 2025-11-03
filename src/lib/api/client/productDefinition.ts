// src/lib/api/client/productDefinition.ts

/**
 * @file Product Definition Master-Data API Client
 * @description Provides type-safe client functions for product definition master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { DeleteApiResponse, DeleteRequest, PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import { type QueryPayload, type SortDescriptor, type WhereCondition, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
import { transformToNestedObjects } from "$lib/backendQueries/recordsetTransformer";
import {
  Wio_PDef_Cat_Supp_Nested_Schema,
  type ProductDefinition,
  type WholesalerItemOffering,
  type Wio_PDef_Cat_Supp_Nested,
  type Wio_PDef_Cat_Supp_Nested_WithLinks,
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./apiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";
import { getOfferingApi } from "./offering";

// Create a dedicated loading state manager for this entity.
const productDefinitionLoadingManager = new LoadingState();
export const productDefinitionLoadingState = productDefinitionLoadingManager.isLoadingStore;

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
        // TODO: All endpoints should check null or empty payload. Either use default or return ApiErrorResponse.
        // /api/product-definitions handles it corretly already.
        const body = query? createJsonBody({payload: query}) : null;
        const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
          "/api/product-definitions",
          { method: "POST", body },
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
      forceCascade = false,
    ): Promise<DeleteApiResponse<Pick<ProductDefinition, "product_def_id" | "title">, string[]>> {
      const operationId = `deleteProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        // Note: Cascade might fail due to due to hard dependencies. => To be configured on server in "checkProductDefinitionDependencies".
        const removeRequest: DeleteRequest<ProductDefinition> = {
          id: productDefId,
          cascade,
          forceCascade,
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
    async loadOfferingsForProductDefinition(
      productDefId: number,
      aWhere?: WhereConditionGroup<Wio_PDef_Cat_Supp_Nested> | null,
      aOrderBy?: SortDescriptor<Wio_PDef_Cat_Supp_Nested>[] | null,
    ): Promise<Wio_PDef_Cat_Supp_Nested[]> {
      const operationId = `loadOfferingsForProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        // The COLUMNS are already defined in queryConfig.ts!
        // => not needed: const cols = genTypedQualifiedColumns(Wio_PDef_Cat_Supp_Nested_Schema, true);
        let finalWhere: WhereConditionGroup<Wio_PDef_Cat_Supp_Nested> | WhereCondition<Wio_PDef_Cat_Supp_Nested> = {
          whereCondOp: "AND",
          conditions: [{ key: "wio.product_def_id", whereCondOp: "=", val: productDefId }],
        };
        if (aWhere) {
          finalWhere = {whereCondOp: "AND", conditions:[aWhere, finalWhere]}
        }

        let finalOrderBy: SortDescriptor<Wio_PDef_Cat_Supp_Nested>[] = [{ key: "w.name", direction: "asc" }];
        if (aOrderBy) {
          finalOrderBy = [...finalOrderBy, ...aOrderBy];
        }

        const payload = {
          //select: cols, => DONE IN queryConfig.ts!
          where: finalWhere,
          orderBy: finalOrderBy,
        };

        const request: PredefinedQueryRequest<Wio_PDef_Cat_Supp_Nested> = {
          namedQuery: "product_definition_offerings",
          payload: payload,
        };

        const responseData = await client.apiFetch<QueryResponseData<Wio_PDef_Cat_Supp_Nested>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        const transformed = transformToNestedObjects(responseData.results as Record<string, unknown>[], Wio_PDef_Cat_Supp_Nested_Schema);
        return transformed;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads all offerings with links for a specific product definition across all suppliers.
     * Uses the nested offerings endpoint with full JSON structure including links.
     * @param productDefId The ID of the product definition.
     * @param aWhere Optional additional WHERE conditions.
     * @param aOrderBy Optional sort descriptors.
     * @param aLimit Optional limit for pagination.
     * @param aOffset Optional offset for pagination.
     * @returns A promise that resolves to an array of nested offerings with links.
     */
    async loadNestedOfferingsWithLinksForProductDefinition(
      productDefId: number,
      aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering> | null,
      aOrderBy?: SortDescriptor<WholesalerItemOffering>[] | null,
      aLimit?: number | null,
      aOffset?: number | null,
    ): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> {
      const operationId = `loadNestedOfferingsWithLinksForProductDefinition-${productDefId}`;
      productDefinitionLoadingManager.start(operationId);
      try {
        const offeringApi = getOfferingApi(client);

        let finalWhere: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering> = {
          whereCondOp: "AND",
          conditions: [{ key: "wio.product_def_id", whereCondOp: "=", val: productDefId }], // Qualified for JOIN query
        };
        if (aWhere) {
          finalWhere = { whereCondOp: "AND", conditions: [aWhere, finalWhere] };
        }

        const offerings = await offeringApi.loadNestedOfferingsWithLinks(finalWhere, aOrderBy, aLimit, aOffset);
        return offerings;

        // const payload: QueryPayload<WholesalerItemOffering> = {
        //   // ⚠️ "select" not used by nested endpoint - uses wio.* in SQL
        //   select: [], 
        //   where: finalWhere,
        //   ...(aOrderBy && { orderBy: aOrderBy }),
        //   ...(aLimit && { limit: aLimit }),
        //   ...(aOffset && { offset: aOffset }),
        // };

        // const responseData = await client.apiFetch<QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks>>(
        //   "/api/offerings/nested",
        //   { method: "POST", body: createJsonBody(payload) },
        //   { context: operationId },
        // );
        // return responseData.results as Wio_PDef_Cat_Supp_Nested_WithLinks[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionLoadingManager.finish(operationId);
      }
    },
  };
}
