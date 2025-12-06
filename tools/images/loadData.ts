import { entityOperations, generateMapFromData } from "@pure/svelte/backend-queries";
import type { domainTypes } from "@pure/svelte/domain";
import { assertions, log as LogNS } from "@pure/svelte/utils";
import type { Transaction } from "mssql";
import assert from "node:assert";
import { loadOfferingOptions, loadOfferingWhereConditions } from './generateMissingImages.config';
import type { Lookups, OfferingWithGenerationPlan } from "./imageGenTypes";
import { assertDefined } from "$lib/utils/assertions";

const offering = entityOperations.offering;
const image = entityOperations.image;
const offeringImage = entityOperations.offeringImage;
const log = LogNS.log;

/**
 * All image meta data is cached.
 * Initialialized in loadOfferingImagesAndInitImageCache.
 */
export let GLOBAL_IMAGE_CACHE: Map<number, domainTypes.OfferingImageView> = new Map();

/**
 * All prompt fingerprints are.
 * Initialialized in buildPromptFingerprintImageMapAndInitFingerprintCache.
 */
export let GLOBAL_PROMPT_FINGERPRINT_CACHE: Map<string, domainTypes.OfferingImageView> = new Map();

/**
 * Load all lookups needed for image generation.
 * @param transaction 
 * @returns 
 */
export async function loadLookups(transaction: Transaction): Promise<Lookups> {
    // Load base data (German)
    const productTypes = await entityOperations.productType.loadProductTypes(transaction);
    log.debug(`${productTypes.length} productTypes loaded`);
    const forms = await entityOperations.form.loadForms(transaction);
    log.debug(`${forms.length} forms loaded`);
    const materials = await entityOperations.material.loadMaterials(transaction);
    log.debug(`${materials.length} materials loaded`);
    const constructionTypes = await entityOperations.constructionType.loadConstructionTypes(transaction);
    log.debug(`${constructionTypes.length} constructionTypes loaded`);
    const surfaceFinishes = await entityOperations.surfaceFinish.loadSurfaceFinishes(transaction);
    log.debug(`${surfaceFinishes.length} surfaceFinishes loaded`);

    // Load English translations
    const productTypesEN = await entityOperations.productType.loadProductTypes(transaction, undefined, 'en');
    assert.strictEqual(productTypes.length, productTypesEN.length, `Forms (${productTypes.length}) and formsEN (${productTypesEN.length}) must have the same length`);
    const formsEN = await entityOperations.form.loadForms(transaction, undefined, 'en');
    assert.strictEqual(forms.length, formsEN.length, `Forms (${forms.length}) and formsEN (${formsEN.length}) must have the same length`);
    const materialsEN = await entityOperations.material.loadMaterials(transaction, undefined, 'en');
    assert.strictEqual(materials.length, materialsEN.length, `Materials (${materials.length}) and materialsEN (${materialsEN.length}) must have the same length`);
    const constructionTypesEN = await entityOperations.constructionType.loadConstructionTypes(transaction, undefined, 'en');
    assert.strictEqual(constructionTypes.length, constructionTypesEN.length, `ConstructionTypes (${constructionTypes.length}) and constructionTypesEN (${constructionTypesEN.length}) must have the same length`);
    const surfaceFinishesEN = await entityOperations.surfaceFinish.loadSurfaceFinishes(transaction, undefined, 'en');
    assert.strictEqual(surfaceFinishes.length, surfaceFinishesEN.length, `SurfaceFinishes (${surfaceFinishes.length}) and surfaceFinishesEN (${surfaceFinishesEN.length}) must have the same length`);

    // Generate maps
    const productTypesMap = entityOperations.productType.generateProductTypesMap(productTypes);
    const formsMap = entityOperations.form.generateFormsMap(forms);
    const materilasMap = entityOperations.material.generateMaterialsMap(materials);
    const constructionTypesMap = entityOperations.constructionType.generateConstructionTypesMap(constructionTypes);
    const surfaceFinishesMap = entityOperations.surfaceFinish.generateSurfaceFinishesMap(surfaceFinishes);

    // Generate English maps
    const productTypesMapEN = entityOperations.productType.generateProductTypesMap(productTypesEN);
    const formsMapEN = entityOperations.form.generateFormsMap(formsEN);
    const materilasMapEN = entityOperations.material.generateMaterialsMap(materialsEN);
    const constructionTypesMapEN = entityOperations.constructionType.generateConstructionTypesMap(constructionTypesEN);
    const surfaceFinishesMapEN = entityOperations.surfaceFinish.generateSurfaceFinishesMap(surfaceFinishesEN);

    return {
        productTypes,
        forms,
        materials,
        constructionTypes,
        surfaceFinishes,

        productTypesMap,
        formsMap,
        materilasMap,
        constructionTypesMap,
        surfaceFinishesMap,

        productTypesEN,
        formsEN,
        materialsEN,
        constructionTypesEN,
        surfaceFinishesEN,

        productTypesMapEN,
        formsMapEN,
        materilasMapEN,
        constructionTypesMapEN,
        surfaceFinishesMapEN
    };
}

