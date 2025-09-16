// src/lib/api/client/offering.ts

/**
 * @file Offering API Client - TYPE-SAFE COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for offering-related operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from "$lib/utils/logger";
import { ComparisonOperator, JoinType, LogicalOperator, type QueryPayload } from "$lib/backendQueries/queryGrammar";
import type {
  WholesalerItemOffering,
  WholesalerItemOffering_ProductDef_Category_Supplier,
  WholesalerOfferingAttribute,
  WholesalerOfferingAttribute_Attribute,
  WholesalerOfferingLink,
  Attribute,
  ProductDefinition,
  WholesalerItemOffering_ProductDef,
} from "$lib/domain/domainTypes";

import type { ApiClient } from "./ApiClient";
import { createPostBody, createQueryBody, getErrorMessage } from "./common";
import type {
  DeleteApiResponse,
  PredefinedQueryRequest,
  QueryResponseData,
  AssignmentSuccessData,
  AssignmentRequest,
  AssignmentUpdateRequest,
  RemoveAssignmentRequest,
  CreateChildRequest,
  DeleteRequest,
} from "$lib/api/api.types";
import { LoadingState } from "./loadingState";
import { Query } from "$lib/backendQueries/fluentQueryBuilder";
import { assertDefined } from "$lib/utils/validation/assertions";
import type { DeleteOfferingApiResponse } from "../app/appSpecificTypes";
const offeringLoadingManager = new LoadingState();
export const offeringLoadingState = offeringLoadingManager.isLoadingStore;

/**
 * Factory function to create an offering-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all offering and offering-composition API methods.
 */
