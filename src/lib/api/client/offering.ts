// src/lib/api/client/offering.ts

/**
 * @file Offering API Client - TYPE-SAFE COMPOSITION ARCHITECTURE
 * @description Provides type-safe client functions for offering-related operations.
 * This handles Level 3 (Offerings) as Kompositions-Manager according to the 
 * Composition-Prinzip, managing all direct offering compositions:
 * - Offering Entity Load (individual offering details)
 * - Attribute Assignments (dbo.wholesaler_offering_attributes) 
 * - Links (dbo.wholesaler_offering_links)
 */

import { apiFetch, apiFetchUnion, createPostBody, createQueryBody, getErrorMessage, LoadingState } from './common';
import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload } from '$lib/clientAndBack/queryGrammar';
import type {
    WholesalerItemOffering,
    WholesalerItemOffering_ProductDef_Category,
    WholesalerOfferingAttribute,
    WholesalerOfferingAttribute_Attribute,
    WholesalerOfferingLink,
    Attribute
} from '$lib/domain/types';

// Import type-safe request types
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
} from '$lib/api/types/common';

// A dedicated loading state manager for all offering-related operations.
export const offeringLoadingState = new LoadingState();

// Type aliases for better readability
export type OfferingWithDetails = WholesalerItemOffering_ProductDef_Category;
export type AttributeWithDetails = WholesalerOfferingAttribute_Attribute;

/**
 * The default query payload used when fetching offerings with details.
 */
export const DEFAULT_OFFERING_QUERY: QueryPayload<WholesalerItemOffering> = {
    select: ['offering_id', 'wholesaler_id', 'category_id', 'product_def_id', 'price', 'currency', 'size', 'dimensions', 'comment', 'created_at'],
    orderBy: [{ key: 'created_at', direction: 'desc' }],
    limit: 100
};

// ===== OFFERING ENTITY LOAD =====

/**
 * Loads a single offering with all its details by ID.
 * This is direct entity access, not a relationship operation.
 *
 * @param offeringId The ID of the offering to fetch.
 * @returns A promise that resolves to a single offering with details.
 * @throws {ApiError} If the offering is not found or the API call fails.
 */
