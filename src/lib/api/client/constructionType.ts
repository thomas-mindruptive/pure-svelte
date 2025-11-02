// src/lib/api/client/constructionTypes.ts

/**
 * @file Product Type Master-Data API Client
 * @description Provides type-safe client functions for product type master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { ConstructionType } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./apiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

const constructionTypeLoadingManager = new LoadingState();
export const constructionTypeLoadingState = constructionTypeLoadingManager.isLoadingStore;

/**
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with API methods.
 */
export function getConstructionTypeApi(client: ApiClient) {
  return {
    /**
     * Loads a list of product types.
     * Uses the generic query endpoint with a standard QueryRequest.
     */
    async loadConstructionTypes(query: Partial<QueryPayload<ConstructionType>> = {}): Promise<ConstructionType[]> {
      const operationId = "loadConstructionTypes";
      constructionTypeLoadingManager.start(operationId);
      try {
        const fullQuery: QueryPayload<ConstructionType> = {
          from: { table: "dbo.construction_types", alias: "ct" },
          select: ["construction_type_id", "name"],
          orderBy: [{ key: "name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const request: QueryRequest<ConstructionType> = {
          payload: fullQuery,
        };
        const responseData = await client.apiFetch<QueryResponseData<ConstructionType>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        return responseData.results as ConstructionType[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        constructionTypeLoadingManager.finish(operationId);
      }
    },
  };
}
