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
import { insertProductDefinitionImageWithImage } from "$lib/backendQueries/entityOperations/image";
import { loadConfig, type ImageGenerationConfig } from "./generateMissingImages.config";
import { buildPrompt, generateImageFilename } from "./promptBuilder";
import { initializeFalAi, generateImage, estimateCost } from "./falAiClient";
import { downloadAndSaveImage, verifyImageDirectory } from "./imageProcessor";

// Load environment variables
dotenv.config();

// Track start time
const startTime = Date.now();


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
 * Print dry-run summary table
 */
function printDryRunSummary(analysis: OfferingWithImageAnalysis[], config: ImageGenerationConfig) {
  const toGenerate = analysis.filter((a) => a.needs_generation).slice(0, config.generation.batch_size);

  console.log("\n📊 Analysis Results:");
  console.log(`- ${analysis.filter((a) => a.match_quality === "exact").length} offerings with exact match ✅`);
  console.log(`- ${analysis.filter((a) => a.match_quality === "generic_fallback").length} offerings with generic fallback 🔄`);
  console.log(`- ${analysis.filter((a) => a.match_quality === "none").length} offerings without images ❌`);

  console.log(`\n🎨 Would generate images for ${toGenerate.length} offerings:\n`);

  const idWidth = 6;
  const titleWidth = 30;
  const materialWidth = 12;
  const formWidth = 12;
  const surfaceWidth = 12;
  const constructionWidth = 12;
  const matchWidth = 8;
  const imagesWidth = 6;

  // Print table header
  console.log(
    "| ID".padEnd(idWidth + 3) +
    "| Title".padEnd(titleWidth + 3) +
    "| Material".padEnd(materialWidth + 3) +
    "| Form".padEnd(formWidth + 3) +
    "| Surface".padEnd(surfaceWidth + 3) +
    "| Constr".padEnd(constructionWidth + 3) +
    "| Match".padEnd(matchWidth + 3) +
    "| Imgs".padEnd(imagesWidth + 3)
  );

  // Print table rows
  for (const item of toGenerate) {
    const prompt = buildPrompt(
      item.offering,
      item.product_def,
      item.material,
      item.form,
      item.surface_finish,
      item.construction_type,
      config.prompt,
    );

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
    const matchQuality = item.match_quality === "exact" ? "✅" :
                        item.match_quality === "generic_fallback" ? "🔄" :
                        "❌";
    const matchFormatted = matchQuality.padEnd(matchWidth);

    // Available images count
    const imagesCount = item.available_images.length.toString().padEnd(imagesWidth);

    console.log(`│ ${id} │ ${title} │ ${material} │ ${form} │ ${surface} │ ${construction} │ ${matchFormatted} │ ${imagesCount} │`);

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

  const estimatedCost = estimateCost(toGenerate.length, config.generation.model);
  console.log(
    `\n💰 Estimated cost: $${estimatedCost.toFixed(2)} (${toGenerate.length} images × $${(estimatedCost / toGenerate.length).toFixed(2)})`,
  );

  console.log("\nℹ️  This is a dry run. No images were generated.");
  console.log("   Run with --no-dry-run to generate images.");
}

/**
 * Main CLI logic
 */
async function main() {
  const config = await loadConfig();

  log.info("🚀 AI Image Generation CLI Tool");
  log.info("=" + "=".repeat(60));

  if (config.help) {
    showHelp();
    return;
  }

  // Verify API key
  if (!process.env.FAL_KEY && !config.generation.dry_run) {
    log.error("❌ FAL_KEY not found in .env file");
    log.info("Please add your FAL API key to the .env file");
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
      return;
    }

    if (needsGeneration.length === 0) {
      log.info("✅ All offerings have matching images! Nothing to generate.");
      await transaction.rollback();
      await pool.close();
      return;
    }

    // Dry run mode: print summary and exit
    if (config.generation.dry_run) {
      printDryRunSummary(offeringsToGenerate, config);
      await transaction.rollback();
      await pool.close();
      return;
    }

    // Production mode: generate images
    const toGenerate = needsGeneration.slice(0, config.generation.batch_size);
    log.info(`\n🎨 Generating images for ${toGenerate.length} offerings...\n`);

    // Initialize FAL client (only in production)
    initializeFalAi(process.env.FAL_KEY!);
    await verifyImageDirectory(config.generation.image_directory);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toGenerate.length; i++) {
      const item = toGenerate[i];
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
        const prompt = buildPrompt(
          item.offering,
          item.product_def,
          item.material,
          item.form,
          item.surface_finish,
          item.construction_type,
          config.prompt,
        );

        log.info(`  ├─ Prompt: "${prompt.substring(0, 100)}..."`);

        // Generate image with fal.ai
        const imageUrl = await generateImage(prompt, config.generation);
        log.info(`  ├─ Generated: ${imageUrl}`);

        // Download and save image
        const filename = generateImageFilename(item.offering, item.material, item.form);
        const filepath = await downloadAndSaveImage(imageUrl, filename, config.generation);
        log.info(`  ├─ Saved: ${filepath}`);

        // Insert into database
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
        successCount++;
      } catch (error: any) {
        log.error(`  └─ ❌ Failed: ${error.message}\n`);
        failCount++;
      }
    }

    // Commit transaction
    await transaction.commit();
    log.info("✅ Transaction committed\n");

    // Print summary
    const totalCost = estimateCost(successCount, config.generation.model);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    log.info("=" + "=".repeat(60));
    log.info("✅ Summary:");
    log.info(`   - ${successCount} images generated`);
    log.info(`   - ${failCount} failures`);
    log.info(`   - Total cost: $${totalCost.toFixed(2)}`);
    log.info(`   - Total time: ${elapsed}s`);

    if (needsGeneration.length > toGenerate.length) {
      log.info(`\n💡 ${needsGeneration.length - toGenerate.length} more offerings still need images.`);
      log.info("   Run the tool again to generate more.");
    } else {
      log.info("\n🎉 All offerings now have images!");
    }
  } catch (error: any) {
    log.error("❌ Error:", error);
    await transaction.rollback();
    throw error;
  } finally {
    await pool.close();
  }
}

// Run main function
main().catch((error) => {
  log.error("❌ Fatal error:", error);
  process.exit(1);
});
