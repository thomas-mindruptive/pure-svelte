// src/lib/api/client/productDefinitionImage.ts

/**
 * @file Product Definition Image API Client (Consolidated Image Table)
 * @description Provides type-safe client functions for ProductDefinitionImage operations.
 * Uses consolidated images table with product_def_id FK.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from "$lib/utils/logger";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { ProductDefinitionImage_Image, Image } from "$lib/domain/domainTypes";

import type { ApiClient } from "./apiClient";
import { createJsonBody, createJsonAndWrapInPayloadPartial, getErrorMessage } from "./common";
import type { QueryResponseData, DeleteApiResponse, DeleteRequest } from "$lib/api/api.types";
import { LoadingState } from "./loadingState";
import { assertDefined } from "$lib/utils/assertions";

const productDefinitionImageLoadingManager = new LoadingState();
export const productDefinitionImageLoadingState = productDefinitionImageLoadingManager.isLoadingStore;
export const productDefinitionImageLoadingOperations = productDefinitionImageLoadingManager;

/**
 * The default query payload used when fetching product definition images.
 * Note: Using Image type for actual data structure, ProductDefinitionImage_Image is a type alias for backward compatibility.
 */
export const DEFAULT_PRODUCT_DEFINITION_IMAGE_QUERY: Partial<QueryPayload<Image>> = {
  orderBy: [{ key: "img.sort_order" as keyof Image, direction: "asc" }],
  limit: 100,
};

/**
 * Factory function to create a product-definition-image-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all product definition image API methods.
 */
export function getProductDefinitionImageApi(client: ApiClient) {
  return {
    // ===== PRODUCT DEFINITION IMAGE CRUD (OOP Inheritance Pattern) =====

    /**
     * Loads a list of product definition images (flat Image structure).
     * Can be filtered by product_def_id.
     */
    async loadProductDefinitionImages(
      query: Partial<QueryPayload<Image>> = {}
    ): Promise<ProductDefinitionImage_Image[]> {
      const operationId = "loadProductDefinitionImages";
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const fullQuery: Partial<QueryPayload<Image>> = {
          ...DEFAULT_PRODUCT_DEFINITION_IMAGE_QUERY,
          ...query,
        };
        const responseData = await client.apiFetch<QueryResponseData<Image>>(
          "/api/product-definition-images",
          { method: "POST", body: createJsonAndWrapInPayloadPartial(fullQuery) },
          { context: operationId },
        );
        return responseData.results as ProductDefinitionImage_Image[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads product definition images for a specific product definition.
     */
    async loadProductDefinitionImagesForProduct(productDefId: number): Promise<ProductDefinitionImage_Image[]> {
      const operationId = `loadProductDefinitionImagesForProduct-${productDefId}`;
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const query: Partial<QueryPayload<Image>> = {
          where: {
            key: "img.product_def_id" as keyof Image,
            whereCondOp: "=",
            val: productDefId,
          },
          orderBy: [{ key: "img.sort_order" as keyof Image, direction: "asc" }],
        };
        const responseData = await client.apiFetch<QueryResponseData<Image>>(
          "/api/product-definition-images",
          { method: "POST", body: createJsonAndWrapInPayloadPartial(query) },
          { context: operationId },
        );
        return responseData.results as ProductDefinitionImage_Image[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Loads a single product definition image by its image_id.
     */
    async loadProductDefinitionImage(imageId: number): Promise<ProductDefinitionImage_Image> {
      const operationId = `loadProductDefinitionImage-${imageId}`;
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ productDefinitionImage: Image }>(
          `/api/product-definition-images/${imageId}`,
          { method: "GET" },
          { context: operationId },
        );
        return responseData.productDefinitionImage as ProductDefinitionImage_Image;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { imageId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Creates a new product definition image (flat Image structure with product_def_id).
     */
    async createProductDefinitionImage(
      data: Partial<Image>
    ): Promise<ProductDefinitionImage_Image> {
      const operationId = "createProductDefinitionImage";
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ productDefinitionImage: Image }>(
          "/api/product-definition-images/new",
          { method: "POST", body: createJsonBody(data) },
          { context: operationId },
        );
        return responseData.productDefinitionImage as ProductDefinitionImage_Image;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { data, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates an existing product definition image (flat Image structure).
     */
    async updateProductDefinitionImage(
      imageId: number,
      updates: Partial<Image>
    ): Promise<ProductDefinitionImage_Image> {
      const operationId = `updateProductDefinitionImage-${imageId}`;
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ productDefinitionImage: Image }>(
          `/api/product-definition-images/${imageId}`,
          { method: "PUT", body: createJsonBody(updates) },
          { context: operationId },
        );
        return responseData.productDefinitionImage as ProductDefinitionImage_Image;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { imageId, updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Deletes a product definition image.
     */
    async deleteProductDefinitionImage(
      imageId: number,
      cascade = false,
      forceCascade = false
    ): Promise<DeleteApiResponse<Image, string[]>> {
      assertDefined(imageId, "imageId");
      const operationId = `deleteProductDefinitionImage-${imageId}`;
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const deleteRequest: DeleteRequest<Image> = {
          id: imageId,
          cascade,
          forceCascade,
        };
        const body = createJsonBody(deleteRequest);

        return await client.apiFetchUnion<DeleteApiResponse<Image, string[]>>(
          `/api/product-definition-images/${imageId}`,
          { method: "DELETE", body },
          { context: operationId },
        );
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { imageId, cascade, forceCascade, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Sets the primary image for a product definition.
     * Updates is_primary flag: sets target to true, others to false.
     */
    async setPrimaryImage(productDefId: number, imageId: number): Promise<ProductDefinitionImage_Image> {
      const operationId = `setPrimaryImage-${productDefId}-${imageId}`;
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        // First, set all images for this product to non-primary
        const allImages = await this.loadProductDefinitionImagesForProduct(productDefId);

        // Update each image's primary status
        const updates = allImages.map(async (img) => {
          if (img.image_id === imageId) {
            // Set this one as primary
            return this.updateProductDefinitionImage(img.image_id, { is_primary: true });
          } else if (img.is_primary) {
            // Unset previous primary
            return this.updateProductDefinitionImage(img.image_id, { is_primary: false });
          }
        });

        await Promise.all(updates);

        // Return the newly set primary image
        return this.loadProductDefinitionImage(imageId);
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { productDefId, imageId, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },

    /**
     * Updates the sort order of multiple images at once.
     */
    async updateImagesSortOrder(
      updates: Array<{ imageId: number; sortOrder: number }>
    ): Promise<ProductDefinitionImage_Image[]> {
      const operationId = "updateImagesSortOrder";
      productDefinitionImageLoadingOperations.start(operationId);
      try {
        const updatePromises = updates.map((update) =>
          this.updateProductDefinitionImage(update.imageId, { sort_order: update.sortOrder })
        );
        return await Promise.all(updatePromises);
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        productDefinitionImageLoadingOperations.finish(operationId);
      }
    },
  };
}