/**
 * Load offerings with config options.
 */
export async function loadOfferings(transaction: Transaction): Promise<domainTypes.OfferingEnrichedView[]> {
    log.info(`Loading offerings with options: ${JSON.stringify(loadOfferingOptions)}`);
    // const offerings = await offering.loadOfferingsWithOptions(loadOfferingOptions, transaction);
    const offerings = await offering.loadOfferingsFromEnrichedView(transaction, loadOfferingWhereConditions);
    return offerings;
}

export async function loadOfferingImagesAndInitImageCache(transaction: Transaction): Promise<domainTypes.OfferingImageView[]> {
    log.info(`Loading offering images`);
    const images = await offeringImage.loadOfferingImages(transaction);
    GLOBAL_IMAGE_CACHE = generateMapFromData(images, (oi) => oi.offering_image_id);
    return images;
}

/**
 * Convert the offerings to OfferingWithGenerationPlan.
 * This will also set "offering.images" for each offering by checking 
 * offeringImages.offering_id = offering.offeringId.
 * While generating imgaes, we will update the global caches as well as each offering.images.
 * @param offerings 
 * @param offeringImages 
 * @returns A map of OfferingWithGenerationPlan
 */
export function transformOfferingsToOfferingsWithGenerationPlan(
    offerings: domainTypes.OfferingEnrichedView[],
    offeringImages: domainTypes.OfferingImageView[]): Map<number, OfferingWithGenerationPlan> {

    const offeringsWithGenerationPlanMap = new Map<number, OfferingWithGenerationPlan>();
    for (const offering of offerings) {
        const willGenerate = false;
        const offeringWithGenerationPlan: OfferingWithGenerationPlan = { ...offering, willGenerate };
        offeringsWithGenerationPlanMap.set(offering.offeringId, offeringWithGenerationPlan);
        const imagesForOffering = offeringImages.filter((img => img.offering_id === offering.offeringId));
        if (imagesForOffering.length > 0) {
            log.debug(`Found ${imagesForOffering.length} images for offering ${offering.offeringDimensions} - ${offering.offeringTitle}`);
        }
        offeringWithGenerationPlan.images = imagesForOffering;
    }
    return offeringsWithGenerationPlanMap;
}

/**
 * Load offerings and transform them to a map of OfferingWithGenerationPlan.
 * @param transaction 
 * @param offeringImages 
 * @returns 
 */
export async function loadOfferingsAndConvertToOfferingsWithGenerationPlan(transaction: Transaction, offeringImages: domainTypes.OfferingImageView[]): Promise<Map<number, OfferingWithGenerationPlan>> {
    const offerings = await loadOfferings(transaction);
    const offeringsWithGenerationPlan = transformOfferingsToOfferingsWithGenerationPlan(offerings, offeringImages);
    return offeringsWithGenerationPlan;
}

/**
 * Generate a map of promptFingerPrint => OfferingOfferingImageView and set it into GLOBAL_PROMPT_FINGERPRINT_CACHE
 * @param offeringImages 
 * @returns 
 */
export function buildPromptFingerprintImageMapAndInitFingerprintCache(offeringImages: domainTypes.OfferingImageView[]): Map<string, domainTypes.OfferingImageView> {
    assertions.assertDefined(offeringImages, "offeringImages"); 

    const fingerprintImageMap = new Map<string, domainTypes.OfferingImageView>();
    for(const oi of offeringImages) {
        assertDefined(oi.prompt_fingerprint, "oi.prompt_fingerprint");
        fingerprintImageMap.set(oi.prompt_fingerprint, oi);
    }
    GLOBAL_PROMPT_FINGERPRINT_CACHE = fingerprintImageMap;
    return fingerprintImageMap;
}

