// File: src/lib/backendQueries/__tests__/imageMatching.test.ts

import { describe, it, expect } from 'vitest';
import { findBestMatchingImage, extractMatchCriteriaFromOffering } from '../imageMatching';
import { mockImages } from './mocks/imageMatchMock';
import { mockOfferings } from './mocks/offeringMock';
import type { WholesalerItemOffering } from '$lib/domain/domainTypes';

describe('imageMatching', () => {
  describe('findBestMatchingImage', () => {

    // ===== EXACT MATCHES =====

    it('should match exact Material + Form (Rose Quartz Sphere)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSphere as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(2); // rose-quartz-sphere.jpg
      expect(result?.is_primary).toBe(true);
      expect(result?.image?.filename).toBe('rose-quartz-sphere.jpg');
    });

    it('should match exact Material + Form (Amethyst Sphere)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.amethystSphere as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(3); // amethyst-sphere.jpg
      expect(result?.material_id).toBe(7); // Amethyst
      expect(result?.form_id).toBe(2); // Sphere
    });

    it('should match exact Material + Form (Rose Quartz Pyramid)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzPyramid as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(4); // rose-quartz-pyramid.jpg
      expect(result?.form_id).toBe(3); // Pyramid (different form)
    });

    // ===== SURFACE FINISH VARIATIONS =====

    it('should match Material + Form + Surface Finish (Rose Quartz Sphere Polished)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSpherePolished as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(5); // rose-quartz-sphere-polished.jpg
      expect(result?.surface_finish_id).toBe(1); // Polished
    });

    it('should match Material + Form + Surface Finish (Rose Quartz Sphere Tumbled)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSphereTumbled as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(6); // rose-quartz-sphere-tumbled.jpg
      expect(result?.surface_finish_id).toBe(2); // Tumbled
    });

    // ===== GENERIC / FALLBACK =====

    it('should match generic image when all fields are NULL', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.genericOffering as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(1); // generic-crystal.jpg
      expect(result?.material_id).toBeNull();
      expect(result?.form_id).toBeNull();
    });

    // ===== CONSTRUCTION TYPE VARIATIONS =====

    it('should match Construction Type only (Necklace Threaded)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.necklaceThreaded as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(7); // necklace-threaded.jpg
      expect(result?.construction_type_id).toBe(10); // Threaded
      expect(result?.is_primary).toBe(true);
    });

    it('should match Construction Type + Form (Necklace Pendant Heart)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.necklacePendantHeart as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(8); // necklace-pendant-heart.jpg
      expect(result?.construction_type_id).toBe(11); // Pendant
      expect(result?.form_id).toBe(4); // Heart
    });

    // ===== SIZE RANGE MATCHING =====

    it('should match size within range (S matches S-M)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSphereSmall as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(9); // rose-quartz-sphere-small-medium.jpg
      expect(result?.size_range).toBe('S-M');
      // Offering has size "S", image has size_range "S-M" → should match
    });

    // ===== COLOR VARIANT HANDLING (OPTIONAL) =====

    it('should still match despite different color_variant (optional field)', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSphereDifferentColor as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      // Should match an image even though color_variant differs
      // Color is optional, so exact material+form match is sufficient
      expect(result?.material_id).toBe(5); // Rose Quartz
      expect(result?.form_id).toBe(2); // Sphere
    });

    // ===== NO MATCH SCENARIO (falls back to generic image) =====

    it('should fall back to generic image when no exact material match exists', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.nonExistentMaterial as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(1); // Generic fallback image
      expect(result?.material_id).toBeNull();
      // Material 999 does not exist, so it falls back to generic image (material_id=NULL)
    });

    // ===== TIEBREAKER: is_primary first, then sort_order =====

    it('should prefer is_primary=true over higher sort_order', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSphereTiebreaker as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(2); // Primary image wins
      expect(result?.is_primary).toBe(true);
      expect(result?.sort_order).toBe(1);

      // Should NOT pick image 10 (is_primary=false, sort_order=10)
      expect(result?.image_id).not.toBe(10);
    });

    // ===== EDGE CASES =====

    it('should return null when images array is empty', () => {
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.roseQuartzSphere as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, []);

      expect(result).toBeNull();
    });

    it('should return null when no match exists and no generic fallback available', () => {
      // Use only specific images (no generic image with NULL fields)
      const specificImagesOnly = mockImages.filter(img => img.image_id !== 1);
      const criteria = extractMatchCriteriaFromOffering(mockOfferings.nonExistentMaterial as WholesalerItemOffering);
      const result = findBestMatchingImage(criteria, specificImagesOnly);

      expect(result).toBeNull();
      // Material 999 doesn't exist, and no generic fallback available
    });

    it('should handle null offering fields gracefully', () => {
      const criteria = {
        material_id: null,
        form_id: null,
        surface_finish_id: null,
        construction_type_id: null,
        color_variant: null,
        size: null,
      };
      const result = findBestMatchingImage(criteria, mockImages);

      expect(result).not.toBeNull();
      expect(result?.image_id).toBe(1); // Generic image
    });
  });

  describe('extractMatchCriteriaFromOffering', () => {
    it('should extract all relevant fields from offering', () => {
      const offering = mockOfferings.roseQuartzSphere as WholesalerItemOffering;
      const criteria = extractMatchCriteriaFromOffering(offering);

      expect(criteria).toEqual({
        material_id: 5,
        form_id: 2,
        surface_finish_id: null,
        construction_type_id: null,
        color_variant: 'pink',
        size: 'M',
      });
    });

    it('should handle offerings with all fields set', () => {
      const offering = mockOfferings.roseQuartzSpherePolished as WholesalerItemOffering;
      const criteria = extractMatchCriteriaFromOffering(offering);

      expect(criteria.material_id).toBe(5);
      expect(criteria.form_id).toBe(2);
      expect(criteria.surface_finish_id).toBe(1);
      expect(criteria.size).toBe('S');
    });

    it('should handle offerings with NULL variant fields', () => {
      const offering = mockOfferings.genericOffering as WholesalerItemOffering;
      const criteria = extractMatchCriteriaFromOffering(offering);

      expect(criteria.material_id).toBeNull();
      expect(criteria.form_id).toBeNull();
      expect(criteria.surface_finish_id).toBeNull();
      expect(criteria.construction_type_id).toBeNull();
    });
  });
});
