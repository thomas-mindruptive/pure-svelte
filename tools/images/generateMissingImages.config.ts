// File: tools/images/generateMissingImages.config.ts

/**
 * Configuration for AI Image Generation CLI Tool
 *
 * This config defines:
 * - Which offerings to analyze (filters)
 * - How to generate images (fal.ai settings)
 * - What style/quality to use (prompt settings)
 */

import { entityOperations } from "@pure/svelte/backend-queries";
import { queryGrammar } from "@pure/svelte/backend-queries";
import type { domainTypes } from "@pure/svelte/domain";
//import { domainTypes } from "@pure/svelte/domain";


// Type aliases for namespace types
// Note: TypeScript doesn't allow namespace type aliases for type access (e.g., OfferingNS.ImageAnalysisFilters),
// so we must use the full path: entityOperations.offering.ImageAnalysisFilters
type ImageAnalysisFilters = entityOperations.offering.ImageAnalysisFilters;
type LoadOfferingsOptions = entityOperations.offering.LoadOfferingsOptions;


/**
 * Options for loading offerings.
 */
export const loadOfferingOptions: LoadOfferingsOptions = {
  // excludedWholesalerIds: [99],
  // allowedWholesalerRelevances: ['high', 'medium', 'highest'],
  allowedWholesalerIds: [99]
}

export const loadOfferingWhereConditions: queryGrammar.WhereConditionGroup<domainTypes.OfferingEnrichedView> = {
  whereCondOp: "AND",
  conditions: [
    { key: "wholesalerId", whereCondOp: "IN", val: [99] },
    { key: "categoryId", whereCondOp: "NOT IN", val: [26] },
    // { key: "productTypeId", whereCondOp: "IN", val: [11] } // Semi-precious Stone
  ]
}

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

    /**
     * Negative prompt - what NOT to include in generated images
     * Helps avoid common AI artifacts like blurriness, watermarks, distortions
     */
    negative_prompt?: string;
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

    // Negative prompt to avoid common AI artifacts
    negative_prompt: "blurry, out of focus, low quality, watermark, text, logo, distorted, deformed",
  },

  log: {
    // Path to log file
    logfile: "C:/dev/pure/pure-svelte/log/genImageLog.txt",

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
