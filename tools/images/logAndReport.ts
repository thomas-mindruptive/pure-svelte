import { log } from "$lib/utils/logger";
import { estimateCost } from "./falAiClient";
import type { ImageGenerationConfig } from "./generateMissingImages.config";
import * as fs from "fs";
import * as path from "path";
import type { OfferingWithGenPlanAndImage } from "./imageGenTypes";

/**
 * Helper: Write to both console and logfile
 */
let logFileStream: fs.WriteStream | null = null;

export function initLogFile(logfilePath: string, deleteBeforeWrite: boolean): void {
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

export function closeLogFile(): void {
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
 * Print run summary table
 */
export function printRunSummary(processedOfferings: OfferingWithGenPlanAndImage[], config: ImageGenerationConfig) {
  const willGenerate = processedOfferings.filter((o) => o.willGenerate);
  const willSkip = processedOfferings.filter((o) => !o.willGenerate);

  logBoth("\n📊 Analysis Results:");
  logBoth(`- ${willGenerate.length} images would be generated ✅`);
  logBoth(`- ${willSkip.length} duplicates would be skipped ⏭️`);

  logBoth(`\n🎨 Processing plan for ${processedOfferings.length} offerings:\n`);

  const idWidth = 6;
  const titleWidth = 30;
  const productTypeWith = 20;
  const materialWidth = 12;
  const formWidth = 12;
  const surfaceWidth = 12;
  const constructionWidth = 12;
  const sizeWith = 7;
  //const dbMatchWidth = 6;    // DB match quality
  //const batchWidth = 7;       // Batch match indicator
  //const scoreWidth = 7;       // Match score column
  const imagesWidth = 6;
  const willGenWidth = 8;
  const promptWidth = 200;
  const filePathWidth = 120;
  const imageUrlWidth = 30;

  // Print table header
  logBoth(
    "│ ID".padEnd(idWidth + 3) +
      "│ Title".padEnd(titleWidth + 3) +
      "│ ProductType".padEnd(productTypeWith + 3) +
      "│ Material".padEnd(materialWidth + 3) +
      "│ Form".padEnd(formWidth + 3) +
      "│ Surface".padEnd(surfaceWidth + 3) +
      "│ Constr".padEnd(constructionWidth + 3) +
      "│ Size".padEnd(sizeWith + 3) +
      //"│ DB".padEnd(dbMatchWidth + 3) +       // DB match quality
      //"│ Batch".padEnd(batchWidth + 3) +      // Batch match
      //"│ Score".padEnd(scoreWidth + 3) +      // Match score
      "│ Imgs".padEnd(imagesWidth + 3) +
      "│ WillGen".padEnd(willGenWidth + 3) +
      "│ Prompt".padEnd(promptWidth + 3) +
      "│ FilePath".padEnd(filePathWidth + 3) +
      "│ ImageUrl".padEnd(imageUrlWidth + 3)
  );

  // Print table rows
  for (const item of processedOfferings) {
    const id = item.offeringId.toString().padEnd(idWidth);
    const title = (item.offeringTitle + " - " + item.productDefTitle || "Untitled").substring(0, titleWidth).padEnd(titleWidth);

    const productTypeFormatted = item.productTypeName.substring(0, productTypeWith).padEnd(productTypeWith); 

    // Material 
    const materialName = item.finalMaterialName || "-";
    const material = materialName.substring(0, materialWidth).padEnd(materialWidth);

    // Form 
    const formName = item.finalFormName || "-";
    const form = formName.substring(0, formWidth).padEnd(formWidth);

    // Surface 
    const surfaceName = item.finalSurfaceFinishName || "-";
    const surface = surfaceName.substring(0, surfaceWidth).padEnd(surfaceWidth);

    // Construction Type 
    const constructionName = item.finalConstructionTypeName || "-";
    const construction = constructionName.substring(0, constructionWidth).padEnd(constructionWidth);

    let formattedSize = item.offeringSize || "-";
    formattedSize = formattedSize.padEnd(sizeWith);

    // // DB match quality (from initial DB scan)
    // const dbMatchQuality = item.match_quality === "exact" ? "✅" : item.match_quality === "generic_fallback" ? "🔄" : "❌";
    // const dbMatchFormatted = dbMatchQuality.padEnd(dbMatchWidth);

    // // Batch match (matched during batch processing - either DB or placeholder)
    // const batchMatch = (!item.willGenerate && item.matchedInBatch) ? "✅" : "-";
    // const batchFormatted = batchMatch.padEnd(batchWidth);

    // // Match score (0.0-1.0, formatted as percentage)
    // const scoreFormatted = item.match_score !== null
    //   ? `${(item.match_score * 100).toFixed(0)}%`.padEnd(scoreWidth)
    //   : "-".padEnd(scoreWidth);

    // Available images count
    const imagesCount = item.images?.length.toString().padEnd(imagesWidth);

    // Will generate flag
    const willGenIcon = item.willGenerate ? "✅" : "⏭️";
    const willGenFormatted = willGenIcon.padEnd(willGenWidth);

    const prompt = item.prompt;
    const promptFormatted = prompt.substring(0, promptWidth).padEnd(promptWidth);

    const filePathFormatted = item.filePath.substring(0, filePathWidth).padEnd(filePathWidth);
    const imageUrlFormatted = item.imageUrl.substring(0, imageUrlWidth).padEnd(imageUrlWidth);

    logBoth(
      `│ ${id} │ ${title} │ ${productTypeFormatted} │ ${material} │ ${form} │ ${surface} │ ${construction} │ ${formattedSize} | │ ${imagesCount} │ ${willGenFormatted} │ ${promptFormatted} │ ${filePathFormatted} │ ${imageUrlFormatted}`
    );

    // Log full details if verbose
    if (config.verbose) {
      log.info(`  Offering Details:`, {
        offering_id: item.offeringId,
        product_def: item.productDefTitle,
        material: item.finalMaterialName || "none",
        form: item.finalFormName || "none",
        surface_finish: item.finalSurfaceFinishName || "none",
        construction_type: item.finalConstructionTypeName || "none",
        available_images: item.images?.length,
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