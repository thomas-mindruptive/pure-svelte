// src/lib/api/client/offering.ts

/**
 * @file Offering API Client - TYPE-SAFE COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for offering-related operations.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from '$lib/utils/logger';
import { ComparisonOperator, JoinType, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type {
  WholesalerItemOffering,
  WholesalerItemOffering_ProductDef_Category,
  WholesalerOfferingAttribute,
  WholesalerOfferingAttribute_Attribute,
  WholesalerOfferingLink,
  Attribute,
  ProductDefinition
} from '$lib/domain/domainTypes';

import type { ApiClient } from './ApiClient';
import { createPostBody, createQueryBody, getErrorMessage } from './common';
import type {
  DeleteApiResponse,
  PredefinedQueryRequest,
  QueryResponseData,
  AssignmentSuccessData,
  AssignmentRequest,
  AssignmentUpdateRequest,
  RemoveAssignmentRequest,
  CreateChildRequest,
  DeleteRequest
} from '$lib/api/api.types';
import { LoadingState } from './loadingState';
import { productDefinitionLoadingOperations } from './productDefinition';


const offeringLoadingManager = new LoadingState();
export const offeringLoadingState = offeringLoadingManager.isLoadingStore;
export const offeringLoadingOperations = offeringLoadingManager;

export type OfferingWithDetails = WholesalerItemOffering_ProductDef_Category;
export type AttributeWithDetails = WholesalerOfferingAttribute_Attribute;

/**
 * Factory function to create an offering-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all offering and offering-composition API methods.
 */
