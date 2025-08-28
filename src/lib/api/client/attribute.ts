// src/lib/api/client/attribute.ts

/**
 * @file Attribute Master-Data API Client - FINAL ARCHITECTURE
 * @description Provides type-safe client functions for attribute master-data operations.
 * This handles ONLY the master-data CRUD for dbo.attributes according to the 
 * Composition-Prinzip. Offering-attribute assignments are managed by offering.ts.
 */

import { apiFetch, apiFetchUnion, createPostBody, createQueryBody, getErrorMessage } from './common';
import { log } from '$lib/utils/logger';
import { ComparisonOperator, LogicalOperator, type QueryPayload, type Condition, type ConditionGroup } from '$lib/clientAndBack/queryGrammar';
import type { Attribute } from '$lib/domain/types';

// Import generic types from the single source of truth: common.ts
import type {
    DeleteApiResponse,
    QueryResponseData
} from '$lib/api/types/common';
import { LoadingState } from './loadingState';

// A dedicated loading state manager for all attribute master-data operations.
const attributeLoadingManager = new LoadingState();
export const attributeLoadingState = attributeLoadingManager.isLoadingStore; // Store für $-Syntax
export const attributeLoadingOperations = attributeLoadingManager;

/**
 * The default query payload used when fetching attributes.
 * Ensures a consistent initial view with all relevant fields.
 */
export const DEFAULT_ATTRIBUTE_QUERY: QueryPayload<Attribute> = {
    select: ['attribute_id', 'name', 'description'],
    orderBy: [{ key: 'name', direction: 'asc' }],
    limit: 100
};

// ===== ATTRIBUTE MASTER-DATA CRUD =====

/**
 * Loads a list of attributes from the secure entity endpoint `/api/attributes`.
 *
 * @param query A partial `QueryPayload` to filter, sort, or paginate the results.
 * @returns A promise that resolves to an array of `Attribute` objects.
 * @throws {ApiError} If the API call fails for any reason.
 */