export async function loadOffering(offeringId: number): Promise<OfferingWithDetails> {
    const operationId = `loadOffering-${offeringId}`;
    offeringLoadingState.start(operationId);
    try {
        const responseData = await apiFetch<{ offering: OfferingWithDetails }>(
            `/api/offerings/${offeringId}`,
            { method: 'GET' },
            { context: operationId }
        );
        return responseData.offering;
    } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

// ===== LEVEL 4: ATTRIBUTE MANAGEMENT (Offering Compositions) =====

/**
 * Loads all attributes assigned to a specific offering.
 * This is a composition relationship managed by offering.ts.
 *
 * @param offeringId The ID of the offering.
 * @returns A promise that resolves to an array of offering attributes with details.
 * @throws {ApiError} If the API call fails.
 */
export async function loadOfferingAttributes(offeringId: number): Promise<AttributeWithDetails[]> {
    const operationId = `loadOfferingAttributes-${offeringId}`;
    offeringLoadingState.start(operationId);
    try {
        const request: PredefinedQueryRequest = {
            namedQuery: 'offering_attributes',
            payload: {
                select: [
                    'woa.offering_id',
                    'woa.attribute_id',
                    'woa.value',
                    'a.name AS attribute_name',
                    'a.description AS attribute_description'
                ],
                where: {
                    op: LogicalOperator.AND,
                    conditions: [{ key: 'wio.offering_id', op: ComparisonOperator.EQUALS, val: offeringId }]
                },
                orderBy: [{ key: 'a.name', direction: 'asc' }]
            }
        };

        const responseData = await apiFetch<QueryResponseData<AttributeWithDetails>>(
            '/api/query',
            { method: 'POST', body: createPostBody(request) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully loaded offering attributes.`, {
            offeringId,
            count: responseData.results.length
        });

        return responseData.results as AttributeWithDetails[];
    } catch (err) {
        log.error(`[${operationId}] Failed to load offering attributes.`, {
            offeringId,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Loads all available attributes from master table for assignment purposes.
 * This calls the attribute master data managed by attribute.ts.
 *
 * @returns A promise that resolves to an array of all available attributes.
 * @throws {ApiError} If the API call fails.
 */
export async function loadAvailableAttributes(): Promise<Attribute[]> {
    const operationId = 'loadAvailableAttributes';
    offeringLoadingState.start(operationId);
    try {
        const query: QueryPayload<Attribute> = {
            select: ['attribute_id', 'name', 'description'],
            orderBy: [{ key: 'name', direction: 'asc' }]
        };

        const responseData = await apiFetch<QueryResponseData<Attribute>>(
            '/api/attributes',
            { method: 'POST', body: createQueryBody(query) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully loaded available attributes.`, {
            count: responseData.results.length
        });

        return responseData.results as Attribute[];
    } catch (err) {
        log.error(`[${operationId}] Failed to load available attributes.`, {
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Gets available attributes that are not yet assigned to a specific offering.
 *
 * @param offeringId The ID of the offering to check against.
 * @returns A promise that resolves to available attributes for assignment.
 * @throws {ApiError} If the API call fails.
 */
export async function getAvailableAttributesForOffering(offeringId: number): Promise<Attribute[]> {
    const operationId = `getAvailableAttributesForOffering-${offeringId}`;
    offeringLoadingState.start(operationId);
    try {
        // Get all attributes and assigned attributes in parallel
        const [allAttributes, assignedAttributes] = await Promise.all([
            loadAvailableAttributes(),
            loadOfferingAttributes(offeringId)
        ]);

        const assignedIds = new Set(assignedAttributes.map(a => a.attribute_id));
        const availableAttributes = allAttributes.filter(attr => !assignedIds.has(attr.attribute_id));

        log.info(`[${operationId}] Successfully calculated available attributes.`, {
            offeringId,
            total: allAttributes.length,
            assigned: assignedAttributes.length,
            available: availableAttributes.length
        });

        return availableAttributes;
    } catch (err) {
        log.error(`[${operationId}] Failed to get available attributes for offering.`, {
            offeringId,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Creates a new offering-attribute assignment using type-safe request.
 * This is a composition relationship managed by offering.ts.
 *
 * @param assignmentData The data for the new assignment.
 * @returns A promise that resolves to the newly created assignment.
 * @throws {ApiError} If validation fails or another server error occurs.
 */
export async function createOfferingAttribute(
    assignmentData: {
        offering_id: number;
        attribute_id: number;
        value?: string;
    }
): Promise<WholesalerOfferingAttribute> {
    const operationId = 'createOfferingAttribute';
    offeringLoadingState.start(operationId);
    try {
        // Use type-safe assignment request
        const requestBody: AssignmentRequest<WholesalerItemOffering, Attribute, { value?: string }> = {
            parentId: assignmentData.offering_id,
            childId: assignmentData.attribute_id,
            ...(assignmentData.value !== undefined && { value: assignmentData.value })
        }

        const responseData = await apiFetch<AssignmentSuccessData<WholesalerOfferingAttribute>>(
            '/api/offering-attributes',
            { method: 'POST', body: createPostBody(requestBody) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully created offering attribute assignment.`, {
            offeringId: assignmentData.offering_id,
            attributeId: assignmentData.attribute_id,
            value: assignmentData.value
        });

        return responseData.assignment;
    } catch (err) {
        log.error(`[${operationId}] Failed to create offering attribute assignment.`, {
            assignmentData,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Updates an existing offering-attribute assignment using type-safe request.
 *
 * @param offeringId The ID of the offering.
 * @param attributeId The ID of the attribute.
 * @param updates A partial assignment object with the fields to update.
 * @returns A promise that resolves to the fully updated assignment.
 * @throws {ApiError} If validation fails or another error occurs.
 */
export async function updateOfferingAttribute(
    offeringId: number,
    attributeId: number,
    updates: { value?: string }
): Promise<WholesalerOfferingAttribute> {
    const operationId = `updateOfferingAttribute-${offeringId}-${attributeId}`;
    offeringLoadingState.start(operationId);
    try {
        // Use type-safe update request
        const requestBody: AssignmentUpdateRequest<WholesalerItemOffering, Attribute, { value?: string }> = {
            parentId: offeringId,
            childId: attributeId,
            ...(updates.value !== undefined && { value: updates.value })
        };

        const responseData = await apiFetch<AssignmentSuccessData<WholesalerOfferingAttribute>>(
            `/api/offering-attributes`,
            { method: 'PUT', body: createPostBody(requestBody) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully updated offering attribute assignment.`, {
            offeringId,
            attributeId,
            updatedFields: Object.keys(updates)
        });

        return responseData.assignment;
    } catch (err) {
        log.error(`[${operationId}] Failed to update offering attribute assignment.`, {
            offeringId,
            attributeId,
            updates,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Deletes an offering-attribute assignment using type-safe request.
 *
 * @param offeringId The ID of the offering.
 * @param attributeId The ID of the attribute.
 * @param cascade Whether to perform a cascade delete of related data.
 * @returns A promise that resolves to the full DeleteApiResponse union.
 * @throws {ApiError} Only for unexpected server errors.
 */
export async function deleteOfferingAttribute(
    offeringId: number,
    attributeId: number,
    cascade = false
): Promise<DeleteApiResponse<{ offering_id: number; attribute_id: number; attribute_name: string }, string[]>> {
    const operationId = `deleteOfferingAttribute-${offeringId}-${attributeId}`;
    offeringLoadingState.start(operationId);
    try {
        // Use type-safe removal request
        const requestBody: RemoveAssignmentRequest<WholesalerItemOffering, Attribute> = {
            parentId: offeringId,
            childId: attributeId,
            cascade
        };

        const result = await apiFetchUnion<DeleteApiResponse<{ offering_id: number; attribute_id: number; attribute_name: string }, string[]>>(
            '/api/offering-attributes',
            { method: 'DELETE', body: createPostBody(requestBody) },
            { context: operationId }
        );

        if (result.success) {
            log.info(`[${operationId}] Successfully deleted offering attribute assignment.`, {
                offeringId,
                attributeId,
                cascade
            });
        } else if ('cascade_available' in result) {
            log.warn(`[${operationId}] Attribute assignment deletion blocked by dependencies.`, {
                offeringId,
                attributeId,
                dependencies: result.dependencies
            });
        }

        return result;
    } catch (err) {
        log.error(`[${operationId}] Failed to delete offering attribute assignment.`, {
            offeringId,
            attributeId,
            cascade,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

// ===== LEVEL 5: LINK MANAGEMENT (Offering Compositions) =====

/**
 * Loads all links for a specific offering.
 * This is a composition relationship managed by offering.ts.
 *
 * @param offeringId The ID of the offering.
 * @returns A promise that resolves to an array of offering links.
 * @throws {ApiError} If the API call fails.
 */
export async function loadOfferingLinks(offeringId: number): Promise<WholesalerOfferingLink[]> {
    const operationId = `loadOfferingLinks-${offeringId}`;
    offeringLoadingState.start(operationId);
    try {
        const request: PredefinedQueryRequest = {
            namedQuery: 'offering_links',
            payload: {
                select: [
                    'wol.link_id',
                    'wol.offering_id',
                    'wol.url',
                    'wol.notes',
                    'wol.created_at'
                ],
                where: {
                    op: LogicalOperator.AND,
                    conditions: [{ key: 'wio.offering_id', op: ComparisonOperator.EQUALS, val: offeringId }]
                },
                orderBy: [{ key: 'wol.created_at', direction: 'desc' }]
            }
        };

        const responseData = await apiFetch<QueryResponseData<WholesalerOfferingLink>>(
            '/api/query',
            { method: 'POST', body: createPostBody(request) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully loaded offering links.`, {
            offeringId,
            count: responseData.results.length
        });

        return responseData.results as WholesalerOfferingLink[];
    } catch (err) {
        log.error(`[${operationId}] Failed to load offering links.`, {
            offeringId,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Creates a new offering link using type-safe request.
 *
 * @param linkData The data for the new link.
 * @returns A promise that resolves to the newly created link.
 * @throws {ApiError} If validation fails or another server error occurs.
 */
export async function createOfferingLink(
    linkData: Omit<WholesalerOfferingLink, 'link_id'>
): Promise<WholesalerOfferingLink> {
    const operationId = 'createOfferingLink';
    offeringLoadingState.start(operationId);
    try {
        // Use type-safe create request
        const requestBody: CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, 'link_id'>> = {
            id: linkData.offering_id,  // Parent-ID
            data: linkData
        };

        const responseData = await apiFetch<{ link: WholesalerOfferingLink }>(
            '/api/offering-links',
            { method: 'POST', body: createPostBody(requestBody) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully created offering link.`, {
            linkId: responseData.link.link_id,
            offeringId: responseData.link.offering_id,
            url: responseData.link.url
        });

        return responseData.link;
    } catch (err) {
        log.error(`[${operationId}] Failed to create offering link.`, {
            linkData,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Updates an existing offering link using type-safe request.
 *
 * @param linkId The ID of the link to update.
 * @param updates A partial link object with the fields to update.
 * @returns A promise that resolves to the fully updated link.
 * @throws {ApiError} If validation fails or another error occurs.
 */
export async function updateOfferingLink(
    linkId: number,
    updates: {
        offering_id?: number;
        url?: string;
        notes?: string;
    }
): Promise<WholesalerOfferingLink> {
    const operationId = `updateOfferingLink-${linkId}`;
    offeringLoadingState.start(operationId);
    try {
        const rb = { link_id: linkId, ...updates }
        const responseData = await apiFetch<{ link: WholesalerOfferingLink }>(
            `/api/offering-links`,
            { method: 'PUT', body: createPostBody(rb) },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully updated offering link.`, {
            linkId,
            updatedFields: Object.keys(updates)
        });

        return responseData.link;
    } catch (err) {
        log.error(`[${operationId}] Failed to update offering link.`, {
            linkId,
            updates,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

/**
 * Deletes an offering link using type-safe request.
 *
 * @param linkId The ID of the link to delete.
 * @param cascade Whether to perform a cascade delete of related data.
 * @returns A promise that resolves to the full DeleteApiResponse union.
 * @throws {ApiError} Only for unexpected server errors.
 */
export async function deleteOfferingLink(
    linkId: number,
    cascade = false
): Promise<DeleteApiResponse<{ link_id: number; url: string }, string[]>> {
    const operationId = `deleteOfferingLink-${linkId}`;
    offeringLoadingState.start(operationId);
    try {
        // Use type-safe removal request
        const requestBody: DeleteRequest<WholesalerOfferingLink> = {
            id: linkId,
            cascade
        };

        const result = await apiFetchUnion<DeleteApiResponse<{ link_id: number; url: string }, string[]>>(
            '/api/offering-links',
            { method: 'DELETE', body: createPostBody(requestBody) },
            { context: operationId }
        );

        if (result.success) {
            log.info(`[${operationId}] Successfully deleted offering link.`, {
                linkId,
                cascade
            });
        } else if ('cascade_available' in result) {
            log.warn(`[${operationId}] Link deletion blocked by dependencies.`, {
                linkId,
                dependencies: result.dependencies
            });
        }

        return result;
    } catch (err) {
        log.error(`[${operationId}] Failed to delete offering link.`, {
            linkId,
            cascade,
            error: getErrorMessage(err)
        });
        throw err;
    } finally {
        offeringLoadingState.finish(operationId);
    }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Creates a composite ID for attribute grid operations.
 * This is used by the DataGrid component for row identification.
 */
export function createAttributeCompositeId(offeringId: number, attributeId: number): string {
    return `${offeringId}-${attributeId}`;
}

/**
 * Parses a composite ID back to offering and attribute IDs.
 * This is used when processing grid selection events.
 */
export function parseAttributeCompositeId(compositeId: string): { offeringId: number; attributeId: number } | null {
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