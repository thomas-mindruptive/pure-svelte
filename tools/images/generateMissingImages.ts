#!/usr/bin/env node
// File: tools/images/generateMissingImages.ts

/**
 * CLI Tool: AI Image Generation for Offerings
 *
 * Analyzes offerings without matching images and generates product photos using fal.ai
 *
 * Usage:
 *   npm run generate-images                    # Dry run (default)
 *   npm run generate-images -- --no-dry-run    # Actually generate images
 *   npm run generate-images -- --limit=5       # Generate max 5 images
 */

import { db } from "$lib/backendQueries/db";
import { insertProductDefinitionImageWithImage, loadProductDefinitionImagesWithImage } from "$lib/backendQueries/entityOperations/image";
import { DEFAULT_MATCH_CONFIG, extractMatchCriteriaFromOffering, findBestMatchingImage, findBestMatchingImageWithScore } from "$lib/backendQueries/imageMatching";
import { analyzeOfferingsForImages, type OfferingWithImageAnalysis } from "$lib/backendQueries/offeringImageAnalysis";
import { ComparisonOperator } from "$lib/backendQueries/queryGrammar";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import type { ProductDefinitionImage_Image } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import dotenv from "dotenv";
import type { Transaction } from "mssql";
import * as path from "path";
import { estimateCost, generateImage, initializeFalAi } from "./falAiClient";
import { loadConfig } from "./generateMissingImages.config";
import { downloadAndSaveImage, verifyImageDirectory } from "./imageProcessor";
import { closeLogFile, initLogFile, printRunSummary } from "./logAndReport";
import { buildPrompt } from "./promptBuilder";
import { genAbsImgDirName, generateImageFilename } from "./fileUtils";


// Load environment variables
dotenv.config();

// Track start time
const startTime = Date.now();

/**
 * Extended offering with generation plan flags
 */
export interface OfferingWithGenerationPlan extends OfferingWithImageAnalysis {
  willGenerate: boolean;
  matchedInBatch: boolean;
}

export interface OfferingWithGenPlanAndImage extends OfferingWithGenerationPlan {
  filePath: string;
  imageUrl: string;
  prompt: string;
}


/**
 * Show help message
 */
function showHelp() {
  console.log(`
AI Image Generation CLI Tool

Usage:
  npm run generate-images [options]

Options:
  --no-dry-run          Actually generate images (default is dry-run)
  --limit=<number>      Max number of images to generate
  --category-id=<id>    Only analyze offerings from this category
  --verbose             Enable verbose logging
  --help                Show this help message

Examples:
  npm run generate-images                    # Dry run
  npm run generate-images -- --no-dry-run    # Generate images
  npm run generate-images -- --limit=5       # Generate max 5
  `);
}

/**
 * Validates that a size_range string matches the DB CHECK constraint.
 * Must match exactly what's allowed in the database.
 */
function validateSizeRange(size: string | null | undefined): string | null {
  if (!size) return null;

  // Valid values from DB CHECK constraint
  const validSizeRanges = [
    // Single sizes
    'XS', 'S', 'M', 'L', 'XL', 'XXL',
    // XS ranges
    'XS-S', 'XS-M', 'XS-L', 'XS-XL', 'XS-XXL',
    // S ranges
    'S-M', 'S-L', 'S-XL', 'S-XXL',
    // M ranges
    'M-L', 'M-XL', 'M-XXL',
    // L ranges
    'L-XL', 'L-XXL',
    // XL ranges
    'XL-XXL'
  ];

  if (validSizeRanges.includes(size)) {
    return size;
  } else {
    throw new Error(
      `Invalid size range: "${size}". Must be one of: ${validSizeRanges.join(', ')}`
    );
  }
}

/**
 * Helper function to build consistent image data for both placeholder and DB insert.
 * This ensures 100% consistency between cache and database.
 */
