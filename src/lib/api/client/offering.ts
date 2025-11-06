// src/lib/api/client/offering.ts

/**
 * @file Offering API Client - TYPE-SAFE COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for offering-related operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { ComparisonOperator, JoinType, LogicalOperator, type QueryPayload, type SortDescriptor, type WhereCondition, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
import type {
  Attribute,
  ProductDefinition,
  WholesalerItemOffering,
  WholesalerOfferingAttribute,
  WholesalerOfferingAttribute_Attribute,
  WholesalerOfferingLink,
  Wio_PDef_Cat_Supp_Nested_WithLinks,
} from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";

import type {
  ApiResponse,
  AssignmentRequest,
  AssignmentSuccessData,
  AssignmentUpdateRequest,
  CreateChildRequest,
  DeleteApiResponse,
  DeleteRequest,
  PredefinedQueryRequest,
  QueryResponseData,
  RemoveAssignmentRequest,
} from "$lib/api/api.types";
import { assertDefined } from "$lib/utils/assertions";
import type { DeleteOfferingApiResponse } from "../app/appSpecificTypes";
import type { ApiClient } from "./apiClient";
import { createJsonAndWrapInPayload, createJsonBody, getErrorMessage } from "./common";
import { LoadingState } from "./loadingState";
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
     * Now returns NESTED structure with product_def, category, wholesaler, links, and shop_offering.
     */
    async loadOffering(offeringId: number): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks> {
      log.info(`API, Loading offering: ${offeringId}`);
      const operationId = `loadOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{
          offering: Wio_PDef_Cat_Supp_Nested_WithLinks;
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
     * Loads all offerings with links.
     * Uses the nested offerings endpoint with full JSON structure including links.
     * @param aWhere Optional additional WHERE conditions.
     * @param aOrderBy Optional sort descriptors.
     * @param aLimit Optional limit for pagination.
     * @param aOffset Optional offset for pagination.
     * @returns A promise that resolves to an array of nested offerings with links.
     */
    async loadNestedOfferingsWithLinks(
      aWhere?: WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering> | null,
      aOrderBy?: SortDescriptor<WholesalerItemOffering>[] | null,
      aLimit?: number | null,
      aOffset?: number | null,
    ): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> {
      const operationId = `loadNestedOfferingsWithLinks`;
      offeringLoadingManager.start(operationId);
      try {
          const payload: QueryPayload<WholesalerItemOffering> = {
          // ⚠️ "select" not used by nested endpoint - uses wio.* in SQL
          select: [],
          ...(aWhere && {where: aWhere}),
          ...(aOrderBy && { orderBy: aOrderBy }),
          ...(aLimit && { limit: aLimit }),
          ...(aOffset && { offset: aOffset }),
        };

        const responseData = await client.apiFetch<QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks>>(
          "/api/offerings/nested",
          { method: "POST", body: createJsonBody(payload) },
          { context: operationId },
        );
        return responseData.results as Wio_PDef_Cat_Supp_Nested_WithLinks[];
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
    async createOffering(offeringData: Omit<WholesalerItemOffering, "offering_id">): Promise<WholesalerItemOffering> {
      assertDefined(
        offeringData,
        "offeringData.supplierId and offeringData.categoryId must be defined",
        ["wholesaler_id"],
        ["category_id"],
      );
      const operationId = "createOfferingForCategory";
      offeringLoadingManager.start(operationId);
      try {
        const body = createJsonBody(offeringData);
        const responseData = await client.apiFetch<{ offering: WholesalerItemOffering }>(
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
        const body = createJsonBody({ offering_id: offeringId, ...updates });
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
    async deleteOffering(offeringId: number, cascade = false, forceCascade = false): Promise<DeleteOfferingApiResponse> {
      assertDefined(offeringId, "offeringId");
      const operationId = `deleteOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const url = `/api/offerings/${offeringId}`;

        const removeRequest: DeleteRequest<WholesalerItemOffering> = {
          id: offeringId,
          cascade,
          forceCascade,
        };
        const body = createJsonBody(removeRequest);
        return await client.apiFetchUnion<DeleteOfferingApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Copies an offering and returns the new offering ID.
     */
    async copyOffering(offeringId: number): Promise<number> {
      assertDefined(offeringId, "offeringId");
      const operationId = `copyOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        log.info(`[${operationId}] Copying offering ${offeringId}`);
        const url = `/api/offerings/${offeringId}/copy`;

        const responseData = await client.apiFetch<{ new_offering_id: number }>(
          url,
          { method: "POST" },
          { context: operationId }
        );

        log.info(`[${operationId}] Offering copied successfully`, {
          sourceId: offeringId,
          newId: responseData.new_offering_id,
        });

        return responseData.new_offering_id;
      } catch (err) {
        log.error(`[${operationId}] Failed to copy offering`, { error: getErrorMessage(err) });
        throw err;
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
        const request: PredefinedQueryRequest<WholesalerOfferingAttribute_Attribute> = {
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
          { method: "POST", body: createJsonBody(request) },
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
          { method: "POST", body: createJsonAndWrapInPayload(query) },
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
     * This has been refactored to use a single, efficient anti-join query
     * executed on the database, replacing the previous client-side filtering logic.
     * @param offeringId The ID of the offering to check against.
     * @returns A promise that resolves to an array of available Attribute objects.
     */
    async getAvailableAttributesForOffering(offeringId: number): Promise<Attribute[]> {
      const operationId = `getAvailableAttributesForOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      log.debug(`(offeringApi) Getting available attributes for offering via anti-join.`, { offeringId });

      try {
        // This payload describes an SQL anti-join.
        const payload: QueryPayload<Attribute> = {
          // 1. We want to select columns that form a complete Attribute object.
          select: ["a.attribute_id", "a.name", "a.description"],
          from: { table: "dbo.attributes", alias: "a" },

          // 2. We LEFT JOIN from the master attributes table to the assignments table.
          //    This will give us all attributes, and for those that are assigned
          //    to our specific offering, the `woa` columns will have values.
          //    For unassigned attributes, `woa` columns will be NULL.
          joins: [
            {
              type: JoinType.LEFT,
              table: "dbo.wholesaler_offering_attributes",
              alias: "woa",
              on: {
                joinCondOp: LogicalOperator.AND,
                conditions: [
                  // Standard join condition on the foreign key.
                  { columnA: "a.attribute_id", op: "=", columnB: "woa.attribute_id" },
                  // We crucially filter the JOIN to only consider assignments for the CURRENT offering.
                  { key: "woa.offering_id", whereCondOp: "=", val: offeringId },
                ],
              },
            },
          ],

          // 3. The "anti-join" condition: We only want rows where the LEFT JOIN
          //    found NO match, meaning the attribute is not assigned to this offering.
          //    Any column from the `woa` table will be NULL in this case.
          where: {
            key: "woa.offering_id",
            whereCondOp: ComparisonOperator.IS_NULL,
          },

          // 4. Order the results for a consistent UI.
          orderBy: [{ key: "a.name", direction: "asc" }],
        };

        // This single, efficient query is sent to the generic query endpoint.
        const responseData = await client.apiFetch<QueryResponseData<Attribute>>(
          "/api/query",
          { method: "POST", body: createJsonAndWrapInPayload(payload) },
          { context: operationId },
        );

        log.info(
          `(offeringApi) Found ${responseData.results.length} available attributes for offering ${offeringId}.`,
          responseData.results,
        );
        return responseData.results as Attribute[];
      } catch (err) {
        log.error(`[${operationId}] Failed to get available attributes.`, {
          offeringId,
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
    async getAvailableAttributesForOffering_old(offeringId: number): Promise<Attribute[]> {
      const operationId = `getAvailableAttributesForOffering-${offeringId}`;
      offeringLoadingManager.start(operationId);
      try {
        const [allAttributes, assignedAttributes] = await Promise.all([
          api.loadAvailableAttributes(),
          api.loadOfferingAttributes(offeringId),
        ]);

        log.debug(`Loaded attributes for offering`, { offeringId, allAttributes, assignedAttributes });

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
          { method: "POST", body: createJsonBody(requestBody) },
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
          { method: "PUT", body: createJsonBody(requestBody) },
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
      forceCascade = false,
    ): Promise<DeleteApiResponse<{ offering_id: number; attribute_id: number; attribute_name: string }, string[]>> {
      const operationId = `deleteOfferingAttribute-${offeringId}-${attributeId}`;
      offeringLoadingManager.start(operationId);
      try {
        const requestBody: RemoveAssignmentRequest<WholesalerItemOffering, Attribute> = {
          parent1Id: offeringId,
          parent2Id: attributeId,
          cascade,
          forceCascade,
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
        >("/api/offering-attributes", { method: "DELETE", body: createJsonBody(requestBody) }, { context: operationId });
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
        const request: PredefinedQueryRequest<WholesalerOfferingLink> = {
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
          { method: "POST", body: createJsonBody(request) },
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
        }>("/api/offering-links", { method: "POST", body: createJsonBody(requestBody) }, { context: operationId });
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
        }>(`/api/offering-links`, { method: "PUT", body: createJsonBody(rb) }, { context: operationId });
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
          { method: "DELETE", body: createJsonBody(requestBody) },
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
     * This is achieved via a client-constructed anti-join (antijoin) query sent to the generic /api/query endpoint.
     * NOT USEd currently, because offerings can flexibly design their own "material" etc. fields.
     *
     * @param categoryId The ID of the category to check within.
     * @param supplierId The ID of the supplier for whom to check for existing offerings.
     * @returns A promise that resolves to an array of available ProductDefinition objects.
     */
    async getNotYetAssignedProductDefsForSupplierAndOffering(categoryId: number, supplierId: number): Promise<ProductDefinition[]> {
      const operationId = `getAvailableProductDefsForOffering-${categoryId}-${supplierId}`;
      offeringLoadingManager.start(operationId);

      try {
        const payload: QueryPayload<ProductDefinition> = {
          select: ["pd.product_def_id", "pd.title", "pd.description", "pd.category_id"],
          from: { table: "dbo.product_definitions", alias: "pd" },
          joins: [
            {
              type: "LEFT JOIN",
              table: "dbo.wholesaler_item_offerings",
              alias: "wio",
              on: {
                joinCondOp: "AND",
                conditions: [
                  { columnA: "pd.product_def_id", op: "=", columnB: "wio.product_def_id" },
                  { key: "wio.wholesaler_id", whereCondOp: "=", val: supplierId },
                ],
              },
            },
          ],
          where: {
            whereCondOp: "AND",
            conditions: [
              { key: "wio.offering_id", whereCondOp: "IS NULL" },
              { key: "pd.category_id", whereCondOp: "=", val: categoryId },
            ],
          },
          orderBy: [{ key: "pd.title", direction: "asc" }],
        };

        // This complex query is sent to the generic /api/query endpoint
        const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
          "/api/query",
          { method: "POST", body: createJsonAndWrapInPayload(payload) },
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

    // ===== SHOP OFFERING FUNCTIONS =====

    /**
     * Loads source offerings for a shop offering (wholesaler_id = 99).
     * Returns offerings linked via shop_offering_sources table, ordered by priority.
     */
    async loadSourceOfferingsForShopOffering(shopOfferingId: number): Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> {
      const operationId = `loadSourceOfferingsForShopOffering-${shopOfferingId}`;
      offeringLoadingManager.start(operationId);

      log.info(`[${operationId}] Starting request`, {
        shopOfferingId,
        url: `/api/offerings/${shopOfferingId}/sources`,
      });

      try {
        const responseData = await client.apiFetch<QueryResponseData<Wio_PDef_Cat_Supp_Nested_WithLinks>>(
          `/api/offerings/${shopOfferingId}/sources`,
          { method: "GET" },
          { context: operationId },
        );

        log.info(`[${operationId}] Successfully loaded source offerings`, {
          shopOfferingId,
          count: responseData.results.length,
        });

        return responseData.results as Wio_PDef_Cat_Supp_Nested_WithLinks[];
      } catch (err) {
        log.error(`[${operationId}] Failed to load source offerings`, {
          shopOfferingId,
          error: err,
          errorMessage: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Copies an offering to create a shop offering (wholesaler_id = 99).
     * Links the new shop offering to the source via shop_offering_sources table.
     *
     * @returns The newly created shop offering ID
     */
    async copyOfferingForShop(sourceOfferingId: number): Promise<number> {
      const operationId = `copyOfferingForShop-${sourceOfferingId}`;
      offeringLoadingManager.start(operationId);
      try {
        const data = await client.apiFetch<{ shop_offering_id: number }>(
          `/api/offerings/${sourceOfferingId}/copy-for-shop`,
          { method: "POST" },
          { context: operationId },
        );

        log.info(`[${operationId}] Created shop offering ${data.shop_offering_id} from source ${sourceOfferingId}.`);
        return data.shop_offering_id;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, {
          sourceOfferingId,
          error: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Links a source offering to a shop offering.
     * Creates an entry in shop_offering_sources table with priority = 0.
     *
     * @param shopOfferingId The shop offering ID (wholesaler_id = 99)
     * @param sourceOfferingId The source offering ID to link
     * @returns ApiResponse (success or error, e.g., 409 if already linked)
     */
    async addSourceOfferingLink(
      shopOfferingId: number,
      sourceOfferingId: number,
    ): Promise<
      ApiResponse<{
        link: {
          shop_offering_id: number;
          source_offering_id: number;
          priority: number;
          created_at: string;
          updated_at: string;
        };
      }>
    > {
      const operationId = `addSourceOfferingLink-${shopOfferingId}-${sourceOfferingId}`;
      offeringLoadingManager.start(operationId);

      log.info(`[${operationId}] Starting link request`, {
        shopOfferingId,
        sourceOfferingId,
        url: `/api/offerings/${shopOfferingId}/sources/${sourceOfferingId}`,
      });

      try {
        return await client.apiFetchUnion<
          ApiResponse<{
            link: {
              shop_offering_id: number;
              source_offering_id: number;
              priority: number;
              created_at: string;
              updated_at: string;
            };
          }>
        >(`/api/offerings/${shopOfferingId}/sources/${sourceOfferingId}`, { method: "POST" }, { context: operationId });
      } catch (err) {
        log.error(`[${operationId}] Failed to link source offering`, {
          shopOfferingId,
          sourceOfferingId,
          error: err,
          errorMessage: getErrorMessage(err),
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    /**
     * Removes the link between a shop offering and a source offering.
     * Only deletes the entry in shop_offering_sources table.
     * The source offering itself remains intact.
     *
     * @param shopOfferingId The shop offering ID (wholesaler_id = 99)
     * @param sourceOfferingId The source offering ID to unlink
     * @returns DeleteApiResponse with success status
     */
    async removeSourceOfferingLink(shopOfferingId: number, sourceOfferingId: number): Promise<DeleteApiResponse<any, any>> {
      const operationId = `removeSourceOfferingLink-${shopOfferingId}-${sourceOfferingId}`;
      offeringLoadingManager.start(operationId);

      log.info(`[${operationId}] Starting unlink request`, {
        shopOfferingId,
        sourceOfferingId,
        url: `/api/offerings/${shopOfferingId}/sources/${sourceOfferingId}`,
      });

      try {
        return await client.apiFetchUnion<DeleteApiResponse<any, any>>(
          `/api/offerings/${shopOfferingId}/sources/${sourceOfferingId}`,
          { method: "DELETE" },
          { context: operationId },
        );
      } catch (err) {
        log.error(`[${operationId}] Failed to remove source offering link`, {
          shopOfferingId,
          sourceOfferingId,
          error: err,
          errorMessage: getErrorMessage(err),
          errorType: err instanceof Error ? err.constructor.name : typeof err,
        });
        throw err;
      } finally {
        offeringLoadingManager.finish(operationId);
      }
    },

    // ===== UTILITY FUNCTIONS =====
  };

  return api;
}
