// src/lib/api/client/attribute.ts

/**
 * @file Attribute Master-Data API Client - FINAL ARCHITECTURE
 * @description Provides type-safe client functions for attribute master-data operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from "$lib/utils/logger";
import {
  ComparisonOperator,
  LogicalOperator,
  type QueryPayload,
  type WhereCondition,
  type WhereConditionGroup,
} from "$lib/backendQueries/queryGrammar";
import type { Attribute } from "$lib/domain/domainTypes";

import type { ApiClient } from "./ApiClient";
import { createJsonBody, createJsonAndWrapInPayload, getErrorMessage } from "./common";
import type { DeleteApiResponse, DeleteRequest, QueryResponseData } from "$lib/api/api.types";
import { LoadingState } from "./loadingState";

const attributeLoadingManager = new LoadingState();
export const attributeLoadingState = attributeLoadingManager.isLoadingStore;
export const attributeLoadingOperations = attributeLoadingManager;

/**
 * The default query payload used when fetching attributes.
 */
export const DEFAULT_ATTRIBUTE_QUERY: QueryPayload<Attribute> = {
  select: ["attribute_id", "name", "description"],
  orderBy: [{ key: "name", direction: "asc" }],
  limit: 100,
};

/**
 * Factory function to create an attribute-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all attribute API methods.
 */
export function getAttributeApi(client: ApiClient) {
  return {
    // ===== ATTRIBUTE MASTER-DATA CRUD =====

    /**
     * Loads a list of attributes.
     */
    async loadAttributes(query: Partial<QueryPayload<Attribute>> = {}): Promise<Attribute[]> {
      const operationId = "loadAttributes";
      attributeLoadingOperations.start(operationId);
      try {
        const fullQuery: QueryPayload<Attribute> = { ...DEFAULT_ATTRIBUTE_QUERY, ...query };
        const responseData = await client.apiFetch<QueryResponseData<Attribute>>(
          "/api/attributes",
          { method: "POST", body: createJsonAndWrapInPayload(fullQuery) },
          { context: operationId },
        );
        return responseData.results as Attribute[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads a single attribute by its ID.
     */
    async loadAttribute(attributeId: number): Promise<Attribute> {
      const operationId = `loadAttribute-${attributeId}`;
      attributeLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ attribute: Attribute }>(
          `/api/attributes/${attributeId}`,
          { method: "GET" },
          { context: operationId },
        );
        return responseData.attribute;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { attributeId, error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new attribute.
     */
    async createAttribute(attributeData: Partial<Omit<Attribute, "attribute_id">>): Promise<Attribute> {
      const operationId = "createAttribute";
      attributeLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ attribute: Attribute }>(
          "/api/attributes/new",
          { method: "POST", body: createJsonBody(attributeData) },
          { context: operationId },
        );
        return responseData.attribute;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { attributeData, error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing attribute.
     */
    async updateAttribute(attributeId: number, updates: Partial<Attribute>): Promise<Attribute> {
      const operationId = `updateAttribute-${attributeId}`;
      attributeLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ attribute: Attribute }>(
          `/api/attributes/${attributeId}`,
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
        );
        return responseData.attribute;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { attributeId, updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },

 /**
     * Deletes an attribute.
     */
    async deleteAttribute(
      attributeId: number,
      cascade = false,
      forceCascade = false,
    ): Promise<DeleteApiResponse<{ attribute_id: number; name: string }, string[]>> {
      const operationId = `deleteAttribute-${attributeId}`;
      attributeLoadingOperations.start(operationId);
      try {
        const url = `/api/attributes/${attributeId}`;
        
        // The API expects the flags in the request body, consistent with the DeleteRequest<T> pattern.
        const deleteRequest: DeleteRequest<Attribute> = {
            id: attributeId,
            cascade,
            forceCascade
        };
        const body = createJsonBody(deleteRequest);

        return await client.apiFetchUnion<DeleteApiResponse<{ attribute_id: number; name: string }, string[]>>(
          url,
          { method: "DELETE", body },
          { context: operationId },
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { attributeId, cascade, forceCascade, error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },

    /**
     * Searches attributes by name.
     */
    async searchAttributes(searchTerm: string, limit = 20): Promise<Attribute[]> {
      const operationId = `searchAttributes-${searchTerm}`;
      attributeLoadingOperations.start(operationId);
      try {
        if (!searchTerm.trim()) return [];
        const query: QueryPayload<Attribute> = {
          select: ["attribute_id", "name", "description"],
          where: { key: 'name', whereCondOp: "LIKE", val: `%${searchTerm.trim()}%` },
        // This could be a simpler way (in the future - need to adjust queryGrammar with "InlineWhereCondition"...):
        //   where: [
        //     ["name", "LIKE", `%${searchTerm.trim()}%`],
        //     "AND",
        //     [["name", "LIKE", `%${searchTerm.trim()}%`], "AND", ["name", "LIKE", `%${searchTerm.trim()}%`]],
        //   ],
          orderBy: [{ key: "name", direction: "asc" }],
          limit,
        };
        const responseData = await client.apiFetch<QueryResponseData<Attribute>>(
          "/api/attributes",
          { method: "POST", body: createJsonAndWrapInPayload(query) },
          { context: operationId },
        );
        return responseData.results as Attribute[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { searchTerm, error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },

    /**
     * Validates if an attribute name is available.
     */
    async isAttributeNameAvailable(name: string, excludeId?: number): Promise<boolean> {
      const operationId = `isAttributeNameAvailable-${name}`;
      attributeLoadingOperations.start(operationId);
      try {
        if (!name.trim()) return false;
        const nameCondition: WhereCondition<Attribute> = { key: "name", whereCondOp: ComparisonOperator.EQUALS, val: name.trim() };
        let whereCondition: WhereCondition<Attribute> | WhereConditionGroup<Attribute> = nameCondition;

        if (excludeId) {
          const excludeCondition: WhereCondition<Attribute> = {
            key: "attribute_id",
            whereCondOp: ComparisonOperator.NOT_EQUALS,
            val: excludeId,
          };
          whereCondition = { whereCondOp: LogicalOperator.AND, conditions: [nameCondition, excludeCondition] };
        }

        const query: QueryPayload<Attribute> = { select: ["attribute_id"], where: whereCondition, limit: 1 };
        const responseData = await client.apiFetch<QueryResponseData<Attribute>>(
          "/api/attributes",
          { method: "POST", body: createJsonAndWrapInPayload(query) },
          { context: operationId },
        );
        return responseData.results.length === 0;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { name, excludeId, error: getErrorMessage(err) });
        throw err;
      } finally {
        attributeLoadingOperations.finish(operationId);
      }
    },
  };
}
