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
  WholesalerItemOffering_ProductDef_Category,
  WholesalerOfferingAttribute,
  WholesalerOfferingAttribute_Attribute,
  WholesalerOfferingLink,
  Attribute,
  ProductDefinition,
  ProductCategory,
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
import { productDefinitionLoadingOperations } from "./productDefinition";
import { Query } from "$lib/backendQueries/fluentQueryBuilder";
import { assertDefined } from "$lib/utils/validation/assertions";
import type { DeleteCategoryApiResponse, DeleteOfferingApiResponse } from "../app/appSpecificTypes";
import { categoryLoadingOperations, type OfferingWithDetails } from "./category";

const offeringLoadingManager = new LoadingState();
export const offeringLoadingState = offeringLoadingManager.isLoadingStore;
export const offeringLoadingOperations = offeringLoadingManager;

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
    async loadOffering(offeringId: number): Promise<WholesalerItemOffering_ProductDef_Category> {
      log.info(`API, Loading offering: ${offeringId}`);
      const operationId = `loadOffering-${offeringId}`;
      offeringLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{
          offering: WholesalerItemOffering_ProductDef_Category;
        }>(`/api/offerings/${offeringId}`, { method: "GET" }, { context: operationId });
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

       /**
     * Creates a new offering for a category.
     */
    async createOffering(offeringData: Omit<WholesalerItemOffering, "offering_id">): Promise<WholesalerItemOffering_ProductDef> {
      assertDefined(
        offeringData,
        "offeringData.supplierId and offeringData.categoryId must be defined",
        ["wholesaler_id"],
        ["category_id"],
      );
      const operationId = "createOfferingForCategory";
      categoryLoadingOperations.start(operationId);
      try {
        const body = createPostBody(offeringData);
        const responseData = await client.apiFetch<{ offering: WholesalerItemOffering_ProductDef }>(
          "/api/category-offerings",
          { method: "POST", body },
          { context: operationId },
        );
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringData, error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing offering.
     */
    async updateOffering(offeringId: number, updates: Partial<WholesalerItemOffering>): Promise<WholesalerItemOffering> {
      const operationId = `updateOffering-${offeringId}`;
      categoryLoadingOperations.start(operationId);
      try {
        const body = createPostBody({ offering_id: offeringId, ...updates });
        const responseData = await client.apiFetch<{ offering: WholesalerItemOffering }>(
          `/api/category-offerings`,
          { method: "PUT", body },
          { context: operationId },
        );
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        categoryLoadingOperations.finish(operationId);
      }
    },

    /**
     * Deletes an offering.
     */
    async deleteOffering(offeringId: number, cascade = false): Promise<DeleteOfferingApiResponse> {
      const operationId = `deleteOffering-${offeringId}`;
      categoryLoadingOperations.start(operationId);
      try {
        const url = `/api/category-offerings`;

        const removeRequest: DeleteRequest<WholesalerItemOffering> = {
          id: offeringId,
          cascade,
        };
        const body = createPostBody(removeRequest);
        return await client.apiFetchUnion<DeleteOfferingApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        categoryLoadingOperations.finish(operationId);
      }
    },

    // ===== ATTRIBUTE MANAGEMENT =====

    /**
     * Loads all attributes assigned to a specific offering.
     */
    async loadOfferingAttributes(offeringId: number): Promise<WholesalerOfferingAttribute_Attribute[]> {
      const operationId = `loadOfferingAttributes-${offeringId}`;
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads all available attributes from master table for assignment purposes.
     * Note: This method queries the ATTRIBUTES master data.
     */
    async loadAvailableAttributes(): Promise<Attribute[]> {
      const operationId = "loadAvailableAttributes";
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Gets available attributes that are not yet assigned to a specific offering.
     */
    async getAvailableAttributesForOffering(offeringId: number): Promise<Attribute[]> {
      const operationId = `getAvailableAttributesForOffering-${offeringId}`;
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new offering-attribute assignment.
     */
    async createOfferingAttribute(assignmentData: Omit<WholesalerOfferingAttribute, "id">): Promise<WholesalerOfferingAttribute> {
      const operationId = "createOfferingAttribute";
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing offering-attribute assignment.
     */
    async updateOfferingAttribute(offeringAttribute: WholesalerOfferingAttribute): Promise<WholesalerOfferingAttribute> {
      const operationId = `updateOfferingAttribute-${offeringAttribute.offering_id}-${offeringAttribute.attribute_id}`;
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
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
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    // ===== LINK MANAGEMENT =====

    /**
     * Loads all links for a specific offering.
     */
    async loadOfferingLinks(offeringId: number): Promise<WholesalerOfferingLink[]> {
      const operationId = `loadOfferingLinks-${offeringId}`;
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new offering link.
     */
    async createOfferingLink(linkData: Omit<WholesalerOfferingLink, "link_id">): Promise<WholesalerOfferingLink> {
      const operationId = "createOfferingLink";
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing offering link.
     */
    async updateOfferingLink(linkId: number, updates: Partial<Omit<WholesalerOfferingLink, "link_id">>): Promise<WholesalerOfferingLink> {
      const operationId = `updateOfferingLink-${linkId}`;
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Deletes an offering link.
     */
    async deleteOfferingLink(linkId: number, cascade = false): Promise<DeleteApiResponse<{ link_id: number; url: string }, string[]>> {
      const operationId = `deleteOfferingLink-${linkId}`;
      offeringLoadingOperations.start(operationId);
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
        offeringLoadingOperations.finish(operationId);
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
      productDefinitionLoadingOperations.start(operationId);

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

        // const antiJoinQuery: QueryPayload<ProductDefinition> = {
        //   from: { table: 'dbo.product_definitions', alias: 'pd' },
        //   select: ['pd.product_def_id', 'pd.title', 'pd.description', 'pd.category_id'],
        //   joins: [
        //     {
        //       type: JoinType.LEFT,
        //       table: 'dbo.wholesaler_item_offerings',
        //       alias: 'wio',
        //       on: {
        //         joinCondOp: "AND",
        //         conditions: [
        //           // Standard JOIN condition
        //           {
        //             columnA: 'pd.product_def_id',
        //             op: "=",
        //             columnB: 'wio.product_def_id'
        //           },
        //           // Dynamic parameter injected into the ON clause
        //           {
        //             key: 'wio.wholesaler_id',
        //             whereCondOp: ComparisonOperator.EQUALS,
        //             val: supplierId
        //           }
        //         ]
        //       }
        //     }
        //   ],
        //   where: {
        //     whereCondOp: LogicalOperator.AND,
        //     conditions: [
        //       // The core of the anti-join: only return rows where the JOIN found no match
        //       {
        //         key: 'wio.offering_id',
        //         whereCondOp: ComparisonOperator.IS_NULL
        //       },
        //       {
        //         key: 'pd.category_id', // `pd` ist der Alias für `dbo.product_definitions`
        //         whereCondOp: ComparisonOperator.EQUALS,
        //         val: categoryId // Die ID der aktuellen Kategorie aus den Funktionsargumenten
        //       }
        //     ]
        //   },
        //   orderBy: [{ key: 'pd.title', direction: 'asc' }]
        // };

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
        productDefinitionLoadingOperations.finish(operationId);
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
/**
 * Factory function to create a category-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all category and category-composition API methods.
 */

export function getCategoryApi(client: ApiClient) {
    return {
        // ===== CATEGORY MASTER-DATA CRUD =====
        /**
         * Loads a list of categories.
         */
        async loadCategories(query: Partial<QueryPayload<ProductCategory>> = {}): Promise<ProductCategory[]> {
            const operationId = 'loadCategories';
            categoryLoadingOperations.start(operationId);
            try {
                const fullQuery: QueryPayload<ProductCategory> = {
                    select: ['category_id', 'name', 'description'],
                    orderBy: [{ key: 'name', direction: 'asc' }],
                    limit: 100,
                    ...query
                };
                const responseData = await client.apiFetch<QueryResponseData<ProductCategory>>(
                    '/api/categories',
                    { method: 'POST', body: createQueryBody(fullQuery) },
                    { context: operationId }
                );
                return responseData.results as ProductCategory[];
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Loads a single category by its ID.
         */
        async loadCategory(categoryId: number): Promise<ProductCategory> {
            const operationId = `loadCategory-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ category: ProductCategory; }>(
                    `/api/categories/${categoryId}`,
                    { method: 'GET' },
                    { context: operationId }
                );
                return responseData.category;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Creates a new category.
         */
        async createCategory(categoryData: Omit<ProductCategory, 'category_id'>): Promise<ProductCategory> {
            const operationId = 'createCategory';
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ category: ProductCategory; }>(
                    '/api/categories/new',
                    { method: 'POST', body: createPostBody(categoryData) },
                    { context: operationId }
                );
                return responseData.category;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { categoryData, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Updates an existing category.
         */
        async updateCategory(categoryId: number, updates: Partial<ProductCategory>): Promise<ProductCategory> {
            const operationId = `updateCategory-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const responseData = await client.apiFetch<{ category: ProductCategory; }>(
                    `/api/categories/${categoryId}`,
                    { method: 'PUT', body: createPostBody(updates) },
                    { context: operationId }
                );
                return responseData.category;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Deletes a category with dependency checking.
         */
        async deleteCategory(categoryId: number, cascade = false): Promise<DeleteCategoryApiResponse> {
            const operationId = `deleteCategory-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const url = `/api/categories/${categoryId}${cascade ? '?cascade=true' : ''}`;
                return await client.apiFetchUnion<DeleteCategoryApiResponse>(
                    url,
                    { method: 'DELETE' },
                    { context: operationId }
                );
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        // ===== PRODUCT DEFINTIONS for category =====
        async loadProductDefsForCategory(
            categoryId: number
        ): Promise<ProductDefinition[]> {
            const operationId = `loadProductDefsForCategory-${categoryId}`;
            productDefinitionLoadingOperations.start(operationId);
            try {
                const query: QueryPayload<ProductDefinition> = {
                    from: { table: 'dbo.product_definitions', alias: 'pd' },
                    select: ['pd.product_def_id', 'pd.title', 'pd.category_id'],
                    where: {
                        key: 'pd.category_id',
                        whereCondOp: ComparisonOperator.EQUALS,
                        val: categoryId
                    },
                    orderBy: [{ key: 'pd.title', direction: 'asc' }]
                };

                const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
                    '/api/product-definitions', // Nutzt den Standard-Endpunkt
                    { method: 'POST', body: createQueryBody(query) },
                    { context: operationId }
                );
                return responseData.results as ProductDefinition[];
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { categoryId, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },


        // ===== OFFERING (Category Compositions) =====
        /**
         * Loads all offerings for a specific supplier and category.
         */
        async loadOfferingsForSupplierCategory(supplierId: number, categoryId: number): Promise<OfferingWithDetails[]> {
            const operationId = `loadOfferingsForSupplierCategory-${supplierId}-${categoryId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const request: PredefinedQueryRequest = {
                    namedQuery: 'category_offerings',
                    payload: {
                        select: [
                            'wio.offering_id', 'wio.wholesaler_id', 'wio.category_id', 'wio.product_def_id',
                            'wio.price', 'wio.currency', 'wio.size', 'wio.dimensions', 'wio.comment', 'wio.created_at',
                            'pd.title AS product_def_title', 'pd.description AS product_def_description',
                            'pc.name AS category_name'
                        ],
                        where: {
                            whereCondOp: "AND",
                            conditions: [
                                { key: 'wio.wholesaler_id', whereCondOp: "=", val: supplierId },
                                { key: 'wio.category_id', whereCondOp: "=", val: categoryId }
                            ]
                        },
                        orderBy: [{ key: 'wio.created_at', direction: 'desc' }]
                    }
                };
                const responseData = await client.apiFetch<QueryResponseData<OfferingWithDetails>>(
                    '/api/query',
                    { method: 'POST', body: createPostBody(request) },
                    { context: operationId }
                );
                return responseData.results as OfferingWithDetails[];
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Creates a new offering for a category.
         */
        async createOffering(offeringData: Omit<WholesalerItemOffering, 'offering_id'>): Promise<WholesalerItemOffering_ProductDef> {
            assertDefined(offeringData, "offeringData.supplierId and offeringData.categoryId must be defined", ["wholesaler_id"], ["category_id"]);
            const operationId = 'createOfferingForCategory';
            categoryLoadingOperations.start(operationId);
            try {
                const body = createPostBody(offeringData);
                const responseData = await client.apiFetch<{ offering: WholesalerItemOffering_ProductDef; }>(
                    '/api/category-offerings',
                    { method: 'POST', body },
                    { context: operationId }
                );
                return responseData.offering;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { offeringData, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Updates an existing offering.
         */
        async updateOffering(offeringId: number, updates: Partial<WholesalerItemOffering>): Promise<WholesalerItemOffering> {
            const operationId = `updateOffering-${offeringId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const body = createPostBody({ offering_id: offeringId, ...updates });
                const responseData = await client.apiFetch<{ offering: WholesalerItemOffering; }>(
                    `/api/category-offerings`,
                    { method: 'PUT', body },
                    { context: operationId }
                );
                return responseData.offering;
            } catch (err) {
                log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
                throw err;
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        },

        /**
         * Deletes an offering.
         */
        async deleteOffering(offeringId: number, cascade = false): Promise<DeleteOfferingApiResponse> {
            const operationId = `deleteOffering-${offeringId}`;
            categoryLoadingOperations.start(operationId);
            try {
                const url = `/api/category-offerings`;

                const removeRequest: DeleteRequest<WholesalerItemOffering> = {
                    id: offeringId,
                    cascade
                };
                const body = createPostBody(removeRequest);
                return await client.apiFetchUnion<DeleteOfferingApiResponse>(
                    url,
                    { method: 'DELETE', body },
                    { context: operationId }
                );
            } finally {
                categoryLoadingOperations.finish(operationId);
            }
        }
    };
}
