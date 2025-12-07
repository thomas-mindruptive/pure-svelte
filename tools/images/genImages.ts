import { db as dbNS, entityOperations, transactionWrapper as transWRapperNS } from "@pure/svelte/backend-queries";
import { domainTypes, domainUtils } from "@pure/svelte/domain";
import { assertions, log as LogNS } from "@pure/svelte/utils";
import { type Transaction } from "mssql";
import * as path from "path";
import { generateImage } from "./falAiClient";
import { genAbsImgDirName, generateImageFilename } from "./fileUtils";
import { defaultConfig, type ImageGenerationConfig } from './generateMissingImages.config';
import type { Lookups, OfferingWithGenerationPlan } from "./imageGenTypes";
import { downloadAndSaveImage } from "./imageProcessor";
import { buildPromptFingerprintImageMapAndInitFingerprintCache, GLOBAL_IMAGE_CACHE, GLOBAL_PROMPT_FINGERPRINT_CACHE, loadLookups, loadOfferingImagesAndInitImageCache, loadOfferingsAndConvertToOfferingsWithGenerationPlan as loadOfferingsAndConvToOfferingsWithGenPlan } from "./loadData";
import { buildPrompt } from "./promptBuilder";
import { closeLogFile, initLogFile, logBoth, logBothHeader, printRunSummary } from "./logAndReport";

const log = LogNS.log;


/**
 * Entry point
 */
async function run() {
    log.infoHeader(`Begin image gen`);
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
            logBothHeader(`Loading offering images`);
            images = await loadOfferingImagesAndInitImageCache(transaction);
            log.info(`${images.length} images loaded and cached`);
            logBothHeader(`Build fingerprint map`);
            buildPromptFingerprintImageMapAndInitFingerprintCache(images);
            log.info(`${GLOBAL_PROMPT_FINGERPRINT_CACHE.size} images are in GLOBAL_PROMPT_FINGERPRINT_CACHE`);
            if (GLOBAL_PROMPT_FINGERPRINT_CACHE.size !== images.length) {
                throw new Error(`All images in DB should have prompt fingerprints because it is created during image.ts:insert/update. ` +
                    `=> GLOBAL_PROMPT_FINGERPRINT_CACHE.size should be same as images.lenght`);
            }
            logBothHeader(`Loading offerings`);
            offerings = await loadOfferingsAndConvToOfferingsWithGenPlan(transaction, images);
            log.info(`${offerings.size} offerings loaded`);
            const lookups = await loadLookups(transaction);
            logBothHeader(`Processing offerings`);
            for (const offering of offerings.values()) {
                await processOffering(offering, defaultConfig, lookups, transaction);
            }
            printRunSummary(Array.from(offerings.values()), defaultConfig);
            await closeLogFile();
            process.exit(0);

        } catch (e) {
            throw e;
        } finally {
            await transWRapperNS.rollbackTransaction(transaction);
        }
    }
    catch (e) {
        log.error(e);
        await closeLogFile();
        process.exit(0);
    }
}

/**
 * Check and/or generated image(s) for offering.
 * @param offering 
 */
async function processOffering(offering: OfferingWithGenerationPlan, config: ImageGenerationConfig, lookups: Lookups, transaction: Transaction) {
    assertions.assertDefined(offering, "offering");
    assertions.assertDefined(config, "config");

    // Validate size range - fail fast on invalid data
    // E.g. "S-M"
    validateSizeRange(offering); // Will throw on invalid size

    // Fail fast if fields are missing.
    validateOfferingFields(offering);

    if (0 === offering.images?.length) {
        logBoth(`Offering ${offering.offeringId} - ${offering.offeringTitle}: 0 === offering.images.length`);
        offering.images = [];
        offering.willGenerate = true;
        setTranslationsInto(offering, lookups);
        offering.prompt = buildPrompt(offering, config["prompt"], lookups);
        const image = await generateAndSaveImage(offering, config, transaction);
        offering.images.push(image);
        GLOBAL_IMAGE_CACHE.set(image.offering_image_id, image);
        assertions.assertDefined(image.prompt_fingerprint, "image.prompt_fingerprint");
        GLOBAL_PROMPT_FINGERPRINT_CACHE.set(image.prompt_fingerprint, image);
        offering.hasExcplicitImgs = false;
    } else {
        logBoth(`Offering ${offering.offeringId} - ${offering.offeringTitle}: ${offering.images?.length} === offering.images.length`);
        offering.hasExcplicitImgs = true;
    }
}

/**
 * Modifies the oassed offering by setting the translations for the lookups.
 * @param offering InOut!
 * @param lookups 
 */