export async function loadAttributes(query: Partial<QueryPayload<Attribute>> = {}): Promise<Attribute[]> {
    const operationId = 'loadAttributes';
    attributeLoadingOperations.start(operationId);
    try {
        const fullQuery: QueryPayload<Attribute> = { ...DEFAULT_ATTRIBUTE_QUERY, ...query };

        const responseData = await apiFetch<QueryResponseData<Attribute>>(
            '/api/attributes',
            { method: 'POST', body: createQueryBody(fullQuery) },
            { context: operationId }
        );
        
        log.info(`[${operationId}] Successfully loaded attributes.`, { 
            count: responseData.results.length,
            hasFilter: !!query.where
        });
        
        return responseData.results as Attribute[];
    } catch (err) {
        log.error(`[${operationId}] Failed to load attributes.`, { 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Loads a single, complete attribute object by its ID using a canonical GET request.
 *
 * @param attributeId The ID of the attribute to fetch.
 * @returns A promise that resolves to a single `Attribute` object.
 * @throws {ApiError} If the attribute is not found (404) or the API call fails.
 */
export async function loadAttribute(attributeId: number): Promise<Attribute> {
    const operationId = `loadAttribute-${attributeId}`;
    attributeLoadingOperations.start(operationId);
    try {
        const responseData = await apiFetch<{ attribute: Attribute }>(
            `/api/attributes/${attributeId}`,
            { method: 'GET' },
            { context: operationId }
        );

        log.info(`[${operationId}] Successfully loaded attribute.`, { 
            attributeId,
            name: responseData.attribute.name 
        });
        
        return responseData.attribute;
    } catch (err) {
        log.error(`[${operationId}] Failed to load attribute.`, { 
            attributeId, 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Creates a new attribute by calling the dedicated `/api/attributes/new` endpoint.
 *
 * @param attributeData The data for the new attribute.
 * @returns A promise that resolves to the newly created `Attribute` object from the server.
 * @throws {ApiError} If validation fails (400) or another server error occurs.
 */
export async function createAttribute(
    attributeData: Partial<Omit<Attribute, 'attribute_id'>>
): Promise<Attribute> {
    const operationId = 'createAttribute';
    attributeLoadingOperations.start(operationId);
    try {
        const responseData = await apiFetch<{ attribute: Attribute }>(
            '/api/attributes/new',
            { method: 'POST', body: createPostBody(attributeData) },
            { context: operationId }
        );
        
        log.info(`[${operationId}] Successfully created attribute.`, { 
            attributeId: responseData.attribute.attribute_id,
            name: responseData.attribute.name
        });
        
        return responseData.attribute;
    } catch (err) {
        log.error(`[${operationId}] Failed to create attribute.`, { 
            attributeData, 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Updates an existing attribute with a partial data object.
 *
 * @param attributeId The ID of the attribute to update.
 * @param updates A partial `Attribute` object with the fields to update.
 * @returns A promise that resolves to the fully updated `Attribute` object from the server.
 * @throws {ApiError} If validation fails (400) or another error occurs.
 */
export async function updateAttribute(attributeId: number, updates: Partial<Attribute>): Promise<Attribute> {
    const operationId = `updateAttribute-${attributeId}`;
    attributeLoadingOperations.start(operationId);
    try {
        const responseData = await apiFetch<{ attribute: Attribute }>(
            `/api/attributes/${attributeId}`,
            { method: 'PUT', body: createPostBody(updates) },
            { context: operationId }
        );
        
        log.info(`[${operationId}] Successfully updated attribute.`, { 
            attributeId,
            updatedFields: Object.keys(updates),
            name: responseData.attribute.name
        });
        
        return responseData.attribute;
    } catch (err) {
        log.error(`[${operationId}] Failed to update attribute.`, { 
            attributeId, 
            updates, 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Deletes an attribute. This function uses `apiFetchUnion` to handle dependency conflicts.
 * According to Cascade-Delete methodology, attributes may have assignments in offerings.
 *
 * @param attributeId The ID of the attribute to delete.
 * @param cascade Whether to perform a cascade delete of all related data.
 * @returns A promise that resolves to the full `DeleteApiResponse` union (success or conflict).
 * @throws {ApiError} Only for unexpected server errors (e.g., 500) or network failures.
 */
export async function deleteAttribute(
    attributeId: number,
    cascade = false
): Promise<DeleteApiResponse<{ attribute_id: number; name: string }, string[]>> {
    const operationId = `deleteAttribute-${attributeId}`;
    attributeLoadingOperations.start(operationId);
    try {
        const url = `/api/attributes/${attributeId}${cascade ? '?cascade=true' : ''}`;
        const result = await apiFetchUnion<DeleteApiResponse<{ attribute_id: number; name: string }, string[]>>(
            url,
            { method: 'DELETE' },
            { context: operationId }
        );
        
        if (result.success) {
            log.info(`[${operationId}] Successfully deleted attribute.`, { 
                attributeId, 
                cascade,
                dependenciesCleared: result.data.dependencies_cleared,
                name: result.data.deleted_resource.name
            });
        } else if ('cascade_available' in result) {
            log.warn(`[${operationId}] Attribute deletion blocked by dependencies.`, { 
                attributeId,
                dependencies: result.dependencies 
            });
        }
        
        return result;
    } catch (err) {
        log.error(`[${operationId}] Failed to delete attribute.`, { 
            attributeId, 
            cascade, 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Searches attributes by name using a flexible query.
 * This is useful for attribute selection UI components.
 *
 * @param searchTerm The search term to match against attribute names.
 * @param limit Maximum number of results to return.
 * @returns A promise that resolves to matching attributes.
 * @throws {ApiError} If the API call fails.
 */
export async function searchAttributes(searchTerm: string, limit = 20): Promise<Attribute[]> {
    const operationId = `searchAttributes-${searchTerm}`;
    attributeLoadingOperations.start(operationId);
    try {
        if (!searchTerm.trim()) {
            log.warn(`[${operationId}] Empty search term provided.`);
            return [];
        }

        const searchCondition: Condition<Attribute> = { 
            key: 'name', 
            op: ComparisonOperator.LIKE, 
            val: `%${searchTerm.trim()}%` 
        };
        
        const query: QueryPayload<Attribute> = {
            select: ['attribute_id', 'name', 'description'],
            where: searchCondition,
            orderBy: [{ key: 'name', direction: 'asc' }],
            limit: Math.min(limit, 100) // Cap at 100 for performance
        };

        const responseData = await apiFetch<QueryResponseData<Attribute>>(
            '/api/attributes',
            { method: 'POST', body: createQueryBody(query) },
            { context: operationId }
        );
        
        log.info(`[${operationId}] Successfully searched attributes.`, { 
            searchTerm,
            count: responseData.results.length 
        });
        
        return responseData.results as Attribute[];
    } catch (err) {
        log.error(`[${operationId}] Failed to search attributes.`, { 
            searchTerm, 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Loads attributes that are commonly used (have many assignments).
 * This is useful for UI components that want to suggest popular attributes.
 *
 * @param limit Maximum number of popular attributes to return.
 * @returns A promise that resolves to popular attributes ordered by usage.
 * @throws {ApiError} If the API call fails.
 */
export async function loadPopularAttributes(limit = 10): Promise<Attribute[]> {
    const operationId = 'loadPopularAttributes';
    attributeLoadingOperations.start(operationId);
    try {
        // This would use a predefined query that JOINs with assignment counts
        // For now, we'll load recent attributes as a placeholder
        const query: QueryPayload<Attribute> = {
            select: ['attribute_id', 'name', 'description'],
            orderBy: [{ key: 'attribute_id', direction: 'desc' }], // Most recently created
            limit: Math.min(limit, 50)
        };

        const responseData = await apiFetch<QueryResponseData<Attribute>>(
            '/api/attributes',
            { method: 'POST', body: createQueryBody(query) },
            { context: operationId }
        );
        
        log.info(`[${operationId}] Successfully loaded popular attributes.`, { 
            count: responseData.results.length 
        });
        
        return responseData.results as Attribute[];
    } catch (err) {
        log.error(`[${operationId}] Failed to load popular attributes.`, { 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}

/**
 * Validates if an attribute name is available (not already taken).
 * This is useful for forms to provide real-time validation feedback.
 *
 * @param name The attribute name to check.
 * @param excludeId Optional ID to exclude from the check (for updates).
 * @returns A promise that resolves to true if name is available.
 * @throws {ApiError} If the API call fails.
 */
export async function isAttributeNameAvailable(name: string, excludeId?: number): Promise<boolean> {
    const operationId = `isAttributeNameAvailable-${name}`;
    attributeLoadingOperations.start(operationId);
    try {
        if (!name.trim()) {
            log.warn(`[${operationId}] Empty name provided.`);
            return false;
        }

        const nameCondition: Condition<Attribute> = { 
            key: 'name', 
            op: ComparisonOperator.EQUALS, 
            val: name.trim() 
        };

        let whereCondition: Condition<Attribute> | ConditionGroup<Attribute> = nameCondition;
        
        // Exclude a specific ID if provided (for update scenarios)
        if (excludeId) {
            const excludeCondition: Condition<Attribute> = { 
                key: 'attribute_id', 
                op: ComparisonOperator.NOT_EQUALS, 
                val: excludeId 
            };
            whereCondition = {
                op: LogicalOperator.AND,
                conditions: [nameCondition, excludeCondition]
            };
        }

        const query: QueryPayload<Attribute> = {
            select: ['attribute_id'],
            where: whereCondition,
            limit: 1
        };

        const responseData = await apiFetch<QueryResponseData<Attribute>>(
            '/api/attributes',
            { method: 'POST', body: createQueryBody(query) },
            { context: operationId }
        );
        
        const isAvailable = responseData.results.length === 0;
        
        log.info(`[${operationId}] Name availability check completed.`, { 
            name,
            excludeId,
            isAvailable 
        });
        
        return isAvailable;
    } catch (err) {
        log.error(`[${operationId}] Failed to check attribute name availability.`, { 
            name, 
            excludeId, 
            error: getErrorMessage(err) 
        });
        throw err;
    } finally {
        attributeLoadingOperations.finish(operationId);
    }
}