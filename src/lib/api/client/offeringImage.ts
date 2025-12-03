// src/lib/api/client/offeringImage.ts

/**
 * @file Offering Image API Client (Junction Table Pattern)
 * @description Provides type-safe client functions for OfferingImage operations.
 * Uses junction table (offering_images) with images table.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import { log } from "$lib/utils/logger";
import type { ApiClient } from "./apiClient";
import { createJsonBody, getErrorMessage } from "./common";
import type {
  QueryResponseData,
  ApiResponse,
  DeleteApiResponse,
  DeleteRequest
} from "$lib/api/api.types";
import { LoadingState } from "./loadingState";
import type { OfferingImageWithJunction } from "$lib/backendQueries/entityOperations/offeringImage";
import type { OfferingImageJunction, OfferingImageView } from "$lib/domain/domainTypes";

const offeringImageLoadingManager = new LoadingState();
export const offeringImageLoadingState = offeringImageLoadingManager.isLoadingStore;
export const offeringImageLoadingOperations = offeringImageLoadingManager;

/**
 * Factory function to create an offering-image-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all offering image API methods.
 */
export function getOfferingImageApi(client: ApiClient) {
  return {
    /**
     * Loads all images for a specific offering.
     * @param offeringId The offering_id to load images for
     * @param options Optional filters (e.g., is_explicit)
     * @returns Array of OfferingImageWithJunction records
     */
    async loadOfferingImages(
      offeringId: number,
      options?: { is_explicit?: boolean }
    ): Promise<OfferingImageWithJunction[]> {
      const operationId = `loadOfferingImages-${offeringId}`;
      offeringImageLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<QueryResponseData<OfferingImageWithJunction>>(
          "/api/offering-images",
          {
            method: "POST",
            body: createJsonBody({ offering_id: offeringId, options }),
          },
          { context: operationId },
        );
        return responseData.results as OfferingImageWithJunction[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringId, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringImageLoadingManager.finish(operationId);
      }
    },

    /**
     * Loads explicit offering images (explicit = true).
     * @param offeringId The offering_id to load images for
     * @returns Array of OfferingImageWithJunction records
     */
    async loadExplicitOfferingImages(offeringId: number): Promise<OfferingImageWithJunction[]> {
      return this.loadOfferingImages(offeringId, { is_explicit: true });
    },

    /**
     * Loads canonical offering images (explicit = false).
     * @param offeringId The offering_id to load images for
     * @returns Array of OfferingImageWithJunction records
     */
    async loadCanonicalOfferingImages(offeringId: number): Promise<OfferingImageWithJunction[]> {
      return this.loadOfferingImages(offeringId, { is_explicit: false });
    },

    /**
     * Loads a single offering image by its offering_image_id (junction ID).
     * @param offeringImageId The offering_image_id (junction ID) to load
     * @returns OfferingImageWithJunction record
     */
    async loadOfferingImage(offeringImageId: number): Promise<OfferingImageWithJunction> {
      const operationId = `loadOfferingImage-${offeringImageId}`;
      offeringImageLoadingManager.start(operationId);
      try {
        const responseData = await client.apiFetch<{ offeringImage: OfferingImageWithJunction }>(
          `/api/offering-images/${offeringImageId}`,
          { method: "GET" },
          { context: operationId },
        );
        return responseData.offeringImage;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringImageId, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringImageLoadingManager.finish(operationId);
      }
    },

    /**
     * Creates a new offering image (Image + Junction entry).
     * Sets explicit = true by default for explicit images.
     * @param data Data containing both image and junction fields (including offering_id)
     * @returns Created OfferingImageWithJunction record
     * @throws ApiError if validation fails (e.g., missing fingerprint fields)
     */
    async createOfferingImage(data: Partial<OfferingImageView>): Promise<OfferingImageView> {
      const operationId = "createOfferingImage";
      offeringImageLoadingManager.start(operationId);
      try {
        const response = await client.apiFetchUnion<ApiResponse<{ offeringImage: OfferingImageView }>>(
          "/api/offering-images/new",
          {
            method: "POST",
            body: createJsonBody(data),
          },
          { context: operationId },
        );
        if (!response.success) {
          throw new Error(response.message);
        }
        return response.data.offeringImage;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { data, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringImageLoadingManager.finish(operationId);
      }
    },

    /**
     * Updates an existing offering image (junction entry and/or associated image).
     * @param offeringImageId The offering_image_id (junction ID) to update
     * @param updateOfferingImageData Partial data for junction and/or image fields
     * @returns Updated OfferingImageWithJunction record
     * @throws ApiError if validation fails (e.g., missing fingerprint fields)
     */
    async updateOfferingImage(
      offeringImageId: number,
      updateOfferingImageData: Partial<OfferingImageView>
    ): Promise<OfferingImageWithJunction> {
      const operationId = `updateOfferingImage-${offeringImageId}`;
      offeringImageLoadingManager.start(operationId);
      try {
        const response = await client.apiFetchUnion<ApiResponse<{ offeringImage: OfferingImageWithJunction }>>(
          `/api/offering-images/${offeringImageId}`,
          {
            method: "PUT",
            body: createJsonBody(updateOfferingImageData),
          },
          { context: operationId },
        );
        if (!response.success) {
          throw new Error(response.message);
        }
        return response.data.offeringImage;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { offeringImageId, updates: updateOfferingImageData, error: getErrorMessage(err) });
        throw err;
      } finally {
        offeringImageLoadingManager.finish(operationId);
      }
    },

    /**
     * Deletes an offering image junction entry.
     * The associated image is NOT deleted (it may be used by other offerings).
     * @param offeringImageId The offering_image_id (junction ID) to delete
     * @param cascade Unused (kept for backward compatibility)
     * @param forceCascade Unused (kept for backward compatibility)
     * @returns Delete info from backend.
     */
    async deleteOfferingImage(
      offeringImageId: number,
      cascade = false,
      forceCascade = false
    ): Promise<DeleteApiResponse<OfferingImageJunction, string[]>> {
      const operationId = `deleteOfferingImage-${offeringImageId}`;
      offeringImageLoadingManager.start(operationId);
      try {
        return await client.apiFetchUnion<DeleteApiResponse<OfferingImageJunction, string[]>>(
          `/api/offering-images/${offeringImageId}`,
          {
            method: "DELETE",
            body: createJsonBody({ cascade, forceCascade } as DeleteRequest<OfferingImageJunction>),
          },
          { context: operationId },
        );  // ← direkt zurückgeben, nicht auspacken!
      } finally {
        offeringImageLoadingManager.finish(operationId);
      }
    },

    // /**
    //  * Sets the primary image for an offering.
    //  * Updates is_primary flag: sets target to true, others to false.
    //  * @param offeringId The offering_id
    //  * @param offeringImageId The offering_image_id (junction ID) to set as primary
    //  * @returns Updated OfferingImageWithJunction record
    //  */
    // async setPrimaryImage(offeringId: number, offeringImageId: number): Promise<OfferingImageWithJunction> {
    //   const operationId = `setPrimaryImage-${offeringId}-${offeringImageId}`;
    //   offeringImageLoadingManager.start(operationId);
    //   try {
    //     // First, get all images for this offering
    //     const allImages = await this.loadOfferingImages(offeringId);

    //     // Update all images: set target to primary, others to false
    //     const updatePromises = allImages.map((img) =>
    //       this.updateOfferingImage(img.offering_image_id, { is_primary: img.offering_image_id === offeringImageId })
    //     );

    //     await Promise.all(updatePromises);

    //     // Return the updated primary image
    //     return this.loadOfferingImage(offeringImageId);
    //   } catch (err) {
    //     log.error(`[${operationId}] Failed.`, { offeringId, offeringImageId, error: getErrorMessage(err) });
    //     throw err;
    //   } finally {
    //     offeringImageLoadingManager.finish(operationId);
    //   }
    // },

    //   /**
    //    * Updates the sort order of multiple offering images at once.
    //    * @param updates Array of { offeringImageId: number, sortOrder: number }
    //    * @returns Array of updated OfferingImageWithJunction records
    //    */
    //   async updateImagesSortOrder(
    //     updates: Array<{ offeringImageId: number; sortOrder: number }>
    //   ): Promise<OfferingImageWithJunction[]> {
    //     const operationId = "updateImagesSortOrder";
    //     offeringImageLoadingManager.start(operationId);
    //     try {
    //       const updatePromises = updates.map((update) =>
    //         this.updateOfferingImage(update.offeringImageId, { sort_order: update.sortOrder })
    //       );
    //       return Promise.all(updatePromises);
    //     } catch (err) {
    //       log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
    //       throw err;
    //     } finally {
    //       offeringImageLoadingManager.finish(operationId);
    //     }
    //   },
    // };
  }
}
