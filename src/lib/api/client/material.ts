// src/lib/api/client/material.ts

/**
 * @file Material Master-Data API Client
 * @description Provides type-safe client functions for material master-data read operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryResponseData } from "$lib/api/api.types";
import type { Material } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./apiClient";
import { getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

const materialLoadingManager = new LoadingState();
export const materialLoadingState = materialLoadingManager.isLoadingStore;

/**
 * Factory function to create a material-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with material API methods.
 */
export function getMaterialApi(client: ApiClient) {
  return {
    /**
     * Loads a list of materials.
     * Sends empty payload to get all materials with default columns from server.
     */
    async loadMaterials(): Promise<Material[]> {
      const operationId = "loadMaterials";
      materialLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<QueryResponseData<Material>>(
          "/api/materials",
          // ⚠️⚠️⚠️ Workaround: We send body without payload => 
          // Server uses default query and columns. 
          // TODO: Use GET instead!
          { method: "POST", body:  JSON.stringify({})  },
          { context: operationId },
        );
        return responseData.results as Material[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        materialLoadingManager.finish(operationId);
      }
    },
  };
}
