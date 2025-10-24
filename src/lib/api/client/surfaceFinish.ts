// src/lib/api/client/surfaceFinish.ts

/**
 * @file Surface Finish Master-Data API Client
 * @description Provides type-safe client functions for surface finish master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { SurfaceFinish } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./ApiClient";
import { createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

const surfaceFinishLoadingManager = new LoadingState();
export const surfaceFinishLoadingState = surfaceFinishLoadingManager.isLoadingStore;

/**
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with API methods.
 */
export function getSurfaceFinishApi(client: ApiClient) {
  return {
    /**
     * Loads a list of surface finishes.
     * Uses the generic query endpoint with a standard QueryRequest.
     */
    async loadSurfaceFinishes(query: Partial<QueryPayload<SurfaceFinish>> = {}): Promise<SurfaceFinish[]> {
      const operationId = "loadSurfaceFinishes";
      surfaceFinishLoadingManager.start(operationId);
      try {
        const fullQuery: QueryPayload<SurfaceFinish> = {
          from: { table: "dbo.surface_finishes", alias: "sf" },
          select: ["surface_finish_id", "name"],
          orderBy: [{ key: "name", direction: "asc" }],
          limit: 100,
          ...query,
        };
        const request: QueryRequest<SurfaceFinish> = {
          payload: fullQuery,
        };
        const responseData = await client.apiFetch<QueryResponseData<SurfaceFinish>>(
          "/api/query",
          { method: "POST", body: createJsonBody(request) },
          { context: operationId },
        );
        return responseData.results as SurfaceFinish[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        surfaceFinishLoadingManager.finish(operationId);
      }
    },
  };
}
