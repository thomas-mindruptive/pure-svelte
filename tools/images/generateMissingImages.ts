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

import dotenv from "dotenv";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { analyzeOfferingsForImages, type OfferingWithImageAnalysis } from "$lib/backendQueries/offeringImageAnalysis";
import { insertProductDefinitionImageWithImage, loadProductDefinitionImagesWithImage } from "$lib/backendQueries/entityOperations/image";
import { loadConfig, type ImageGenerationConfig } from "./generateMissingImages.config";
import { buildPrompt, generateImageFilename } from "./promptBuilder";
import { initializeFalAi, generateImage, estimateCost } from "./falAiClient";
import { downloadAndSaveImage, verifyImageDirectory } from "./imageProcessor";
import { extractMatchCriteriaFromOffering, findBestMatchingImage } from "$lib/backendQueries/imageMatching";
import { ComparisonOperator } from "$lib/backendQueries/queryGrammar";
import type { ProductDefinitionImage_Image } from "$lib/domain/domainTypes";
import type { Transaction } from "mssql";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import * as path from "path";
import * as fs from "fs";

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
 * Helper: Write to both console and logfile
 */
let logFileStream: fs.WriteStream | null = null;

function initLogFile(logfilePath: string, deleteBeforeWrite: boolean): void {
  try {
    // Ensure directory exists
    const logDir = path.dirname(logfilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      log.info(`📁 Created log directory: ${logDir}`);
    }

    // Delete existing log file if requested
    if (deleteBeforeWrite && fs.existsSync(logfilePath)) {
      fs.unlinkSync(logfilePath);
      log.info(`🗑️  Deleted previous log file`);
    }

    // Create write stream (append mode)
    logFileStream = fs.createWriteStream(logfilePath, { flags: "a" });

    // Write session header
    const timestamp = new Date().toISOString();
    logFileStream.write(`\n${"=".repeat(80)}\n`);
    logFileStream.write(`Session started: ${timestamp}\n`);
    logFileStream.write(`${"=".repeat(80)}\n\n`);

    log.info(`📄 Logging to: ${logfilePath}`);
  } catch (error: any) {
    log.error(`⚠️  Failed to initialize log file: ${error.message}`);
    log.warn("   Continuing without file logging...");
  }
}

function closeLogFile(): void {
  if (logFileStream) {
    const timestamp = new Date().toISOString();
    logFileStream.write(`\n${"=".repeat(80)}\n`);
    logFileStream.write(`Session ended: ${timestamp}\n`);
    logFileStream.write(`${"=".repeat(80)}\n\n`);
    logFileStream.end();
    logFileStream = null;
  }
}

