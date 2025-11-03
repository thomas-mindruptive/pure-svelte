// src/lib/api/client/offeringImage.ts

/**
 * @file Offering Image API Client (OOP Inheritance Pattern)
 * @description Provides type-safe client functions for OfferingImage operations.
 * OfferingImage extends Image using OOP inheritance (same image_id as PK).
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { OfferingImage_Image } from "$lib/domain/domainTypes";
import type { ApiClient } from "./apiClient";
import { LoadingState } from "./loadingState";
import { createImageApi, type ImageApiConfig } from "./imageApi";

const offeringImageLoadingManager = new LoadingState();
export const offeringImageLoadingState = offeringImageLoadingManager.isLoadingStore;
export const offeringImageLoadingOperations = offeringImageLoadingManager;

/**
 * The default query payload used when fetching offering images.
 */
export const DEFAULT_OFFERING_IMAGE_QUERY: Partial<QueryPayload<OfferingImage_Image>> = {
  orderBy: [{ key: "oi.sort_order" as keyof OfferingImage_Image, direction: "asc" }],
  limit: 100,
};

/**
 * Configuration for the offering image API.
 */
const OFFERING_IMAGE_CONFIG: ImageApiConfig<OfferingImage_Image> = {
  endpoint: "/api/offering-images",
  entityName: "offeringImage",
  parentIdKey: "oi.offering_id", // Qualified column name
  sortOrderKey: "oi.sort_order", // Qualified column name
};

/**
 * Factory function to create an offering-image-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all offering image API methods.
 */
export function getOfferingImageApi(client: ApiClient) {
  // Create the generic image API with OfferingImage_Image type
  const imageApi = createImageApi<OfferingImage_Image>(
    client,
    OFFERING_IMAGE_CONFIG,
    offeringImageLoadingManager
  );

  // Return offering-specific wrappers with better naming
  return {
    /**
     * Loads a list of offering images with nested image data.
     * Can be filtered by offering_id.
     */
    async loadOfferingImages(
      query: Partial<QueryPayload<OfferingImage_Image>> = {}
    ): Promise<OfferingImage_Image[]> {
      const fullQuery: Partial<QueryPayload<OfferingImage_Image>> = {
        ...DEFAULT_OFFERING_IMAGE_QUERY,
        ...query,
      };
      return imageApi.loadImages(fullQuery);
    },

    /**
     * Loads offering images for a specific offering.
     */
    async loadOfferingImagesForOffering(offeringId: number): Promise<OfferingImage_Image[]> {
      return imageApi.loadImagesForParent(offeringId);
    },

    /**
     * Loads a single offering image by its image_id (OOP inheritance: same ID for both tables).
     */
    async loadOfferingImage(imageId: number): Promise<OfferingImage_Image> {
      return imageApi.loadImage(imageId);
    },

    /**
     * Creates a new offering image with nested image data.
     * The server will create records in BOTH tables atomically with the same image_id.
     */
    async createOfferingImage(data: Partial<OfferingImage_Image>): Promise<OfferingImage_Image> {
      return imageApi.createImage(data);
    },

    /**
     * Updates an existing offering image with nested image data.
     * Updates BOTH tables atomically using the same image_id (OOP inheritance).
     */
    async updateOfferingImage(
      imageId: number,
      updates: Partial<OfferingImage_Image>
    ): Promise<OfferingImage_Image> {
      return imageApi.updateImage(imageId, updates);
    },

    /**
     * Deletes an offering image completely (OOP inheritance pattern).
     * Deletes from BOTH tables atomically:
     * - offering_images (subclass)
     * - images (base class)
     */
    async deleteOfferingImage(imageId: number, cascade = false, forceCascade = false) {
      return imageApi.deleteImage(imageId, cascade, forceCascade);
    },

    /**
     * Sets the primary image for an offering.
     * Updates is_primary flag: sets target to true, others to false.
     */
    async setPrimaryImage(offeringId: number, imageId: number): Promise<OfferingImage_Image> {
      return imageApi.setPrimaryImage(offeringId, imageId);
    },

    /**
     * Updates the sort order of multiple images at once.
     */
    async updateImagesSortOrder(
      updates: Array<{ imageId: number; sortOrder: number }>
    ): Promise<OfferingImage_Image[]> {
      return imageApi.updateImagesSortOrder(updates);
    },
  };
}