function setTranslationsInto(offering: OfferingWithGenerationPlan, lookups: Lookups) {
    const productTypeEng = lookups.productTypesMapEN.get(offering.productTypeId!);
    assertions.assertDefined(productTypeEng, `English productTypeEng for ${offering.productTypeId} not found`);
    offering.productTypeEng = productTypeEng.name;

    const materialEng = lookups.materilasMapEN.get(offering.finalMaterialId!);
    assertions.assertDefined(materialEng, `English material for ${offering.finalMaterialId} not found`);
    offering.materialEng = materialEng.name;

    const formEng = lookups.formsMapEN.get(offering.finalFormId!);
    assertions.assertDefined(formEng, `English form for ${offering.finalMaterialId} not found`);
    offering.formEng = formEng.name;

    const constructionTypeEng = lookups.constructionTypesMapEN.get(offering.finalConstructionTypeId!);
    if (isNecklaceOrBracelet(offering)) {
        assertions.assertDefined(formEng, `English construction type for ${offering.finalMaterialId} not found`);
    }
    if (constructionTypeEng) {
        offering.constructionTypeEng = constructionTypeEng.name;
    }

    const surfaceFinishEng = lookups.surfaceFinishesMapEN.get(offering.finalSurfaceFinishId!);
    if (isNecklaceOrBracelet(offering)) {
        assertions.assertDefined(surfaceFinishEng, `English surface finish for ${offering.finalMaterialId} not found`);
    }
    if (surfaceFinishEng) {
        offering.surfaceFinishEng = surfaceFinishEng.name;
    }
}

/**
 * Generates, downloads and saves the image locally. 
 * ⚠️  NOTE: Modifies the passed offering and sets filepath etc.
 * @param offering InOut!
 * @param config 
 */
async function generateAndSaveImage(
    offering: OfferingWithGenerationPlan,
    config: ImageGenerationConfig,
    transaction: Transaction): Promise<domainTypes.OfferingImageView> {

    assertions.assertDefined(offering, "offering");
    assertions.assertDefined(offering.prompt, "offering.prompt");
    assertions.assertDefined(config, "config");

    // TODO!!!!!!!!!!!!!!!!!!!!!!!    Use GLOBAL_PROMPT_FINGERPRINT_CACHE to check if image with same properties already exists if  not explicit.

    if (config.generation.dry_run) {
        offering.imageUrl = "Dryrun";
    } else {
        offering.imageUrl = await generateImage(offering.prompt, config["generation"], config.prompt.negative_prompt);
    }


    // Download and save image
    const filename = generateImageFilename(offering);
    const absImgBaseDir = genAbsImgDirName(config.generation.image_directory, offering);
    let filepath = "DRY - " + path.join(absImgBaseDir, filename);
    filepath = await downloadAndSaveImage(offering.imageUrl, filename, absImgBaseDir, config.generation.dry_run);
    log.info(`Saved: ${filepath}`);
    offering.filePath = filepath;

    // Build image for DB.
    const offeringImageForDB: Partial<domainTypes.OfferingImageView> = {
        offering_id: offering.offeringId,
        filepath: offering.filePath,
        explicit: false  // We generated the new imgage => It is NOT explicit.
    };

    // Build offering from OfferingWithGenerationPlan. Why? Because we pass it directly to 
    // offeringImage.insertOfferingImageFromOffering instead of using offeringImage.insertOfferingImage, 
    // which would load offering from DB. Our img gen run hast all infos in memory => No need for DB load.
    const wio = domainUtils.wioFromWioCoalesced(offering);
    let offeringImage: domainTypes.OfferingImageView;
    if (!config.generation.dry_run) {
        offeringImage = await entityOperations.offeringImage.insertOfferingImageFromOffering(transaction, offeringImageForDB, wio);
    } else {
        // Dry-run: Pass productTypeId from OfferingWithGenerationPlan
        offeringImage = entityOperations.offeringImage.createInMemOfferingImage(wio, -1, filename, filepath, false, 0, offering.productTypeId!);
        offering.fingerPrint = offeringImage.prompt_fingerprint;
    }

    return offeringImage;
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
 * Validate offerings fields that are mandatory for img gen.
 * @param offering 
 */
export function validateOfferingFields(offering: OfferingWithGenerationPlan) {
    const offeringDescription = `${offering.offeringId} - ${offering.offeringTitle}`
    assertions.assertDefined(offering.productTypeName, `offering.productTypeName - ${offeringDescription}`)
    assertions.assertDefined(offering.finalFormName, `offering.finalFormName - ${offeringDescription}`)
    assertions.assertDefined(offering.finalMaterialName, `offering.finalMaterialName - ${offeringDescription}`)

    // "Semiprecious stone"/"Halbedelstein" is a placeholder. It must not be used as a material. 
    // The UX validations prevent it, but we must check it here, too.
    if (2 === offering.finalMaterialId) {  // "Semiprecious stone"/"Halbedelstein" is a placeholder. It must not be used as a material. 
        if (!(offering.offeringMaterialMixture && offering.offeringMaterialMixture.length > 0 &&
            offering.offeringMaterialMixtureEn && offering.offeringMaterialMixtureEn.length)) {
            throw new Error(`Offering ${offering.offeringId} materialId == 2 (Halbedelstein). This is a generic material. => Must specify offeringMaterialMixture AND offeringMaterialMixtureEn`);
        }
    }

    if (isNecklaceOrBracelet(offering)) {
        assertions.assertDefined(offering.finalConstructionTypeName, `offering.finalConstructionTypeName - ${offeringDescription}`);
        assertions.assertDefined(offering.finalSurfaceFinishName, `offering.finalSurfaceFinishName - ${offeringDescription}`);
    }
}

/**
 * Check if necklace or bracelet.
 * @param offering 
 * @returns 
 */
function isNecklaceOrBracelet(offering: OfferingWithGenerationPlan) {
    const is =
        (1 === offering.productTypeId   // Necklace
            || 2 === offering.productTypeId) // Bracelet
    return is;
}

/**
 * Start.
 */
(async () => await run())();



