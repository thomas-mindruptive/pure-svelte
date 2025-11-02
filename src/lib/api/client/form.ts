// src/lib/api/client/form.ts

/**
 * @file Form Master-Data API Client
 * @description Provides type-safe client functions for form master-data read operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryResponseData } from "$lib/api/api.types";
import type { Form } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import type { ApiClient } from "./apiClient";
import { getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";

const formLoadingManager = new LoadingState();
export const formLoadingState = formLoadingManager.isLoadingStore;

/**
 * Factory function to create a form-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with form API methods.
 */
export function getFormApi(client: ApiClient) {
  return {
    /**
     * Loads a list of forms.
     * Sends empty payload to get all forms with default columns from server.
     */
    async loadForms(): Promise<Form[]> {
      const operationId = "loadForms";
      formLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<QueryResponseData<Form>>(
          "/api/forms",
          // ⚠️⚠️⚠️ Workaround: We send body without payload => 
          // Server uses default query and columns. 
          // TODO: Use GET instead!
          { method: "POST", body:  JSON.stringify({}) },
          { context: operationId },
        );
        return responseData.results as Form[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        formLoadingManager.finish(operationId);
      }
    },
  };
}
