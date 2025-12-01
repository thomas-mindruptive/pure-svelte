// src/lib/api/client/offeringImage.ts

/**
 * @file Offering Image API Client (Consolidated Image Table)
 * @description Provides type-safe client functions for OfferingImage operations.
 * Uses consolidated images table with offering_id FK.
 * This module follows the Factory Pattern to ensure SSR safety.
 */

import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { OfferingImage_Image, Image } from "$lib/domain/domainTypes";
import type { ApiClient } from "./apiClient";
import { LoadingState } from "./loadingState";
import { createImageApi, type ImageApiConfig } from "./imageApi";

const offeringImageLoadingManager = new LoadingState();
export const offeringImageLoadingState = offeringImageLoadingManager.isLoadingStore;
export const offeringImageLoadingOperations = offeringImageLoadingManager;

/**
 * The default query payload used when fetching offering images.
 * Note: Using Image type for actual data structure, OfferingImage_Image is a type alias for backward compatibility.
 */
export const DEFAULT_OFFERING_IMAGE_QUERY: Partial<QueryPayload<Image>> = {
  orderBy: [{ key: "img.sort_order" as keyof Image, direction: "asc" }],
  limit: 100,
};

/**
 * Configuration for the offering image API.
 */
const OFFERING_IMAGE_CONFIG: ImageApiConfig<Image> = {
  endpoint: "/api/offering-images",
  entityName: "offeringImage",
  parentIdKey: "img.offering_id", // Qualified column name (consolidated table)
  sortOrderKey: "img.sort_order", // Qualified column name (consolidated table)
};

/**
 * Factory function to create an offering-image-specific API client.
 * @param client An instance of ApiClient with the correct fetch context.
 * @returns An object with all offering image API methods.
 */
export function getOfferingImageApi(client: ApiClient) {
  // Create the generic image API with Image type (flat structure)
  const imageApi = createImageApi<Image>(
    client,
    OFFERING_IMAGE_CONFIG,
    offeringImageLoadingManager
  );

  // Return offering-specific wrappers with better naming
  // Note: Return types use OfferingImage_Image alias for backward compatibility, but actual data is flat Image
  return {
    /**
     * Loads a list of offering images (flat Image structure).
     * Can be filtered by offering_id.
     */
    async loadOfferingImages(
      query: Partial<QueryPayload<Image>> = {}
    ): Promise<OfferingImage_Image[]> {
      const fullQuery: Partial<QueryPayload<Image>> = {
        ...DEFAULT_OFFERING_IMAGE_QUERY,
        ...query,
      };
      const images = await imageApi.loadImages(fullQuery);
      return images as OfferingImage_Image[];
    },

    /**
     * Loads offering images for a specific offering.
     */
    async loadOfferingImagesForOffering(offeringId: number): Promise<OfferingImage_Image[]> {
      const images = await imageApi.loadImagesForParent(offeringId);
      return images as OfferingImage_Image[];
    },

    /**
     * Loads a single offering image by its image_id.
     */
    async loadOfferingImage(imageId: number): Promise<OfferingImage_Image> {
      const image = await imageApi.loadImage(imageId);
      return image as OfferingImage_Image;
    },

    /**
     * Creates a new offering image (flat Image structure with offering_id).
     */
    async createOfferingImage(data: Partial<Image>): Promise<OfferingImage_Image> {
      const image = await imageApi.createImage(data);
      return image as OfferingImage_Image;
    },

    /**
     * Updates an existing offering image (flat Image structure).
     */
    async updateOfferingImage(
      imageId: number,
      updates: Partial<Image>
    ): Promise<OfferingImage_Image> {
      const image = await imageApi.updateImage(imageId, updates);
      return image as OfferingImage_Image;
    },

    /**
     * Deletes an offering image.
     */
    async deleteOfferingImage(imageId: number, cascade = false, forceCascade = false) {
      return imageApi.deleteImage(imageId, cascade, forceCascade);
    },

    /**
     * Sets the primary image for an offering.
     * Updates is_primary flag: sets target to true, others to false.
     */
    async setPrimaryImage(offeringId: number, imageId: number): Promise<OfferingImage_Image> {
      const image = await imageApi.setPrimaryImage(offeringId, imageId);
      return image as OfferingImage_Image;
    },

    /**
     * Updates the sort order of multiple images at once.
     */
    async updateImagesSortOrder(
      updates: Array<{ imageId: number; sortOrder: number }>
    ): Promise<OfferingImage_Image[]> {
      const images = await imageApi.updateImagesSortOrder(updates);
      return images as OfferingImage_Image[];
    },
  };
}
