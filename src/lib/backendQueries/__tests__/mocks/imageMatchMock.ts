// File: src/lib/backendQueries/__tests__/mocks/imageMatchMock.ts

/**
 * Mock Product Definition Images for testing image matching logic.
 *
 * Covers various scenarios:
 * - Generic images (all variant fields NULL)
 * - Material-specific (Rose Quartz, Amethyst)
 * - Form-specific (Sphere, Pyramid, Heart)
 * - Surface Finish (Polished, Tumbled)
 * - Construction Type (Threaded, Pendant)
 * - Combinations of the above
 * - Different is_primary and sort_order values
 */

import type { ProductDefinitionImage_Image } from "$lib/domain/domainTypes";

export const mockImages: ProductDefinitionImage_Image[] = [
  // 1. Generic Image (Fallback - matches anything)
  {
    image_id: 1,
    product_def_id: 100,
    material_id: null,
    form_id: null,
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: null,
    size_range: null,
    image_type: "product",
    sort_order: 99,
    is_primary: false,
    image: {
      image_id: 1,
      filename: "generic-crystal.jpg",
      filepath: "/images/generic-crystal.jpg",
      file_hash: "abc123",
      file_size_bytes: 1000,
      width_px: 800,
      height_px: 600,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-01T00:00:00Z",
    },
    created_at: "2024-01-01T00:00:00Z",
  },

  // 2. Rose Quartz Sphere (Material + Form)
  {
    image_id: 2,
    product_def_id: 100,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "pink",
    size_range: "M",
    image_type: "product",
    sort_order: 1,
    is_primary: true,
    image: {
      image_id: 2,
      filename: "rose-quartz-sphere.jpg",
      filepath: "/images/rose-quartz-sphere.jpg",
      file_hash: "def456",
      file_size_bytes: 1500,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-02T00:00:00Z",
    },
    created_at: "2024-01-02T00:00:00Z",
  },

  // 3. Amethyst Sphere (Material + Form)
  {
    image_id: 3,
    product_def_id: 100,
    material_id: 7, // Amethyst
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "purple",
    size_range: "M",
    image_type: "product",
    sort_order: 2,
    is_primary: false,
    image: {
      image_id: 3,
      filename: "amethyst-sphere.jpg",
      filepath: "/images/amethyst-sphere.jpg",
      file_hash: "ghi789",
      file_size_bytes: 1600,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-03T00:00:00Z",
    },
    created_at: "2024-01-03T00:00:00Z",
  },

  // 4. Rose Quartz Pyramid (Material + Form - different form)
  {
    image_id: 4,
    product_def_id: 100,
    material_id: 5, // Rose Quartz
    form_id: 3, // Pyramid
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "pink",
    size_range: "L",
    image_type: "product",
    sort_order: 3,
    is_primary: false,
    image: {
      image_id: 4,
      filename: "rose-quartz-pyramid.jpg",
      filepath: "/images/rose-quartz-pyramid.jpg",
      file_hash: "jkl012",
      file_size_bytes: 1400,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-04T00:00:00Z",
    },
    created_at: "2024-01-04T00:00:00Z",
  },

  // 5. Rose Quartz Sphere Polished (Material + Form + Surface Finish)
  {
    image_id: 5,
    product_def_id: 100,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: 1, // Polished
    construction_type_id: null,
    color_variant: "pink",
    size_range: "S",
    image_type: "detail",
    sort_order: 4,
    is_primary: false,
    image: {
      image_id: 5,
      filename: "rose-quartz-sphere-polished.jpg",
      filepath: "/images/rose-quartz-sphere-polished.jpg",
      file_hash: "mno345",
      file_size_bytes: 1700,
      width_px: 2048,
      height_px: 1536,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-05T00:00:00Z",
    },
    created_at: "2024-01-05T00:00:00Z",
  },

  // 6. Rose Quartz Sphere Tumbled (Material + Form + Different Surface)
  {
    image_id: 6,
    product_def_id: 100,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: 2, // Tumbled
    construction_type_id: null,
    color_variant: "pink",
    size_range: "M",
    image_type: "product",
    sort_order: 5,
    is_primary: false,
    image: {
      image_id: 6,
      filename: "rose-quartz-sphere-tumbled.jpg",
      filepath: "/images/rose-quartz-sphere-tumbled.jpg",
      file_hash: "pqr678",
      file_size_bytes: 1550,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-06T00:00:00Z",
    },
    created_at: "2024-01-06T00:00:00Z",
  },

  // 7. Necklace Threaded (Construction Type only)
  {
    image_id: 7,
    product_def_id: 101,
    material_id: null,
    form_id: null,
    surface_finish_id: null,
    construction_type_id: 10, // Threaded
    color_variant: null,
    size_range: null,
    image_type: "product",
    sort_order: 1,
    is_primary: true,
    image: {
      image_id: 7,
      filename: "necklace-threaded.jpg",
      filepath: "/images/necklace-threaded.jpg",
      file_hash: "stu901",
      file_size_bytes: 2000,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-07T00:00:00Z",
    },
    created_at: "2024-01-07T00:00:00Z",
  },

  // 8. Necklace Pendant Heart (Construction Type + Form)
  {
    image_id: 8,
    product_def_id: 101,
    material_id: null,
    form_id: 4, // Heart
    surface_finish_id: null,
    construction_type_id: 11, // Pendant
    color_variant: null,
    size_range: null,
    image_type: "product",
    sort_order: 2,
    is_primary: false,
    image: {
      image_id: 8,
      filename: "necklace-pendant-heart.jpg",
      filepath: "/images/necklace-pendant-heart.jpg",
      file_hash: "vwx234",
      file_size_bytes: 1800,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-08T00:00:00Z",
    },
    created_at: "2024-01-08T00:00:00Z",
  },

  // 9. Rose Quartz Sphere with size range (S-M)
  {
    image_id: 9,
    product_def_id: 100,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "light pink",
    size_range: "S-M", // Range
    image_type: "product",
    sort_order: 6,
    is_primary: false,
    image: {
      image_id: 9,
      filename: "rose-quartz-sphere-small-medium.jpg",
      filepath: "/images/rose-quartz-sphere-small-medium.jpg",
      file_hash: "yza567",
      file_size_bytes: 1450,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-09T00:00:00Z",
    },
    created_at: "2024-01-09T00:00:00Z",
  },

  // 10. Second Rose Quartz Sphere (for testing is_primary/sort_order tiebreaker)
  {
    image_id: 10,
    product_def_id: 100,
    material_id: 5, // Rose Quartz
    form_id: 2, // Sphere
    surface_finish_id: null,
    construction_type_id: null,
    color_variant: "pink",
    size_range: "M",
    image_type: "lifestyle",
    sort_order: 10, // Higher sort order than image 2
    is_primary: false, // Not primary (image 2 is primary)
    image: {
      image_id: 10,
      filename: "rose-quartz-sphere-lifestyle.jpg",
      filepath: "/images/rose-quartz-sphere-lifestyle.jpg",
      file_hash: "bcd890",
      file_size_bytes: 1650,
      width_px: 1920,
      height_px: 1080,
      mime_type: "image/jpeg",
      shopify_url: null,
      shopify_media_id: null,
      uploaded_to_shopify_at: null,
      created_at: "2024-01-10T00:00:00Z",
    },
    created_at: "2024-01-10T00:00:00Z",
  },
];