export function getOfferingApi(client: ApiClient) {
  const api = {
    // ===== CRUD =====

    /**
     * Loads a single offering with all its details by ID.
     */
    async loadOffering(offeringId: number): Promise<WholesalerItemOffering_ProductDef_Category_Supplier> {
      log.info(`API, Loading offering: ${offeringId}`);
      const operationId = `loadOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{
          offering: WholesalerItemOffering_ProductDef_Category_Supplier;
        }>(`/api/offerings/${offeringId}`, { method: "GET" }, { context: operationId });
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new offering.
     */
    async createOffering(offeringData: Omit<WholesalerItemOffering, "offering_id">): Promise<WholesalerItemOffering_ProductDef> {
      assertDefined(
        offeringData,
        "offeringData.supplierId and offeringData.categoryId must be defined",
        ["wholesaler_id"],
        ["category_id"],
      );
      const operationId = "createOfferingForCategory";
      offeringLoadingManager.start(operationId);
      try {
        const body = createPostBody(offeringData);
        const responseData = await client.apiFetch<{ offering: WholesalerItemOffering_ProductDef }>(
          "/api/offerings/new",
          { method: "POST", body },
          { context: operationId },
        );
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringData, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing offering.
     */
    async updateOffering(offeringId: number, updates: Partial<WholesalerItemOffering>): Promise<WholesalerItemOffering> {
      assertDefined(offeringId, "offeringID");
      const operationId = `updateOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const body = createPostBody({ offering_id: offeringId, ...updates });
        const responseData = await client.apiFetch<{ offering: WholesalerItemOffering }>(
          `/api/offerings/${offeringId}`,
          { method: "PUT", body },
          { context: operationId },
        );
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Deletes an offering.
     */
    async deleteOffering(offeringId: number, cascade = false): Promise<DeleteOfferingApiResponse> {
      assertDefined(offeringId, "offeringId");
      const operationId = `deleteOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const url = `/api/offerings/${offeringId}`;

        const removeRequest: DeleteRequest<WholesalerItemOffering> = {
          id: offeringId,
          cascade,
        };
        const body = createPostBody(removeRequest);
        return await client.apiFetchUnion<DeleteOfferingApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    // ===== ATTRIBUTE MANAGEMENT =====

    /**
     * Loads all attributes assigned to a specific offering.
     */
    async loadOfferingAttributes(offeringId: number): Promise<WholesalerOfferingAttribute_Attribute[]> {
      const operationId = `loadOfferingAttributes-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const request: PredefinedQueryRequest = {
          namedQuery: "offering_attributes",
          payload: {
            select: [
              "woa.offering_id",
              "woa.attribute_id",
              "woa.value",
              "a.name AS attribute_name",
              "a.description AS attribute_description",
            ],
            where: {
              whereCondOp: LogicalOperator.AND,
              conditions: [
                {
                  key: "wio.offering_id",
                  whereCondOp: ComparisonOperator.EQUALS,
                  val: offeringId,
                },
              ],
            },
            orderBy: [{ key: "a.name", direction: "asc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<WholesalerOfferingAttribute_Attribute>>(
          "/api/query",
          { method: "POST", body: createPostBody(request) },
          { context: operationId },
        );
        return responseData.results as WholesalerOfferingAttribute_Attribute[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          offeringId,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads all available attributes from master table for assignment purposes.
     * Note: This method queries the ATTRIBUTES master data.
     */
    async loadAvailableAttributes(): Promise<Attribute[]> {
      const operationId = "loadAvailableAttributes";
      offeringLoadingManager.start(operationId);
      try {
        const query: QueryPayload<Attribute> = {
          select: ["attribute_id", "name", "description"],
          orderBy: [{ key: "name", direction: "asc" }],
        };
        const responseData = await client.apiFetch<QueryResponseData<Attribute>>(
          "/api/attributes",
          { method: "POST", body: createQueryBody(query) },
          { context: operationId },
        );
        return responseData.results as Attribute[];
      } catch (err) {
        log.error(`[${operationId}] Failed to load available attributes.`, {
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Gets available attributes that are not yet assigned to a specific offering.
     */
    async getAvailableAttributesForOffering(offeringId: number): Promise<Attribute[]> {
      const operationId = `getAvailableAttributesForOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const [allAttributes, assignedAttributes] = await Promise.all([
          api.loadAvailableAttributes(),
          api.loadOfferingAttributes(offeringId),
        ]);

        const assignedIds = new Set(assignedAttributes.map((a) => a.attribute_id));
        const availableAttributes = allAttributes.filter((attr) => !assignedIds.has(attr.attribute_id));
        return availableAttributes;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          offeringId,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new offering-attribute assignment.
     */
    async createOfferingAttribute(assignmentData: Omit<WholesalerOfferingAttribute, "id">): Promise<WholesalerOfferingAttribute> {
      const operationId = "createOfferingAttribute";
      offeringLoadingManager.start(operationId);
      try {
        const requestBody: AssignmentRequest<WholesalerItemOffering, Attribute, Omit<WholesalerOfferingAttribute, "id">> = {
          parent1Id: assignmentData.offering_id,
          parent2Id: assignmentData.attribute_id,
          data: assignmentData,
        };
        const responseData = await client.apiFetch<AssignmentSuccessData<WholesalerOfferingAttribute>>(
          "/api/offering-attributes",
          { method: "POST", body: createPostBody(requestBody) },
          { context: operationId },
        );
        return responseData.assignment;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          assignmentData,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing offering-attribute assignment.
     */
    async updateOfferingAttribute(offeringAttribute: WholesalerOfferingAttribute): Promise<WholesalerOfferingAttribute> {
      const operationId = `updateOfferingAttribute-${offeringAttribute.offering_id}-${offeringAttribute.attribute_id}`;
      offeringLoadingManager.start(operationId);
      try {
        const requestBody: AssignmentUpdateRequest<WholesalerItemOffering, Attribute, WholesalerOfferingAttribute> = {
          parent1Id: offeringAttribute.offering_id,
          parent2Id: offeringAttribute.attribute_id,
          data: offeringAttribute,
        };
        const responseData = await client.apiFetch<AssignmentSuccessData<WholesalerOfferingAttribute>>(
          `/api/offering-attributes`,
          { method: "PUT", body: createPostBody(requestBody) },
          { context: operationId },
        );
        return responseData.assignment;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          offeringAttribute,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Deletes an offering-attribute assignment.
     */
    async deleteOfferingAttribute(
      offeringId: number,
      attributeId: number,
      cascade = false,
    ): Promise<DeleteApiResponse<{ offering_id: number; attribute_id: number; attribute_name: string }, string[]>> {
      const operationId = `deleteOfferingAttribute-${offeringId}-${attributeId}`;
      offeringLoadingManager.start(operationId);
      try {
        const requestBody: RemoveAssignmentRequest<WholesalerItemOffering, Attribute> = {
          parent1Id: offeringId,
          parent2Id: attributeId,
          cascade,
        };
        return await client.apiFetchUnion<
          DeleteApiResponse<
            {
              offering_id: number;
              attribute_id: number;
              attribute_name: string;
            },
            string[]
          >
        >("/api/offering-attributes", { method: "DELETE", body: createPostBody(requestBody) }, { context: operationId });
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          offeringId,
          attributeId,
          cascade,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    // ===== LINK MANAGEMENT =====

    /**
     * Loads all links for a specific offering.
     */
    async loadOfferingLinks(offeringId: number): Promise<WholesalerOfferingLink[]> {
      const operationId = `loadOfferingLinks-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const request: PredefinedQueryRequest = {
          namedQuery: "offering_links",
          payload: {
            select: ["wol.link_id", "wol.offering_id", "wol.url", "wol.notes", "wol.created_at"],
            where: {
              whereCondOp: LogicalOperator.AND,
              conditions: [
                {
                  key: "wio.offering_id",
                  whereCondOp: ComparisonOperator.EQUALS,
                  val: offeringId,
                },
              ],
            },
            orderBy: [{ key: "wol.created_at", direction: "desc" }],
          },
        };
        const responseData = await client.apiFetch<QueryResponseData<WholesalerOfferingLink>>(
          "/api/query",
          { method: "POST", body: createPostBody(request) },
          { context: operationId },
        );
        log.info(`[${operationId}] Loaded ${responseData.results.length} links for offering ${offeringId}.`, responseData.results);
        return responseData.results as WholesalerOfferingLink[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          offeringId,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new offering link.
     */
    async createOfferingLink(linkData: Omit<WholesalerOfferingLink, "link_id">): Promise<WholesalerOfferingLink> {
      const operationId = "createOfferingLink";
      offeringLoadingManager.start(operationId);
      try {
        const requestBody: CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, "link_id">> = {
          parentId: linkData.offering_id,
          data: linkData,
        };
        const responseData = await client.apiFetch<{
          link: WholesalerOfferingLink;
        }>("/api/offering-links", { method: "POST", body: createPostBody(requestBody) }, { context: operationId });
        return responseData.link;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          linkData,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing offering link.
     */
    async updateOfferingLink(linkId: number, updates: Partial<Omit<WholesalerOfferingLink, "link_id">>): Promise<WholesalerOfferingLink> {
      const operationId = `updateOfferingLink-${linkId}`;
      offeringLoadingManager.start(operationId);
      try {
        const rb = { link_id: linkId, ...updates };
        const responseData = await client.apiFetch<{
          link: WholesalerOfferingLink;
        }>(`/api/offering-links`, { method: "PUT", body: createPostBody(rb) }, { context: operationId });
        return responseData.link;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          linkId,
          updates,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Deletes an offering link.
     */
    async deleteOfferingLink(linkId: number, cascade = false): Promise<DeleteApiResponse<{ link_id: number; url: string }, string[]>> {
      const operationId = `deleteOfferingLink-${linkId}`;
      offeringLoadingManager.start(operationId);
      try {
        const requestBody: DeleteRequest<WholesalerOfferingLink> = {
          id: linkId,
          cascade,
        };
        return await client.apiFetchUnion<DeleteApiResponse<{ link_id: number; url: string }, string[]>>(
          "/api/offering-links",
          { method: "DELETE", body: createPostBody(requestBody) },
          { context: operationId },
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          linkId,
          cascade,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads product definitions for a specific category that a given supplier has NOT yet created an offering for.
     * This is achieved via a client-constructed anti-join query sent to the generic /api/query endpoint.
     *
     * @param categoryId The ID of the category to check within.
     * @param supplierId The ID of the supplier for whom to check for existing offerings.
     * @returns A promise that resolves to an array of available ProductDefinition objects.
     */
    async getAvailableProductDefsForOffering(categoryId: number, supplierId: number): Promise<ProductDefinition[]> {
      const operationId = `getAvailableProductDefsForOffering-${categoryId}-${supplierId}`;
      offeringLoadingManager.start(operationId);

      try {
        // prettier-ignore
        const payload = Query.for<ProductDefinition>()
          .from('dbo.product_definitions', 'pd')
          .select(['pd.product_def_id', 'pd.title', 'pd.description', 'pd.category_id'])
          .leftJoin('dbo.wholesaler_item_offerings', 'wio')
            .onColumnCondition('pd.product_def_id', '=', 'wio.product_def_id')
            .onValueCondition('wio.wholesaler_id', '=', supplierId)
          .where()
            .and('wio.offering_id', 'IS NULL')
            .and('pd.category_id', '=', categoryId)
          .orderBy('pd.title', 'asc')
          .build()

        const antiJoinQuery = payload;
        void JoinType;

        // This complex query is sent to the generic /api/query endpoint
        const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
          "/api/query",
          { method: "POST", body: createQueryBody(antiJoinQuery) },
          { context: operationId },
        );

        return responseData.results as ProductDefinition[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          categoryId,
          supplierId,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    // ===== UTILITY FUNCTIONS =====

    /**
     * Creates a composite ID for attribute grid operations.
     * This is used by the DataGrid component for row identification.
     */
    createAttributeCompositeId: (offeringId: number, attributeId: number): string => {
      return `${offeringId}-${attributeId}`;
    },

    /**
     * Parses a composite ID back to offering and attribute IDs.
     * This is used when processing grid selection events.
     */
    parseAttributeCompositeId: (compositeId: string): { offeringId: number; attributeId: number } | null => {
      try {
        const [offeringIdStr, attributeIdStr] = compositeId.split("-");
        const offeringId = Number(offeringIdStr);
        const attributeId = Number(attributeIdStr);

        if (isNaN(offeringId) || isNaN(attributeId)) {
          log.warn("Failed to parse attribute composite ID: invalid numbers", {
            compositeId,
          });
          return null;
        }

        return { offeringId, attributeId };
      } catch (error) {
        log.error("Failed to parse attribute composite ID", {
          compositeId,
          error: getErrorMessage(error),
        });
        return null;
      }
    },
  };
  return api;
}