function logBoth(message: string): void {
  console.log(message);
  if (logFileStream) {
    logFileStream.write(message + "\n");
  }
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
 * @returns Offerings with willGenerate and matchedInBatch flags
 */
async function processOfferingsWithCache(
  offerings: OfferingWithImageAnalysis[],
  transaction: Transaction,
): Promise<OfferingWithGenerationPlan[]> {
  // Cache: product_def_id -> Array of images (real + placeholders)
  const imageCache = new Map<number, ProductDefinitionImage_Image[]>();

  const results: OfferingWithGenerationPlan[] = [];

  for (const offering of offerings) {
    const product_def_id = offering.product_def.product_def_id;

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
    const bestMatch = findBestMatchingImage(criteria, availableImages);

    if (bestMatch) {
      // Match found (either from DB or from previous offering in batch)
      results.push({
        ...offering,
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
      const placeholderImage: ProductDefinitionImage_Image = {
        image_id: -1, // Placeholder ID
        product_def_id: product_def_id,
        material_id: offering.offering.material_id,
        form_id: offering.offering.form_id,
        surface_finish_id: offering.offering.surface_finish_id,
        construction_type_id: offering.offering.construction_type_id,
        color_variant: offering.offering.color_variant,
        image_type: "ai_generated",
        is_primary: false,
        sort_order: 999,
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
 * Print dry-run summary table
 */
function printDryRunSummary(processedOfferings: OfferingWithGenPlanAndImage[], config: ImageGenerationConfig) {
  const willGenerate = processedOfferings.filter((o) => o.willGenerate);
  const willSkip = processedOfferings.filter((o) => !o.willGenerate);

  logBoth("\n📊 Analysis Results:");
  logBoth(`- ${willGenerate.length} images would be generated ✅`);
  logBoth(`- ${willSkip.length} duplicates would be skipped ⏭️`);

  logBoth(`\n🎨 Processing plan for ${processedOfferings.length} offerings:\n`);

  const idWidth = 6;
  const titleWidth = 30;
  const materialWidth = 12;
  const formWidth = 12;
  const surfaceWidth = 12;
  const constructionWidth = 12;
  const matchWidth = 8;
  const imagesWidth = 6;
  const willGenWidth = 8;
  const promptWidth = 50;
  const filePathWidth = 90;
  const imageUrlWidth = 30;

  // Print table header
  logBoth(
    "│ ID".padEnd(idWidth + 3) +
      "│ Title".padEnd(titleWidth + 3) +
      "│ Material".padEnd(materialWidth + 3) +
      "│ Form".padEnd(formWidth + 3) +
      "│ Surface".padEnd(surfaceWidth + 3) +
      "│ Constr".padEnd(constructionWidth + 3) +
      "│ Match".padEnd(matchWidth + 3) +
      "│ Imgs".padEnd(imagesWidth + 3) +
      "│ WillGen".padEnd(willGenWidth + 3) +
      "│ Prompt".padEnd(promptWidth + 3) +
      "│ FilePath".padEnd(filePathWidth + 3) +
      "│ ImageUrl".padEnd(imageUrlWidth + 3)
  );

  // Print table rows
  for (const item of processedOfferings) {
    const id = item.offering.offering_id.toString().padEnd(idWidth);
    const title = (item.offering.title + "- " + item.offering.product_def.title || "Untitled").substring(0, titleWidth).padEnd(titleWidth);

    // Material with inheritance indicator (*) if inherited from product_def
    const materialName = item.material?.name || "-";
    const materialInherited = !item.offering.material && item.material ? "*" : "";
    const material = (materialName + materialInherited).substring(0, materialWidth).padEnd(materialWidth);

    // Form with inheritance indicator
    const formName = item.form?.name || "-";
    const formInherited = !item.offering.form && item.form ? "*" : "";
    const form = (formName + formInherited).substring(0, formWidth).padEnd(formWidth);

    // Surface Finish with inheritance indicator
    const surfaceName = item.surface_finish?.name || "-";
    const surfaceInherited = !item.offering.surface_finish && item.surface_finish ? "*" : "";
    const surface = (surfaceName + surfaceInherited).substring(0, surfaceWidth).padEnd(surfaceWidth);

    // Construction Type with inheritance indicator
    const constructionName = item.construction_type?.name || "-";
    const constructionInherited = !item.offering.construction_type && item.construction_type ? "*" : "";
    const construction = (constructionName + constructionInherited).substring(0, constructionWidth).padEnd(constructionWidth);

    // Match quality
    const matchQuality = item.match_quality === "exact" ? "✅" : item.match_quality === "generic_fallback" ? "🔄" : "❌";
    const matchFormatted = matchQuality.padEnd(matchWidth);

    // Available images count
    const imagesCount = item.available_images.length.toString().padEnd(imagesWidth);

    // Will generate flag
    const willGenIcon = item.willGenerate ? "✅" : "⏭️";
    const willGenFormatted = willGenIcon.padEnd(willGenWidth);

    const prompt = item.prompt;
    const promptFormatted = prompt.substring(0, promptWidth).padEnd(promptWidth);

    const filePathFormatted = item.filePath.substring(0, filePathWidth).padEnd(filePathWidth);
    const imageUrlFormatted = item.imageUrl.substring(0, imageUrlWidth).padEnd(imageUrlWidth);

    logBoth(
      `│ ${id} │ ${title} │ ${material} │ ${form} │ ${surface} │ ${construction} │ ${matchFormatted} │ ${imagesCount} │ ${willGenFormatted} │ ${promptFormatted} │ ${filePathFormatted} │ ${imageUrlFormatted}`
    );

    // Log full details if verbose
    if (config.verbose) {
      log.info(`  Offering Details:`, {
        offering_id: item.offering.offering_id,
        product_def: item.product_def.title,
        material: item.material?.name || "none",
        material_inherited: !item.offering.material && item.material,
        form: item.form?.name || "none",
        form_inherited: !item.offering.form && item.form,
        surface_finish: item.surface_finish?.name || "none",
        surface_inherited: !item.offering.surface_finish && item.surface_finish,
        construction_type: item.construction_type?.name || "none",
        construction_inherited: !item.offering.construction_type && item.construction_type,
        match_quality: item.match_quality,
        available_images: item.available_images.length,
        full_prompt: prompt,
      });
    }
  }

  const estimatedCost = estimateCost(willGenerate.length, config.generation.model);
  logBoth(
    `\n💰 Estimated cost: $${estimatedCost.toFixed(2)} (${willGenerate.length} images × $${willGenerate.length > 0 ? (estimatedCost / willGenerate.length).toFixed(2) : "0.00"})`,
  );

  logBoth("\nℹ️  This is a dry run. No images were generated.");
  logBoth("   Run with --no-dry-run to generate images.");


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
    const processedOfferings = await processOfferingsWithCache(toProcess, transaction);
    log.info(`✅ Cache simulation complete`);

    // Dry run mode: print summary and exit
    // if (config.generation.dry_run) {
    //   printDryRunSummary(processedOfferings, config);
    //   await transaction.rollback();
    //   await pool.close();
    //   return;
    // }

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
        const filename = generateImageFilename(item.offering, item.material, item.form);
        let filepath = "DRY - " + path.join(config.generation.image_directory, filename);
        if (!config.generation.dry_run) {
          filepath = await downloadAndSaveImage(imageUrl, filename, config.generation);
        }
        log.info(`  ├─ Saved: ${filepath}`);
        itemWithGenPlanAndImage.filePath = filepath;

        // Insert into database
        if (!config.generation.dry_run) {
          log.info(`  ├─ Creating ProductDefinitionImage...`);
          const result = await insertProductDefinitionImageWithImage(transaction, {
            product_def_id: item.product_def.product_def_id,
            material_id: item.offering.material_id,
            form_id: item.offering.form_id,
            surface_finish_id: item.offering.surface_finish_id,
            construction_type_id: item.offering.construction_type_id,
            color_variant: item.offering.color_variant,
            image_type: "ai_generated",
            is_primary: false,
            sort_order: 999,
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

    printDryRunSummary(offeringsWithGenPlanAndImage, config);
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
