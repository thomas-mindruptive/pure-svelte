import { db as dbNS, transactionWrapper as transWRapperNS, entityOperations } from "@pure/svelte/backend-queries";
import { log as LogNS, assertions } from "@pure/svelte/utils";
import type { domainTypes } from "@pure/svelte/domain";
import { generateImage } from "./falAiClient";
import { defaultConfig, type ImageGenerationConfig } from './generateMissingImages.config';
import type { Lookups, OfferingWithGenerationPlan } from "./imageGenTypes";
import { buildPromptFingerprintImageMapAndInitFingerprintCache, GLOBAL_PROMPT_FINGERPRINT_CACHE, loadLookups, loadOfferingImagesAndInitImageCache, loadOfferingsAndConvertToOfferingsWithGenerationPlan } from "./loadData";
import { closeLogFile, initLogFile } from "./logAndReport";
import { buildPrompt } from "./promptBuilder";
import { genAbsImgDirName, generateImageFilename } from "./fileUtils";
import { downloadAndSaveImage } from "./imageProcessor";
import * as path from "path";
import { Transaction } from "mssql";

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
                await processOffering(offering, defaultConfig, lookups, transaction);
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
async function processOffering(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig , lookups: Lookups,  transaction: Transaction) {
    assertions.assertDefined(offering, "offering");
    assertions.assertDefined(config, "config");

    // Validate size range - fail fast on invalid data
    // E.g. "S-M"
    validateSizeRange(offering); // Will throw on invalid size

    if (0 === offering.images?.length) {
        offering.prompt = buildPrompt(offering, config["prompt"], lookups);
        offering.imageUrl= await generateImage(offering.prompt, config["generation"]);
        await generateAndSaveImage(offering, config, transaction);
    }
}

/**
 * Generates, downloads and saves the image locally. 
 * ⚠️  NOTE: Modifies the passed offering and sets filepath etc.
 * @param offering InOut!
 * @param config 
 */
async function generateAndSaveImage(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig,  transaction: Transaction) {
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

    const offeringImageForDB: Partial<domainTypes.OfferingImageView> = {
        offering_id: offering.offeringId,
        filepath: offering.filePath,
        explicit: false  // We generated the new imgage => It is NOT explicit.
      };
      
    const wio: domainTypes.WholesalerItemOffering = {
        // Pflichtfelder
        offering_id: offering.offeringId,
        wholesaler_id: offering.wholesalerId,
        category_id: offering.categoryId,
        product_def_id: offering.productDefId,
        
        // Gemappte Felder aus OfferingEnrichedView
        material_id: offering.finalMaterialId ?? null,
        form_id: offering.finalFormId ?? null,
        surface_finish_id: offering.finalSurfaceFinishId ?? null,
        construction_type_id: offering.finalConstructionTypeId ?? null,
        title: offering.offeringTitle ?? null,
        size: offering.offeringSize ?? null,
        dimensions: offering.offeringDimensions ?? null,
        packaging: offering.offeringPackaging ?? null,
        price: offering.offeringPrice ?? null,
        price_per_piece: offering.offeringPricePerPiece ?? null,
        weight_grams: offering.offeringWeightGrams ?? null,
        weight_range: offering.offeringWeightRange ?? null,
        package_weight: offering.offeringPackageWeight ?? null,
        origin: offering.offeringOrigin ?? null,
        comment: offering.offeringComment ?? null,
        imagePromptHint: offering.offeringImagePromptHint ?? null,
        quality: offering.offeringQuality ?? null,
        color_variant: offering.offeringColorVariant ?? null,
        wholesaler_price: offering.offeringWholesalerPrice ?? null,
        
        // Felder, die nicht in OfferingEnrichedView vorhanden sind
        sub_seller: null,
        wholesaler_article_number: null,
        currency: null,
        is_assortment: null,
        override_material: false, // Default-Wert
        shopify_product_id: null,
        shopify_variant_id: null,
        shopify_sku: null,
        shopify_price: null,
        shopify_synced_at: null,
        created_at: undefined, // Optional, kann undefined sein
      };
    await entityOperations.offeringImage.insertOfferingImageFromOffering(transaction, offeringImageForDB, wio);
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

