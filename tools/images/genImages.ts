import { db as dbNS, transactionWrapper as transWRapperNS } from "@pure/svelte/backend-queries";
import { log as LogNS, assertions } from "@pure/svelte/utils";
import { generateImage } from "./falAiClient";
import { defaultConfig, type ImageGenerationConfig } from './generateMissingImages.config';
import type { Lookups, OfferingWithGenerationPlan } from "./imageGenTypes";
import { buildPromptFingerprintImageMapAndInitFingerprintCache, GLOBAL_PROMPT_FINGERPRINT_CACHE, loadLookups, loadOfferingImagesAndInitImageCache, loadOfferingsAndConvertToOfferingsWithGenerationPlan } from "./loadData";
import { closeLogFile, initLogFile } from "./logAndReport";
import { buildPrompt } from "./promptBuilder";
import { genAbsImgDirName, generateImageFilename } from "./fileUtils";
import { downloadAndSaveImage } from "./imageProcessor";
import * as path from "path";

const log = LogNS.log;


/**
 * Entry point
 */
async function run() {
    // Initialize log file
    initLogFile(defaultConfig.log.logfile, defaultConfig.log.deleteLogfile);

    try {
        // Verify API key
        if (!process.env.FAL_AI_API_KEY && !defaultConfig.generation.dry_run) {
            throw new Error("❌ FAL_AI_API_KEY not found in .env file");
        }

        // Load offerings and images.
        const transaction = dbNS.db.transaction();
        let offerings;
        let images;
        try {
            await transaction.begin()
            images = await loadOfferingImagesAndInitImageCache(transaction);
            log.info(`${images.length} images loaded and cached`);
            buildPromptFingerprintImageMapAndInitFingerprintCache(images);
            log.info(`${GLOBAL_PROMPT_FINGERPRINT_CACHE.size} images are in GLOBAL_PROMPT_FINGERPRINT_CACHE`);
            if (GLOBAL_PROMPT_FINGERPRINT_CACHE.size !== images.length) {
                throw new Error(`All images in DB should have prompt fingerprints because it is created during image.ts:insert/update. ` +
                    `=> GLOBAL_PROMPT_FINGERPRINT_CACHE.size should be same as images.lenght`);
            }
            offerings = await loadOfferingsAndConvertToOfferingsWithGenerationPlan(transaction, images);
            log.info(`${offerings.size} offerings loaded`);
            const lookups = await loadLookups(transaction);
            for (const offering of offerings.values()) {
                await processOffering(offering, defaultConfig, lookups);
            }

            closeLogFile();
            process.exit(0);

        } catch (e) {
            throw e;
        } finally {
            await transWRapperNS.rollbackTransaction(transaction);
        }
    }
    catch (e) {
        log.error(e);
        closeLogFile();
        process.exit(0);
    }
}

/**
 * Check and/or generated image(s) for offering.
 * @param offering 
 */
async function processOffering(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig , lookups: Lookups) {
    assertions.assertDefined(offering, "offering");
    assertions.assertDefined(config, "config");

    // Validate size range - fail fast on invalid data
    // E.g. "S-M"
    validateSizeRange(offering); // Will throw on invalid size

    if (0 === offering.images?.length) {
        offering.prompt = buildPrompt(offering, config["prompt"], lookups);
        offering.imageUrl= await generateImage(offering.prompt, config["generation"]);
        await generateAndSaveImage(offering, config);
    }
}

/**
 * Generates, downloads and saves the image locally. 
 * ⚠️  NOTE: Modifies the passed offering and sets filepath etc.
 * @param offering InOut!
 * @param config 
 */
async function generateAndSaveImage(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig) {
    assertions.assertDefined(offering, "offering");
    assertions.assertDefined(offering.imageUrl, "offering.imageUrl");
    assertions.assertDefined(offering.prompt, "offering.prompt");
    assertions.assertDefined(config, "config");

    // Download and save image
    const filename = generateImageFilename(offering);
    const absImgBaseDir = genAbsImgDirName(config.generation.image_directory, offering);
    let filepath = "DRY - " + path.join(absImgBaseDir, filename);
    if (!config.generation.dry_run) {
      filepath = await downloadAndSaveImage(offering.imageUrl, filename, absImgBaseDir);
    }
    log.info(`  ├─ Saved: ${filepath}`);
    offering.filePath = filepath;

    //const offeringImageForDB = OfferingIm
}

/**
 * Ensure valid "offering.size".
 * @param size 
 * @returns 
 */
function validateSizeRange(offering: OfferingWithGenerationPlan): string | null {
    const size = offering.offeringSize;
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
        log.error(`Offering %O`, offering);
        throw new Error(
            `Invalid size range: offering: ${offering.offeringId} "${size}". Must be one of: ${validSizeRanges.join(', ')}`
        );
    }
}

/**
 * Start.
 */
(async () => await run())();