export function getOfferingApi(client: ApiClient) {
  const api = {

    // ===== OFFERING ENTITY LOAD =====

    /**
     * Loads a single offering with all its details by ID.
     */
    async loadOffering(offeringId: number): Promise<OfferingWithDetails> {
      const operationId = `loadOffering-${offeringId}`;
      offeringLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ offering: OfferingWithDetails }>(
          `/api/offerings/${offeringId}`,
          { method: 'GET' },
          { context: operationId }
        );
        return responseData.offering;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

    // ===== LEVEL 4: ATTRIBUTE MANAGEMENT =====

    /**
     * Loads all attributes assigned to a specific offering.
     */
    async loadOfferingAttributes(offeringId: number): Promise<AttributeWithDetails[]> {
      const operationId = `loadOfferingAttributes-${offeringId}`;
      offeringLoadingOperations.start(operationId);
      try {
        const request: PredefinedQueryRequest = {
          namedQuery: 'offering_attributes',
          payload: {
            select: [
              'woa.offering_id', 'woa.attribute_id', 'woa.value',
              'a.name AS attribute_name', 'a.description AS attribute_description'
            ],
            where: { whereCondOp: LogicalOperator.AND, conditions: [{ key: 'wio.offering_id', whereCondOp: ComparisonOperator.EQUALS, val: offeringId }] },
            orderBy: [{ key: 'a.name', direction: 'asc' }]
          }
        };
        const responseData = await client.apiFetch<QueryResponseData<AttributeWithDetails>>(
          '/api/query',
          { method: 'POST', body: createPostBody(request) },
          { context: operationId }
        );
        return responseData.results as AttributeWithDetails[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringId, error: getErrorMessage(err) });
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
      const operationId = 'loadAvailableAttributes';
      offeringLoadingOperations.start(operationId);
      try {
        const query: QueryPayload<Attribute> = {
          select: ['attribute_id', 'name', 'description'],
          orderBy: [{ key: 'name', direction: 'asc' }]
        };
        const responseData = await client.apiFetch<QueryResponseData<Attribute>>(
          '/api/attributes',
          { method: 'POST', body: createQueryBody(query) },
          { context: operationId }
        );
        return responseData.results as Attribute[];
      } catch (err) {
        log.error(`[${operationId}] Failed to load available attributes.`, { error: getErrorMessage(err) });
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
          api.loadOfferingAttributes(offeringId)
        ]);

        const assignedIds = new Set(assignedAttributes.map(a => a.attribute_id));
        const availableAttributes = allAttributes.filter(attr => !assignedIds.has(attr.attribute_id));
        return availableAttributes;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringId, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new offering-attribute assignment.
     */
    async createOfferingAttribute(assignmentData: Omit<WholesalerOfferingAttribute, 'id'>): Promise<WholesalerOfferingAttribute> {
      const operationId = 'createOfferingAttribute';
      offeringLoadingOperations.start(operationId);
      try {
        const requestBody: AssignmentRequest<WholesalerItemOffering, Omit<WholesalerOfferingAttribute, 'id'>> = {
          parentId: assignmentData.offering_id,
          childId: assignmentData.attribute_id,
          data: assignmentData
        };
        const responseData = await client.apiFetch<AssignmentSuccessData<WholesalerOfferingAttribute>>(
          '/api/offering-attributes',
          { method: 'POST', body: createPostBody(requestBody) },
          { context: operationId }
        );
        return responseData.assignment;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { assignmentData, error: getErrorMessage(err) });
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
        const requestBody: AssignmentUpdateRequest<WholesalerItemOffering, WholesalerOfferingAttribute> = {
          parentId: offeringAttribute.offering_id,
          childId: offeringAttribute.attribute_id,
          data: offeringAttribute
        };
        const responseData = await client.apiFetch<AssignmentSuccessData<WholesalerOfferingAttribute>>(
          `/api/offering-attributes`,
          { method: 'PUT', body: createPostBody(requestBody) },
          { context: operationId }
        );
        return responseData.assignment;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringAttribute, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Deletes an offering-attribute assignment.
     */
    async deleteOfferingAttribute(offeringId: number, attributeId: number, cascade = false): Promise<DeleteApiResponse<{ offering_id: number; attribute_id: number; attribute_name: string }, string[]>> {
      const operationId = `deleteOfferingAttribute-${offeringId}-${attributeId}`;
      offeringLoadingOperations.start(operationId);
      try {
        const requestBody: RemoveAssignmentRequest<WholesalerItemOffering, Attribute> = {
          parentId: offeringId,
          childId: attributeId,
          cascade
        };
        return await client.apiFetchUnion<DeleteApiResponse<{ offering_id: number; attribute_id: number; attribute_name: string }, string[]>>(
          '/api/offering-attributes',
          { method: 'DELETE', body: createPostBody(requestBody) },
          { context: operationId }
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringId, attributeId, cascade, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

    // ===== LEVEL 5: LINK MANAGEMENT =====

    /**
     * Loads all links for a specific offering.
     */
    async loadOfferingLinks(offeringId: number): Promise<WholesalerOfferingLink[]> {
      const operationId = `loadOfferingLinks-${offeringId}`;
      offeringLoadingOperations.start(operationId);
      try {
        const request: PredefinedQueryRequest = {
          namedQuery: 'offering_links',
          payload: {
            select: ['wol.link_id', 'wol.offering_id', 'wol.url', 'wol.notes', 'wol.created_at'],
            where: { whereCondOp: LogicalOperator.AND, conditions: [{ key: 'wio.offering_id', whereCondOp: ComparisonOperator.EQUALS, val: offeringId }] },
            orderBy: [{ key: 'wol.created_at', direction: 'desc' }]
          }
        };
        const responseData = await client.apiFetch<QueryResponseData<WholesalerOfferingLink>>(
          '/api/query',
          { method: 'POST', body: createPostBody(request) },
          { context: operationId }
        );
        log.info(`[${operationId}] Loaded ${responseData.results.length} links for offering ${offeringId}.`, responseData.results);
        return responseData.results as WholesalerOfferingLink[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringId, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new offering link.
     */
    async createOfferingLink(linkData: Omit<WholesalerOfferingLink, 'link_id'>): Promise<WholesalerOfferingLink> {
      const operationId = 'createOfferingLink';
      offeringLoadingOperations.start(operationId);
      try {
        const requestBody: CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, 'link_id'>> = {
          parentId: linkData.offering_id,
          data: linkData
        };
        const responseData = await client.apiFetch<{ link: WholesalerOfferingLink }>(
          '/api/offering-links',
          { method: 'POST', body: createPostBody(requestBody) },
          { context: operationId }
        );
        return responseData.link;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { linkData, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing offering link.
     */
    async updateOfferingLink(linkId: number, updates: Partial<Omit<WholesalerOfferingLink, 'link_id'>>): Promise<WholesalerOfferingLink> {
      const operationId = `updateOfferingLink-${linkId}`;
      offeringLoadingOperations.start(operationId);
      try {
        const rb = { link_id: linkId, ...updates };
        const responseData = await client.apiFetch<{ link: WholesalerOfferingLink }>(
          `/api/offering-links`,
          { method: 'PUT', body: createPostBody(rb) },
          { context: operationId }
        );
        return responseData.link;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { linkId, updates, error: getErrorMessage(err) });
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
          cascade
        };
        return await client.apiFetchUnion<DeleteApiResponse<{ link_id: number; url: string }, string[]>>(
          '/api/offering-links',
          { method: 'DELETE', body: createPostBody(requestBody) },
          { context: operationId }
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { linkId, cascade, error: getErrorMessage(err) });
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
		async getAvailableProductDefsForOffering(
			categoryId: number,
			supplierId: number
		): Promise<ProductDefinition[]> {
			const operationId = `getAvailableProductDefsForOffering-${categoryId}-${supplierId}`;
			productDefinitionLoadingOperations.start(operationId);
			try {
				const antiJoinQuery: QueryPayload<ProductDefinition> = {
					from: {table: 'dbo.product_definitions', alias: 'pd'},
					select: ['pd.product_def_id', 'pd.title', 'pd.description', 'pd.category_id'],
					joins: [
						{
							type: JoinType.LEFT,
							table: 'dbo.wholesaler_item_offerings',
							alias: 'wio',
							on: {
								joinCondOp: LogicalOperator.AND,
								conditions: [
									// Standard JOIN condition
									{
										columnA: 'pd.product_def_id',
										op: ComparisonOperator.EQUALS,
										columnB: 'wio.product_def_id'
									},
									// Dynamic parameter injected into the ON clause
									{
										key: 'wio.wholesaler_id',
										whereCondOp: ComparisonOperator.EQUALS,
										val: supplierId
									}
								]
							}
						}
					],
					where: {
						whereCondOp: LogicalOperator.AND,
						conditions: [
							// The core of the anti-join: only return rows where the JOIN found no match
							{
								key: 'wio.offering_id',
								whereCondOp: ComparisonOperator.IS_NULL
							}
						]
					},
					orderBy: [{ key: 'pd.title', direction: 'asc' }]
				};

				// This complex query is sent to the generic /api/query endpoint
				const responseData = await client.apiFetch<QueryResponseData<ProductDefinition>>(
					'/api/query',
					{ method: 'POST', body: createQueryBody(antiJoinQuery) },
					{ context: operationId }
				);

				return responseData.results as ProductDefinition[];
			} catch (err) {
				log.error(`[${operationId}] Failed.`, { categoryId, supplierId, error: getErrorMessage(err) });
				throw err;
			} finally {
				offeringLoadingOperations.finish(operationId);
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
        const [offeringIdStr, attributeIdStr] = compositeId.split('-');
        const offeringId = Number(offeringIdStr);
        const attributeId = Number(attributeIdStr);

        if (isNaN(offeringId) || isNaN(attributeId)) {
          log.warn('Failed to parse attribute composite ID: invalid numbers', { compositeId });
          return null;
        }

        return { offeringId, attributeId };
      } catch (error) {
        log.error('Failed to parse attribute composite ID', { compositeId, error: getErrorMessage(error) });
        return null;
      }
    }
  }
  return api;
}