// File: tools/images/generateMissingImages.config.ts

/**
 * Configuration for AI Image Generation CLI Tool
 *
 * This config defines:
 * - Which offerings to analyze (filters)
 * - How to generate images (fal.ai settings)
 * - What style/quality to use (prompt settings)
 */

import type { ImageAnalysisFilters } from "../../src/lib/backendQueries/entityOperations/offering.js";
import type { ImageMatchConfig } from "../../src/lib/backendQueries/imageMatching.js";

/**
 * Complete configuration interface for image generation
 */
export interface ImageGenerationConfig {
  /**
   * Show help message
   */
  help?: boolean;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;

  /**
   * Filters for selecting which offerings to analyze
   */
  filters: ImageAnalysisFilters & {
    /**
     * Only generate images if NO image exists (not even generic fallback).
     * If false, will also generate for generic fallbacks.
     */
    require_exact_match?: boolean;
  };

  /**
   * Configuration for image matching behavior
   */
  matching?: Partial<ImageMatchConfig>;

  /**
   * Image generation settings (fal.ai)
   */
  generation: {
    /**
     * Directory where generated images will be saved
     */
    image_directory: string;

    /**
     * fal.ai model to use
     * - "fal-ai/flux/schnell": Fast, good quality (recommended)
     * - "fal-ai/flux-pro": Slower, highest quality
     */
    model: "fal-ai/flux/schnell" | "fal-ai/flux-pro";

    /**
     * Image size/aspect ratio
     */
    image_size: "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";

    /**
     * Number of inference steps (4-8 recommended)
     * Higher = better quality but slower
     */
    num_inference_steps: number;

    /**
     * How many images to generate per run
     * Set lower for testing, higher for production
     */
    batch_size: number;

    /**
     * Dry run mode: analyze and show what would be generated, but don't actually generate
     */
    dry_run: boolean;
  };

  /**
   * Prompt generation settings
   */
  prompt: {
    /**
     * Photography style
     * - "product_photography": Professional e-commerce style (recommended)
     * - "realistic": Natural, realistic rendering
     * - "artistic": More creative/artistic interpretation
     */
    style: "product_photography" | "realistic" | "artistic";

    /**
     * Background setting
     * - "white": Clean white background (e-commerce standard)
     * - "natural": Natural/contextual background
     * - "studio": Studio setup with lighting
     */
    background: "white" | "natural" | "studio";

    /**
     * Include material properties in prompt (e.g., "translucent", "opaque", "crystalline")
     */
    include_material_properties?: boolean;

    /**
     * Include metaphysical/healing properties in prompt (e.g., "calming energy", "heart chakra")
     * Note: May make images more abstract/less product-focused
     */
    include_metaphysical?: boolean;
  };

  /**
   * Logging configuration
   */
  log: {
    /**
     * Path to log file where dry-run summary will be written
     */
    logfile: string;

    /**
     * Delete log file before writing (fresh log each run)
     * If false, will append to existing log file
     */
    deleteLogfile: boolean;
  };
}

/**
 * Default configuration for image generation
 */
export const defaultConfig: ImageGenerationConfig = {
  filters: {
    // Don't filter by assortment - analyze ALL offerings
    is_assortment: undefined,

    // No minimum price filter - include all prices
    min_price: undefined,

    // No upper price limit
    max_price: undefined,

    // All categories
    category_ids: undefined,

    // All materials
    material_ids: undefined,

    // All wholesalers
    wholesaler_ids: undefined,

    // Only generate if NO image exists (not even generic fallback)
    require_exact_match: true,
  },

  matching: {
    // Fields that MUST match exactly (images with different values are unusable)
    // Note: product_type is NOT a variant field - all images in a product_def share the same type via category
    required_fields: ["construction_type_id", "material_id", "form_id", "surface_finish_id"],

    // Optional fields with scoring weights (nice-to-have but not critical)
    optional_fields: {
      color_variant: 0.6, // Color variant somewhat important ("pink" vs "deep pink")
      size: 0.4, // Size less important ("5cm" vs "6cm" visually similar)
    },

    // Need at least 50% match on optional fields
    min_optional_score: 0.5,

    // NULL handling - strict mode!
    null_behavior: {
      image_null_is_wildcard: false, // NULL in image does NOT match everything
      offering_null_accepts_all: true, // NULL in offering can accept any value
    },
  },

  generation: {
    // Save images to this directory (adjust as needed)
    image_directory: "C:/dev/pureenergyworks/generated-images",

    // Use fast model for testing
    model: "fal-ai/flux/schnell",

    // Square format works well for product images
    image_size: "square_hd",

    // 4 steps = fast, 8 steps = higher quality
    num_inference_steps: 4,

    // Generate N images per run (adjust as needed)
    batch_size: 150,

    // Start with dry run to see what would be generated
    dry_run: true,
  },

  prompt: {
    // Professional product photography style
    style: "product_photography",

    // Clean white background (e-commerce standard)
    background: "white",

    // Include material properties (e.g., "translucent rose quartz")
    include_material_properties: true,

    // Skip metaphysical properties (keep it product-focused)
    include_metaphysical: false,
  },

  log: {
    // Path to log file
    logfile: "C:/dev/pureenergyworks/pure-svelte/log/genImageLog.txt",

    // Delete log file before each run (fresh log)
    deleteLogfile: true,
  }
};

/**
 * Parse CLI arguments
 */
function parseCliArgs(): Partial<ImageGenerationConfig> {
  const args = process.argv.slice(2);
  const overrides: Partial<ImageGenerationConfig> = {};

  for (const arg of args) {
    if (arg === "--help") {
      overrides.help = true;
    } else if (arg === "--verbose") {
      overrides.verbose = true;
    } else if (arg === "--no-dry-run") {
      if (!overrides.generation) overrides.generation = {} as any;
      overrides.generation!.dry_run = false;
    } else if (arg.startsWith("--limit=")) {
      const limit = parseInt(arg.split("=")[1], 10);
      if (!isNaN(limit)) {
        if (!overrides.generation) overrides.generation = {} as any;
        overrides.generation!.batch_size = limit;
      }
    } else if (arg.startsWith("--category-id=")) {
      const categoryId = parseInt(arg.split("=")[1], 10);
      if (!isNaN(categoryId)) {
        if (!overrides.filters) overrides.filters = {} as any;
        overrides.filters!.category_ids = [categoryId];
      }
    } else if (arg.startsWith("--min-price=")) {
      const minPrice = parseFloat(arg.split("=")[1]);
      if (!isNaN(minPrice)) {
        if (!overrides.filters) overrides.filters = {} as any;
        overrides.filters!.min_price = minPrice;
      }
    } else if (arg === "--assortment-only") {
      if (!overrides.filters) overrides.filters = {} as any;
      overrides.filters!.is_assortment = true;
    }
  }

  return overrides;
}

/**
 * Load config with CLI argument overrides
 */
export async function loadConfig(): Promise<ImageGenerationConfig> {
  const cliArgs = parseCliArgs();

  return {
    help: cliArgs.help || false,
    verbose: cliArgs.verbose || false,
    filters: {
      ...defaultConfig.filters,
      ...cliArgs.filters,
    },
    matching: {
      ...defaultConfig.matching,
      ...cliArgs.matching,
    },
    generation: {
      ...defaultConfig.generation,
      ...cliArgs.generation,
    },
    prompt: {
      ...defaultConfig.prompt,
      ...cliArgs.prompt,
    },
    log: {
      ...defaultConfig.log,
    }
  };
}