function buildImageData(offering: OfferingWithImageAnalysis): {
  product_def_id: number;
  material_id: number | null;
  form_id: number | null;
  surface_finish_id: number | null;
  construction_type_id: number | null;
  color_variant: string | null;
  size_range: string | null;
  image_type: string;
  is_primary: boolean;
  sort_order: number;
} {
  // Validate and map offering.size to size_range
  const size_range = validateSizeRange(offering.offering.size);

  return {
    product_def_id: offering.product_def.product_def_id,
    // COALESCE: offering value or inherit from product_def
    material_id: offering.offering.material_id ?? offering.product_def.material_id ?? null,
    form_id: offering.offering.form_id ?? offering.product_def.form_id ?? null,
    surface_finish_id: offering.offering.surface_finish_id ?? offering.product_def.surface_finish_id ?? null,
    construction_type_id: offering.offering.construction_type_id ?? offering.product_def.construction_type_id ?? null,
    color_variant: offering.offering.color_variant ?? null,
    size_range: size_range, // Validated size range
    image_type: "ai_generated",
    is_primary: false,
    sort_order: 999,
  };
}

/**
 * Process offerings with cache simulation to prevent duplicate generations.
 *
 * Uses a cache to simulate "what if we generated images for previous offerings?"
 * - If an offering matches an existing image (from DB or cache), mark willGenerate=false
 * - If no match, mark willGenerate=true and add placeholder image to cache
 *
 * This prevents generating duplicate images for offerings with identical criteria
 * within the same batch.
 *
 * @param offerings - Offerings that need image generation
 * @param transaction - Active database transaction
 * @param matchConfig - Image matching configuration
 * @returns Offerings with willGenerate and matchedInBatch flags
 */
async function processOfferingsWithCache(
  offerings: OfferingWithImageAnalysis[],
  transaction: Transaction,
  matchConfig: Partial<import("$lib/backendQueries/imageMatching").ImageMatchConfig>,
): Promise<OfferingWithGenerationPlan[]> {
  // Cache: product_def_id -> Array of images (real + placeholders)
  const imageCache = new Map<number, ProductDefinitionImage_Image[]>();

  const results: OfferingWithGenerationPlan[] = [];

  for (const offering of offerings) {
    const product_def_id = offering.product_def.product_def_id;

    // Validate size range - fail fast on invalid data
    validateSizeRange(offering.offering.size); // Will throw on invalid size

    // Get images from cache or load from DB
    let availableImages = imageCache.get(product_def_id);

    if (!availableImages) {
      // Not cached yet - load from DB
      const imagesJson = await loadProductDefinitionImagesWithImage(transaction, {
        where: {
          key: "pdi.product_def_id",
          whereCondOp: ComparisonOperator.EQUALS,
          val: product_def_id,
        },
      });
      availableImages = JSON.parse(imagesJson) as ProductDefinitionImage_Image[];

      // Store in cache
      imageCache.set(product_def_id, availableImages);
    }

    // Check matching with ALL images in cache (real + placeholders)
    const criteria = extractMatchCriteriaFromOffering(offering.offering);

    // Use merged config (defaults + user overrides)
    const mergedConfig = {
      ...DEFAULT_MATCH_CONFIG,
      ...matchConfig,
    };

    const matchResult = findBestMatchingImageWithScore(criteria, availableImages, mergedConfig);

    if (matchResult) {
      // Match found (either from DB or from previous offering in batch)
      // Update match_score with the actual score from cache matching
      results.push({
        ...offering,
        match_score: matchResult.score, // Update score based on cache match
        willGenerate: false,
        matchedInBatch: true,
      });
    } else {
      // No match - must generate
      results.push({
        ...offering,
        willGenerate: true,
        matchedInBatch: false,
      });

      // Add placeholder image to cache for next offerings
      // Use buildImageData to ensure 100% consistency with DB insert!
      const imageData = buildImageData(offering);
      const placeholderImage: ProductDefinitionImage_Image = {
        image_id: -1, // Placeholder ID
        ...imageData,
        created_at: new Date().toISOString(),
        // Nested image object (placeholder values - never committed to DB)
        image: {
          image_id: -1,
          filename: "placeholder.jpg",
          filepath: "placeholder.jpg",
          file_hash: "placeholder",
          file_size_bytes: 0,
          width_px: null,
          height_px: null,
          mime_type: "image/jpeg",
          created_at: new Date().toISOString(),
        },
      };

      availableImages.push(placeholderImage);
      // Cache is updated - next offering with same criteria will find this placeholder
    }
  }

  return results;
}

/**
 * Main CLI logic
 */
