// src/lib/api/client/imageApi.ts

/**
 * @file Central Image API Client (Generic, Reusable)
 * @description Provides generic, type-safe functions for Image operations.
 * Used by ProductDefinitionImage and OfferingImage APIs.
 * Follows OOP Inheritance Pattern: image_id is both PK and FK.
 */

import { log } from "$lib/utils/logger";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { ApiClient } from "./apiClient";
import { createJsonBody, createJsonAndWrapInPayloadPartial, getErrorMessage } from "./common";
import type { QueryResponseData, DeleteApiResponse, DeleteRequest } from "$lib/api/api.types";
import { assertDefined } from "$lib/utils/assertions";

/**
 * Generic configuration for image API endpoints.
 */
export interface ImageApiConfig<TImage> {
  endpoint: string; // e.g., "/api/product-definition-images"
  entityName: string; // e.g., "productDefinitionImage"
  parentIdKey: string; // Qualified column like "pdi.product_def_id" or "oi.offering_id"
  sortOrderKey: string; // Qualified column like "pdi.sort_order" or "oi.sort_order"
}

/**
 * Creates a generic image API client.
 * Works with any image type from Zod that has the BaseImageFields.
 * @param client ApiClient instance
 * @param config Configuration for the specific image type
 * @param loadingManager LoadingState manager for tracking operations
 * @returns Object with all generic image API methods
 */
export function createImageApi<TImage>(
  client: ApiClient,
  config: ImageApiConfig<TImage>,
  loadingManager: { start: (id: string) => void; finish: (id: string) => void }
) {
  return {
    /**
     * Loads a list of images with nested image data.
     */
    async loadImages(query: Partial<QueryPayload<TImage>> = {}): Promise<TImage[]> {
      const operationId = `load${config.entityName}s`;
      loadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<QueryResponseData<TImage>>(
          config.endpoint,
          { method: "POST", body: createJsonAndWrapInPayloadPartial(query) },
          { context: operationId },
        );
        return responseData.results as TImage[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Loads images for a specific parent entity (product_def or offering).
     */
    async loadImagesForParent(
      parentId: number,
      additionalQuery?: Partial<QueryPayload<TImage>>
    ): Promise<TImage[]> {
      const operationId = `load${config.entityName}sForParent-${parentId}`;
      loadingManager.start(operationId);
      try {
        const query: Partial<QueryPayload<TImage>> = {
          where: {
            key: config.parentIdKey as any,
            whereCondOp: "=",
            val: parentId,
          },
          orderBy: [{ key: config.sortOrderKey as any, direction: "asc" }],
          ...additionalQuery,
        };
        const responseData = await client.apiFetch<QueryResponseData<TImage>>(
          config.endpoint,
          { method: "POST", body: createJsonAndWrapInPayloadPartial(query) },
          { context: operationId },
        );
        return responseData.results as TImage[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { parentId, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Loads a single image by its image_id (OOP inheritance: same ID for both tables).
     */
    async loadImage(imageId: number): Promise<TImage> {
      const operationId = `load${config.entityName}-${imageId}`;
      loadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<Record<string, TImage>>(
          `${config.endpoint}/${imageId}`,
          { method: "GET" },
          { context: operationId },
        );
        // Response format: { productDefinitionImage: ... } or { offeringImage: ... }
        return responseData[config.entityName];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { imageId, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new image with nested image data.
     * The server will create records in BOTH tables atomically with the same image_id.
     */
    async createImage(data: Partial<TImage>): Promise<TImage> {
      const operationId = `create${config.entityName}`;
      loadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<Record<string, TImage>>(
          `${config.endpoint}/new`,
          { method: "POST", body: createJsonBody(data) },
          { context: operationId },
        );
        return responseData[config.entityName];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { data, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing image with nested image data.
     * Updates BOTH tables atomically using the same image_id (OOP inheritance).
     */
    async updateImage(imageId: number, updates: Partial<TImage>): Promise<TImage> {
      const operationId = `update${config.entityName}-${imageId}`;
      loadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<Record<string, TImage>>(
          `${config.endpoint}/${imageId}`,
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
        );
        return responseData[config.entityName];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { imageId, updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Deletes an image completely (OOP inheritance pattern).
     * Deletes from BOTH tables atomically.
     */
    async deleteImage(
      imageId: number,
      cascade = false,
      forceCascade = false
    ): Promise<DeleteApiResponse<TImage, string[]>> {
      assertDefined(imageId, "imageId");
      const operationId = `delete${config.entityName}-${imageId}`;
      loadingManager.start(operationId);
      try {
        // DeleteRequest expects id to match the type's id field type
        // BaseImageFields guarantees image_id is number
        const deleteRequest: DeleteRequest<TImage> = {
          id: imageId as any, // Type assertion needed due to complex DeleteRequest generic
          cascade,
          forceCascade,
        };
        const body = createJsonBody(deleteRequest);

        return await client.apiFetchUnion<DeleteApiResponse<TImage, string[]>>(
          `${config.endpoint}/${imageId}`,
          { method: "DELETE", body },
          { context: operationId },
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { imageId, cascade, forceCascade, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Sets the primary image for a parent entity.
     * Updates is_primary flag: sets target to true, others to false.
     */
    async setPrimaryImage(parentId: number, imageId: number): Promise<TImage> {
      const operationId = `setPrimaryImage-${parentId}-${imageId}`;
      loadingManager.start(operationId);
      try {
        // First, get all images for this parent
        const allImages = await this.loadImagesForParent(parentId);

        // Update each image's primary status
        const updates = allImages.map(async (img) => {
          const imgAny = img as any; // Runtime: all image subclasses have image_id and is_primary
          if (imgAny.image_id === imageId) {
            return this.updateImage(imgAny.image_id, { is_primary: true } as any);
          } else if (imgAny.is_primary) {
            return this.updateImage(imgAny.image_id, { is_primary: false } as any);
          }
        });

        await Promise.all(updates);

        // Return the newly set primary image
        return this.loadImage(imageId);
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { parentId, imageId, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },

    /**
     * Updates the sort order of multiple images at once.
     */
    async updateImagesSortOrder(
      updates: Array<{ imageId: number; sortOrder: number }>
    ): Promise<TImage[]> {
      const operationId = `updateImagesSortOrder-${config.entityName}`;
      loadingManager.start(operationId);
      try {
        // BaseImageFields guarantees sort_order exists
        const updatePromises = updates.map((update) =>
          this.updateImage(update.imageId, { sort_order: update.sortOrder } as any)
        );
        return await Promise.all(updatePromises);
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        loadingManager.finish(operationId);
      }
    },
  };
}
