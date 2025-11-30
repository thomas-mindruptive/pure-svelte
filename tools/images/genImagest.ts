import { entityOperations, db as dbNS, transactionWrapper as transWRapperNS } from "@pure/svelte/backend-queries";
import { log as LogNS } from "@pure/svelte/utils";
import type { domainTypes } from "@pure/svelte/domain";
import { defaultConfig, loadOfferingOptions } from './generateMissingImages.config';
import { initLogFile, closeLogFile } from "./logAndReport";
import type { Transaction } from "mssql";

const offering = entityOperations.offering;
const image = entityOperations.image;
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
            offerings = await loadOfferings(transaction);
            images = await loadIamges(transaction);

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
 * Check and/or generated image(s) for offering.
 * @param offering 
 */
async function processOffering(offering: domainTypes.OfferingEnrichedView) {
    // Validate size range - fail fast on invalid data
    // E.g. "S-M"
    validateSizeRange(offering.offeringSize); // Will throw on invalid size
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
 * Start.
 */
(async () => await run())();

