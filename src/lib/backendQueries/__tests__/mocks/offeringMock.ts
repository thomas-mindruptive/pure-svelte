// File: src/lib/backendQueries/__tests__/mocks/offeringMock.ts

/**
 * Mock Wholesaler Item Offerings for testing image matching logic.
 *
 * Each offering represents a different matching scenario:
 * - Exact matches (material + form)
 * - Partial matches (only material or only form)
 * - Generic offerings (all fields NULL)
 * - Surface finish variations
 * - Construction type variations
 * - Size variations
 */

import type { WholesalerItemOffering } from "$lib/domain/domainTypes";

export const mockOfferings: Record<string, Partial<WholesalerItemOffering>> = {
  // ===== EXACT MATCHES =====

  // Should match image 2: Rose Quartz Sphere (is_primary=true)
  roseQuartzSphere: {
    offering_id: 1,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "pink",
    size: "M",
  },

  // Should match image 3: Amethyst Sphere
  amethystSphere: {
    offering_id: 2,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 7, // Amethyst
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "purple",
    size: "M",
  },

  // Should match image 4: Rose Quartz Pyramid
  roseQuartzPyramid: {
    offering_id: 3,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 3, // Pyramid
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "pink",
    size: "L",
  },

  // ===== SURFACE FINISH VARIATIONS =====

  // Should match image 5: Rose Quartz Sphere Polished
  roseQuartzSpherePolished: {
    offering_id: 4,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: 1, // Polished
    construction_type_id: null,
    color_variant: "pink",
    size: "S",
  },

  // Should match image 6: Rose Quartz Sphere Tumbled
  roseQuartzSphereTumbled: {
    offering_id: 5,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: 2, // Tumbled
    construction_type_id: null,
    color_variant: "pink",
    size: "M",
  },

  // ===== GENERIC / FALLBACK =====

  // Should match image 1: Generic (all fields NULL)
  genericOffering: {
    offering_id: 6,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: null,
    form_id: null,
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: null,
    size: null,
  },

  // ===== CONSTRUCTION TYPE VARIATIONS =====

  // Should match image 7: Necklace Threaded
  necklaceThreaded: {
    offering_id: 7,
    product_def_id: 101,
    wholesaler_id: 1,
    category_id: 2,
    material_id: null,
    form_id: null,
    surface_finish_id: null,
    construction_type_id: 10, // Threaded
    color_variant: null,
    size: null,
  },

  // Should match image 8: Necklace Pendant Heart
  necklacePendantHeart: {
    offering_id: 8,
    product_def_id: 101,
    wholesaler_id: 1,
    category_id: 2,
    material_id: null,
    form_id: 4, // Heart
    surface_finish_id: null,
    construction_type_id: 11, // Pendant
    color_variant: null,
    size: null,
  },

  // ===== SIZE VARIATIONS =====

  // Should match image 9: Rose Quartz Sphere with size range S-M (size "S" is in "S-M")
  roseQuartzSphereSmall: {
    offering_id: 9,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "light pink",
    size: "S", // Should match size_range "S-M"
  },

  // ===== COLOR VARIANT MISMATCH (should still match, color is optional) =====

  // Should match image 2: Rose Quartz Sphere (despite different color_variant)
  roseQuartzSphereDifferentColor: {
    offering_id: 10,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "deep pink", // Different from "pink", but should still match
    size: "M",
  },

  // ===== NO MATCH SCENARIO =====

  // Should return null: No image with material_id=999 exists
  nonExistentMaterial: {
    offering_id: 11,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 999, // Does not exist in mock images
    form_id: 2,
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: null,
    size: null,
  },

  // ===== TIEBREAKER SCENARIO =====

  // Should match image 2 (is_primary=true) over image 10 (is_primary=false, higher sort_order)
  // Both images are Rose Quartz Sphere M, but image 2 is primary
  roseQuartzSphereTiebreaker: {
    offering_id: 12,
    product_def_id: 100,
    wholesaler_id: 1,
    category_id: 1,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "pink",
    size: "M",
  },
};