async function main() {
  const config = await loadConfig();

  // Initialize log file
  initLogFile(config.log.logfile, config.log.deleteLogfile);

  log.info("🚀 AI Image Generation CLI Tool");
  log.info("=" + "=".repeat(60));

  if (config.help) {
    showHelp();
    closeLogFile();
    return;
  }

  // Verify API key
  if (!process.env.FAL_KEY && !config.generation.dry_run) {
    log.error("❌ FAL_KEY not found in .env file");
    log.info("Please add your FAL API key to the .env file");
    closeLogFile();
    process.exit(1);
  }

  // Connect to database
  log.info("📊 Connecting to database...");
  const pool = await db;
  const transaction = await pool.transaction();
  await transaction.begin();

  try {
    // Log the filters being used
    log.info("🔍 Filter Configuration:");
    log.info(`   - is_assortment: ${config.filters.is_assortment ?? "any"}`);
    log.info(`   - min_price: ${config.filters.min_price ?? "none"}`);
    log.info(`   - max_price: ${config.filters.max_price ?? "none"}`);
    log.info(`   - category_ids: ${config.filters.category_ids?.join(", ") ?? "all"}`);
    log.info(`   - material_ids: ${config.filters.material_ids?.join(", ") ?? "all"}`);
    log.info(`   - wholesaler_ids: ${config.filters.wholesaler_ids?.join(", ") ?? "all"}`);
    log.info("=" + "=".repeat(60));

    // First, let's check how many offerings exist in total
    if (config.verbose) {
      const countResult = await transaction.request().query(`
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN is_assortment = 1 THEN 1 END) as assortment_count,
               COUNT(CASE WHEN price >= 5 THEN 1 END) as above_min_price,
               COUNT(CASE WHEN is_assortment = 1 AND price >= 5 THEN 1 END) as matching_filters
        FROM dbo.wholesaler_item_offerings
      `);

      const counts = countResult.recordset[0];
      log.info("📊 Database Statistics:");
      log.info(`   - Total offerings: ${counts.total}`);
      log.info(`   - Assortment offerings: ${counts.assortment_count}`);
      log.info(`   - Offerings >= €5: ${counts.above_min_price}`);
      log.info(`   - Matching current filters: ${counts.matching_filters}`);
      log.info("=" + "=".repeat(60));
    }

    // Analyze offerings to find which need images
    log.info("📦 Analyzing offerings for missing images...");
    const offeringsToGenerate = await analyzeOfferingsForImages(transaction, config.filters);

    log.info(`✅ Analysis complete: ${offeringsToGenerate.length} offerings analyzed`);

    // Log breakdown
    const needsGeneration = offeringsToGenerate.filter((a) => a.needs_generation);
    const exactMatches = offeringsToGenerate.filter((a) => a.match_quality === "exact");
    const genericFallbacks = offeringsToGenerate.filter((a) => a.match_quality === "generic_fallback");

    log.info("📈 Results breakdown:");
    log.info(`   - Exact image matches: ${exactMatches.length}`);
    log.info(`   - Generic fallback images: ${genericFallbacks.length}`);
    log.info(`   - Missing images (need generation): ${needsGeneration.length}`);

    if (offeringsToGenerate.length === 0) {
      log.warn("⚠️  No offerings found matching the filters!");
      log.info("   Try adjusting the filters:");
      log.info("   - Remove is_assortment filter");
      log.info("   - Lower or remove min_price");
      log.info("   - Check specific category_ids");
      await transaction.rollback();
      await pool.close();
      closeLogFile();
      return;
    }

    if (needsGeneration.length === 0) {
      log.info("✅ All offerings have matching images! Nothing to generate.");
      await transaction.rollback();
      await pool.close();
      closeLogFile();
      return;
    }

    // Process with cache simulation to prevent duplicates
    const toProcess = needsGeneration.slice(0, config.generation.batch_size);
    log.info(`🔄 Processing ${toProcess.length} offerings with cache simulation...`);
    const processedOfferings = await processOfferingsWithCache(toProcess, transaction, config.matching || {});
    log.info(`✅ Cache simulation complete`);

    // Production mode: generate images

    // If dry run => Use all processed offering in order to print complete info table.
    const toGenerate = config.generation.dry_run ? processedOfferings : processedOfferings.filter((o) => o.willGenerate);
    const toSkip = processedOfferings.filter((o) => !o.willGenerate);
    log.info(`\n🎨 Generating images for ${toGenerate.length} offerings (skipping ${toSkip.length} duplicates)...\n`);

    // Initialize FAL client and verify directory (only in production)
    if (!config.generation.dry_run) {
      initializeFalAi(process.env.FAL_KEY!);
      await verifyImageDirectory(config.generation.image_directory);
    }

    let successCount = 0;
    let failCount = 0;

    const offeringsWithGenPlanAndImage: OfferingWithGenPlanAndImage[] = [];

    for (let i = 0; i < toGenerate.length; i++) {
      const item = toGenerate[i];
      const itemWithGenPlanAndImage: OfferingWithGenPlanAndImage = { ...item, filePath: "", imageUrl: "", prompt: "" };
      offeringsWithGenPlanAndImage.push(itemWithGenPlanAndImage);

      log.info(`[${i + 1}/${toGenerate.length}] Offering #${item.offering.offering_id}: ${item.offering.title || "Untitled"}`);

      if (config.verbose) {
        log.info(`  Details:`, {
          product_def: item.product_def.title,
          material: item.material?.name,
          form: item.form?.name,
          surface_finish: item.surface_finish?.name,
          construction_type: item.construction_type?.name,
        });
      }

      try {
        // Build prompt
        const prompt = buildPrompt(item, config.prompt);
        itemWithGenPlanAndImage.prompt = prompt;

        log.info(`  ├─ Prompt: "${prompt.substring(0, 100)}..."`);

        // Generate image with fal.ai
        let imageUrl = "Dry run -> No url";
        if (!config.generation.dry_run) {
          imageUrl = await generateImage(prompt, config.generation);
        }
        log.info(`  ├─ Generated: ${imageUrl}`);
        itemWithGenPlanAndImage.imageUrl = imageUrl;

        // Download and save image
        const filename = generateImageFilename(item);
        const absImgBaseDir = genAbsImgDirName(config.generation.image_directory, item);
        let filepath = "DRY - " + path.join(absImgBaseDir, filename);
        if (!config.generation.dry_run) {
          filepath = await downloadAndSaveImage(imageUrl, filename, absImgBaseDir);
        }
        log.info(`  ├─ Saved: ${filepath}`);
        itemWithGenPlanAndImage.filePath = filepath;

        // Insert into database
        if (!config.generation.dry_run) {
          log.info(`  ├─ Creating ProductDefinitionImage...`);
          // Use buildImageData to ensure 100% consistency with placeholder!
          const imageData = buildImageData(item);
          const result = await insertProductDefinitionImageWithImage(transaction, {
            ...imageData,
            image: {
              filepath: filepath,
              // Auto-enrichment fills: filename, file_hash, file_size_bytes, width_px, height_px, mime_type
            },
          });
          log.info(`  └─ ✅ Success! Image ID: ${result.image_id}\n`);
        } else {
          log.info(`  └─ ✅ Success! (dry-run - not committed)\n`);
        }

        successCount++;
        //
      } catch (error: any) {
        log.error(`  └─ ❌ Failed: ${error.message}\n`);
        failCount++;
      }
    }

    // Commit or rollback transaction
    if (config.generation.dry_run) {
      await transaction.rollback();
      log.info("✅ Transaction rolled back (dry-run)\n");
    } else {
      await transaction.commit();
      log.info("✅ Transaction committed\n");
    }

    // Print summary
    const totalCost = estimateCost(successCount, config.generation.model);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    log.info("=" + "=".repeat(60));
    log.info("✅ Summary:");
    log.info(`   - ${successCount} images generated`);
    log.info(`   - ${toSkip.length} duplicates skipped`);
    log.info(`   - ${failCount} failures`);
    log.info(`   - Total cost: $${totalCost.toFixed(2)}`);
    log.info(`   - Total time: ${elapsed}s`);

    const remainingCount = needsGeneration.length - processedOfferings.length;
    if (remainingCount > 0) {
      log.info(`\n💡 ${remainingCount} more offerings still need images.`);
      log.info("   Run the tool again to generate more.");
    } else {
      log.info("\n🎉 All offerings now have images!");
    }

    printRunSummary(offeringsWithGenPlanAndImage, config);
    //
  } catch (error: any) {
    log.error("❌ Error:", error);
    await rollbackTransaction(transaction);
    throw error;
  } finally {
    await pool.close();
    closeLogFile();
  }
}

// Run main function
main().catch((error) => {
  log.error("❌ Fatal error:", error);
  closeLogFile();
  process.exit(1);
});
