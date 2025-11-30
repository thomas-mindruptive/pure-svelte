import { entityOperations, db as dbNS, transactionWrapper as transWRapperNS } from "@pure/svelte/backend-queries";
import { log as LogNS } from "@pure/svelte/utils";
import type { domainTypes } from "@pure/svelte/domain";
import { defaultConfig, loadOfferingOptions, type Lookups } from './generateMissingImages.config';
import { initLogFile, closeLogFile } from "./logAndReport";
import type { Transaction } from "mssql";
import assert from "node:assert";

const offering = entityOperations.offering;
const image = entityOperations.image;
const log = LogNS.log;

const GLOBAL_IMAGE_CACHE: Map<number, domainTypes.Image> = new Map();

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
            offerings = await loadOfferings(transaction);
            log.info(`${offerings.length} offerings loaded`);
            images = await loadIamges(transaction);
            // Populate global image cache
            for (const img of images) {
                GLOBAL_IMAGE_CACHE.set(img.image_id, img);
            }
            log.info(`${images.length} images loaded and cached`);
            const lookups = await loadLookups(transaction);
        } catch (e) {
            throw e;
        } finally {
            await transWRapperNS.rollbackTransaction(transaction);
        }

        for (const offering of offerings) {
            await processOffering(offering);
        }

        closeLogFile();
        process.exit(0);
    }
    catch (e) {
        log.error(e);
        closeLogFile();
        process.exit(0);
    }
}

/**
 * Load all lookups needed for image generation.
 * @param transaction 
 * @returns 
 */
async function loadLookups(transaction: Transaction): Promise<Lookups> {
    // Load base data (German)
    const forms = await entityOperations.form.loadForms(transaction);
    log.debug(`${forms.length} forms loaded`);
    const materials = await entityOperations.material.loadMaterials(transaction);
    log.debug(`${materials.length} materials loaded`);
    const constructionTypes = await entityOperations.constructionType.loadConstructionTypes(transaction);
    log.debug(`${constructionTypes.length} constructionTypes loaded`);
    const surfaceFinishes = await entityOperations.surfaceFinish.loadSurfaceFinishes(transaction);
    log.debug(`${surfaceFinishes.length} surfaceFinishes loaded`);

    // Load English translations
    const formsEN = await entityOperations.form.loadForms(transaction, undefined, 'en');
    assert.strictEqual(forms.length, formsEN.length, `Forms (${forms.length}) and formsEN (${formsEN.length}) must have the same length`);
    const materialsEN = await entityOperations.material.loadMaterials(transaction, undefined, 'en');
    assert.strictEqual(materials.length, materialsEN.length, `Materials (${materials.length}) and materialsEN (${materialsEN.length}) must have the same length`);
    const constructionTypesEN = await entityOperations.constructionType.loadConstructionTypes(transaction, undefined, 'en');
    assert.strictEqual(constructionTypes.length, constructionTypesEN.length, `ConstructionTypes (${constructionTypes.length}) and constructionTypesEN (${constructionTypesEN.length}) must have the same length`);
    const surfaceFinishesEN = await entityOperations.surfaceFinish.loadSurfaceFinishes(transaction, undefined, 'en');
    assert.strictEqual(surfaceFinishes.length, surfaceFinishesEN.length, `SurfaceFinishes (${surfaceFinishes.length}) and surfaceFinishesEN (${surfaceFinishesEN.length}) must have the same length`);

    // Generate maps
    const formsMap = entityOperations.form.generateFormsMap(forms);
    const materilasMap = entityOperations.material.generateMaterialsMap(materials);
    const constructionTypesMap = entityOperations.constructionType.generateConstructionTypesMap(constructionTypes);
    const surfaceFinishesMap = entityOperations.surfaceFinish.generateSurfaceFinishesMap(surfaceFinishes);

    // Generate English maps
    const formsMapEN = entityOperations.form.generateFormsMap(formsEN);
    const materilasMapEN = entityOperations.material.generateMaterialsMap(materialsEN);
    const constructionTypesMapEN = entityOperations.constructionType.generateConstructionTypesMap(constructionTypesEN);
    const surfaceFinishesMapEN = entityOperations.surfaceFinish.generateSurfaceFinishesMap(surfaceFinishesEN);

    return {
        forms,
        materials,
        constructionTypes,
        surfaceFinishes,
        formsMap,
        materilasMap,
        constructionTypesMap,
        surfaceFinishesMap,
        formsEN,
        materialsEN,
        constructionTypesEN,
        surfaceFinishesEN,
        formsMapEN,
        materilasMapEN,
        constructionTypesMapEN,
        surfaceFinishesMapEN
    };
}

/**
 * Check and/or generated image(s) for offering.
 * @param offering 
 */
async function processOffering(offering: domainTypes.OfferingEnrichedView) {
    // Validate size range - fail fast on invalid data
    // E.g. "S-M"
    validateSizeRange(offering); // Will throw on invalid size
}

/**
 * Load offerings with config options.
 */
async function loadOfferings(transaction: Transaction): Promise<domainTypes.OfferingEnrichedView[]> {
    log.info(`Loading offerings with options: ${JSON.stringify(loadOfferingOptions)}`);
    const offerings = await offering.loadOfferingsWithOptions(loadOfferingOptions, transaction);
    return offerings;
}

async function loadIamges(transaction: Transaction): Promise<domainTypes.Image[]> {
    log.info(`Loading images`);
    const images = await image.loadImages(transaction);
    return images;
}


/**
 * Ensure valid "offering.size".
 * @param size 
 * @returns 
 */
function validateSizeRange(offering: domainTypes.OfferingEnrichedView): string | null {
    const size= offering.offeringSize;
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

