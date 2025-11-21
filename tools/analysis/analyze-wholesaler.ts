import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 1. IMPORTS: Konfiguration & Interfaces
// Wichtig: In ESM TypeScript müssen lokale Imports die Endung .js haben
import {
    CSV_FILENAME,
    IMPORT_MARKUP,
    EU_ZONE,
    STRATEGY_MAP,
    type RawOffering,
    type AuditRow
} from './analyze-config.js';

// 2. IMPORTS: Report Builder & Output
import {
    buildAuditMarkdown,
    buildBestBuyMarkdown
} from './report-builder.js';

import {
    saveReportFile,
    printConsoleSummary
} from './output.js';
import { parseMoney } from './parser-utils.js';
import { parseCSV } from './parse-csv.js';
import { loadOfferingsFromEnrichedView } from '$lib/backendQueries/entityOperations/offering.js';
import { db } from '$lib/backendQueries/db.js';
import { rollbackTransaction } from '$lib/backendQueries/transactionWrapper.js';
import { log } from '$lib/utils/logger.js';
import type { OfferingEnrichedView } from '$lib/domain/domainTypes.js';

// Workaround für __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 3. NORMALIZED INTERFACE FOR TRANSFORMATION
// ==========================================

/**
 * Normalized offering interface used by the core transformation logic.
 * This interface represents offerings in a format ready for price/weight calculation,
 * regardless of whether they come from CSV (strings) or DB (typed numbers).
 * 
 * KEY DESIGN DECISION: We normalize both CSV and DB data to this common format,
 * allowing the core transformation logic to work identically for both data sources.
 */
interface NormalizedOffering {
    wholesalerName: string;
    wholesalerCountry: string | null;
    productTypeName: string;
    finalMaterialName: string | null; // NULL means neither offering nor product_def has material set
    finalFormName: string | null; // NULL means neither offering nor product_def has form set
    offeringTitle: string;
    offeringPrice: number; // Already parsed/typed (0 if missing)
    offeringWeightGrams: number | null; // Already parsed/typed (null if missing)
    offeringComment: string | null;
    offeringPackaging: string | null;
    offeringId: number; // Required for identifying problematic DB entries when material/form is missing
}

// ==========================================
// 4. ADAPTER FUNCTIONS
// ==========================================

/**
 * Normalizes RawOffering (from CSV) to NormalizedOffering format.
 * This adapter handles string-to-number conversion using parseMoney.
 * 
 * IMPORTANT: CSV data comes as strings, so we need to parse prices and weights.
 * The offeringId is parsed from the CSV column 'offeringId'.
 * 
 * @param row - Raw offering from CSV with string values
 * @returns Normalized offering with parsed numeric values
 */
function normalizeRawOffering(row: RawOffering): NormalizedOffering {
    // Parse string prices and weights to numbers
    // WICHTIG: parseMoney gibt 0 zurück wenn der Wert ungültig ist (z.B. Text im Preis-Feld)
    //          Dies deutet auf ein CSV-Parsing-Problem oder Datenqualitätsproblem hin
    const price = parseMoney(row.offeringPrice);
    
    // Warnung wenn Preis 0 ist aber ein Wert vorhanden war (dann war es wahrscheinlich Text)
    if (price === 0 && row.offeringPrice && row.offeringPrice !== 'NULL' && row.offeringPrice.trim().length > 0) {
        log.warn(`Invalid price value for offering "${row.offeringTitle}": "${row.offeringPrice}" - possible CSV parsing issue or data quality problem`);
    }
    
    const weightGramsStr = row.offeringWeightGrams;
    const weightGrams = (weightGramsStr && weightGramsStr !== 'NULL') 
        ? parseMoney(weightGramsStr) 
        : null;

    // Parse offeringId from CSV (required for identifying problematic entries)
    const offeringId = row.offeringId && row.offeringId !== 'NULL'
        ? parseInt(row.offeringId, 10) || 0
        : 0;

    return {
        wholesalerName: row.wholesalerName,
        wholesalerCountry: (row.wholesalerCountry && row.wholesalerCountry !== 'NULL') 
            ? row.wholesalerCountry 
            : null,
        productTypeName: row.productTypeName,
        finalMaterialName: row.finalMaterialName || null,
        finalFormName: row.finalFormName || null,
        offeringTitle: row.offeringTitle,
        offeringPrice: price,
        offeringWeightGrams: weightGrams,
        offeringComment: (row.offeringComment && row.offeringComment !== 'NULL') 
            ? row.offeringComment 
            : null,
        offeringPackaging: (row.offeringPackaging && row.offeringPackaging !== 'NULL') 
            ? row.offeringPackaging 
            : null,
        offeringId: offeringId,
    };
}

/**
 * Normalizes OfferingEnrichedView (from DB) to NormalizedOffering format.
 * This adapter directly uses typed values - no parsing needed!
 * 
 * IMPORTANT: DB data is already typed (numbers are numbers, not strings),
 * so we can use values directly without parsing.
 * 
 * @param row - Enriched offering from database with typed values
 * @returns Normalized offering ready for transformation
 */
function normalizeEnrichedView(row: OfferingEnrichedView): NormalizedOffering {
    return {
        wholesalerName: row.wholesalerName,
        wholesalerCountry: row.wholesalerCountry || null,
        productTypeName: row.productTypeName,
        finalMaterialName: row.finalMaterialName || null,
        finalFormName: row.finalFormName || null,
        offeringTitle: row.offeringTitle,
        offeringPrice: row.offeringPrice || 0, // Already a number
        offeringWeightGrams: row.offeringWeightGrams || null, // Already a number or null
        offeringComment: row.offeringComment || null,
        offeringPackaging: row.offeringPackaging || null,
        offeringId: row.offeringId, // Already a number from DB
    };
}

// ==========================================
// 5. CORE TRANSFORMATION LOGIC
// ==========================================

/**
 * Extracts weight in kg from a normalized offering.
 * Works with typed numeric values - no string parsing needed.
 * 
 * WEIGHT EXTRACTION PRIORITY (from highest to lowest):
 * 1. Explicit weight field (offeringWeightGrams column) - converted to kg
 * 2. Regex extraction from title/packaging text (e.g., "1.5 kg", "500 g")
 * 
 * WHY: Some vendors don't fill the weight column but mention it in the title.
 * We try to extract this automatically for better price comparisons.
 * 
 * @param row - Normalized offering with numeric weight
 * @returns Weight in kg and source information
 */
function extractWeightKgFromNormalized(row: NormalizedOffering): { weight: number | null, source: string } {
    // 1. Priority: Explicit weight field (already in grams, convert to kg)
    // WHY: Most reliable source - directly from vendor's structured data
    if (row.offeringWeightGrams !== null && row.offeringWeightGrams > 0) {
        return { weight: row.offeringWeightGrams / 1000, source: 'Column (g)' };
    }

    // 2. Priority: Text mining from title/packaging
    // WHY: Fallback when weight column is empty but weight is mentioned in text
    const textToScan = ((row.offeringTitle || '') + ' ' + (row.offeringPackaging || '')).toLowerCase();

    // Search for "1.5 kg" or "1,5 kg" patterns
    const kgMatch = textToScan.match(/(\d+[\.,]?\d*)\s*kg/);
    if (kgMatch) {
        return { 
            weight: parseFloat(kgMatch[1].replace(',', '.')), 
            source: 'Regex (Title/Pack kg)' 
        };
    }
    
    // Search for "500 g" patterns (boundary \b important to avoid matching "gold")
    // WHY: Sometimes weight is given in grams instead of kg
    const gMatch = textToScan.match(/(\d+)\s*g\b/); 
    if (gMatch) {
        return { 
            weight: parseFloat(gMatch[1]) / 1000, // Convert grams to kg
            source: 'Regex (Title/Pack g)' 
        };
    }

    return { weight: null, source: 'None' };
}

/**
 * Finds the best price by checking for bulk prices in comments.
 * Works with normalized offerings - comment is always a string.
 * 
 * BULK PRICE DETECTION STRATEGY:
 * 1. Scan comment field for price patterns (€/$ symbols with numbers)
 * 2. Accept prices that are:
 *    - Cheaper than list price (must be a discount)
 *    - At least 10% of list price (prevents false positives from typos or measurements like "0.5 cm")
 * 3. Return the lowest valid price found
 * 
 * WHY: Vendors often mention bulk prices or discounts in comments instead of
 * updating the main price field. We extract these to ensure accurate price comparisons.
 * 
 * REGEX ENHANCEMENT: Now recognizes:
 * - Prices with 2 decimals: "3.29", "2,99"
 * - Prices with 1 decimal: "5.0", "3,5"
 * - Whole numbers: "5", "10" (if followed by currency symbol or context)
 * - With currency symbols: "€3.29", "$2.99", "3.29 €"
 * 
 * @param row - Normalized offering with comment field
 * @param listPrice - Base list price from the offering
 * @returns Best price and source information
 */
function getBestPriceFromNormalized(row: NormalizedOffering, listPrice: number): { price: number, source: string, commentExcerpt?: string } {
    if (!row.offeringComment) {
        return { price: listPrice, source: 'List' };
    }

    // Enhanced regex: Matches prices with optional currency symbols and flexible decimal places
    // Pattern: [€$]?\s?(\d+[\.,]?\d{0,2})
    // - Optional currency symbol at start: [€$]?
    // - Optional whitespace
    // - Number with optional decimal: \d+[\.,]?\d{0,2}
    //   - \d+ = one or more digits
    //   - [\.,]? = optional decimal separator (comma or dot)
    //   - \d{0,2} = zero to two decimal places (allows "5", "5.0", "5.99")
    const matches = row.offeringComment.match(/[\$€]?\s?(\d+[\.,]?\d{0,2})/g);
    
    if (matches) {
        let lowest = listPrice;
        let lowestMatch: string | null = null;
        
        matches.forEach(m => {
            // Remove currency symbols and normalize decimal separator
            const val = parseFloat(m.replace(/[€$]/g, '').trim().replace(',', '.'));

            // Plausibility checks:
            // 1. Must be cheaper than list price (it's a discount/bulk price)
            // 2. Must be > 10% of list price (protects against:
            //    - Typos (e.g., "0.5 cm" mistaken as price)
            //    - Measurement units (e.g., "0.3 kg" mistaken as price)
            //    - Completely unrelated numbers)
            // WHY: We want realistic bulk prices, not measurement artifacts
            if (val < lowest && val > (listPrice * 0.1)) {
                lowest = val;
                lowestMatch = m.trim();
            }
        });

        if (lowest < listPrice && lowestMatch !== null) {
            // Extract relevant comment excerpt (max 50 chars around the match)
            // TypeScript knows lowestMatch is string here due to null check above
            const commentText = row.offeringComment; // TypeScript knows this is string from earlier check
            const matchIndex = commentText.indexOf(lowestMatch);
            const start = Math.max(0, matchIndex - 20);
            const end = Math.min(commentText.length, matchIndex + lowestMatch.length + 20);
            const excerpt = commentText.substring(start, end).trim();
            
            return { 
                price: lowest, 
                source: 'Bulk (Comment)',
                commentExcerpt: excerpt
            };
        }
    }
    return { price: listPrice, source: 'List' };
}

/**
 * Core transformation logic that converts normalized offerings to audit rows.
 * This function handles price calculation, markup application, weight extraction,
 * strategy selection, and normalization. It works with normalized data regardless
 * of whether it came from CSV or DB.
 * 
 * TRANSFORMATION PIPELINE:
 * A. Base Price Detection: Extract best price (list price or bulk price from comment)
 * B. Landed Cost Calculation: Apply import markup for non-EU countries
 * C. Weight & Strategy Selection: Determine if we should compare by weight (€/kg) or unit (€/Stk)
 * D. Normalization: Calculate final comparable price in consistent unit
 * 
 * @param normalizedOfferings - Array of normalized offerings ready for transformation
 * @returns Array of audit rows with calculated prices and normalized values
 */
function transformOfferingsToAuditRows(normalizedOfferings: NormalizedOffering[]): AuditRow[] {
    log.info(`Starting transformation of ${normalizedOfferings.length} offerings`);

    const auditData: AuditRow[] = normalizedOfferings
        // Filter: Remove pureEnergy entries (duplicates/own products)
        .filter(row => row.wholesalerName !== 'pureEnergy')
        .map((row, index) => {
            const trace: string[] = [];

            // ========================================
            // A. BASE PRICE DETECTION
            // ========================================
            // WHAT: Find the best price available (list price or bulk price from comment)
            // WHY: Vendors sometimes put better prices in comments instead of main price field
            log.debug(`Processing offering ${index + 1}: ${row.offeringTitle}`);
            const listPrice = row.offeringPrice;
            const priceInfo = getBestPriceFromNormalized(row, listPrice);

            if (priceInfo.source !== 'List') {
                trace.push(`💰 Bulk Found: ${priceInfo.price.toFixed(2)} (was ${listPrice.toFixed(2)})`);
                if (priceInfo.commentExcerpt) {
                    trace.push(`💬 Comment: "...${priceInfo.commentExcerpt}..."`);
                }
                log.debug(`Found bulk price: ${priceInfo.price} (source: ${priceInfo.source})`);
            }

            // ========================================
            // B. LANDED COST CALCULATION (Import Markup)
            // ========================================
            // WHAT: Apply import markup for non-EU countries
            // WHY: Non-EU imports require customs fees and handling costs
            //      We factor this into price comparison to get true landed cost
            const country = row.wholesalerCountry 
                ? row.wholesalerCountry.toUpperCase() 
                : 'UNKNOWN';

            const isEu = EU_ZONE.has(country);
            let markupPct = 0;
            let effectivePrice = priceInfo.price;

            if (isEu) {
                // EU zone: No import markup (free trade within EU)
                trace.push(`🌍 Origin: ${country} (EU - no markup)`);
                log.debug(`EU origin detected, no markup applied`);
            } else {
                // Non-EU: Apply import markup (e.g., +25% for customs + handling)
                // WHY: This ensures price comparison reflects true total cost
                markupPct = (IMPORT_MARKUP - 1) * 100; // Convert 1.25 to 25%
                effectivePrice = priceInfo.price * IMPORT_MARKUP;
                trace.push(`✈️ Origin: ${country} (+${markupPct.toFixed(0)}% Markup = ${effectivePrice.toFixed(2)})`);
                log.debug(`Non-EU origin, applying ${markupPct}% markup`);
            }

            // ========================================
            // C. WEIGHT EXTRACTION & STRATEGY SELECTION
            // ========================================
            // WHAT: Determine how to compare prices (by weight or by unit)
            // WHY: Different product types need different comparison methods:
            //      - Raw materials (stones, crystals): Compare per kg
            //      - Finished products (necklaces, pendants): Compare per piece
            const weightInfo = extractWeightKgFromNormalized(row);
            if (weightInfo.source !== 'None') {
                trace.push(`⚖️ Weight: ${weightInfo.weight}kg [${weightInfo.source}]`);
                log.debug(`Weight extracted: ${weightInfo.weight}kg (source: ${weightInfo.source})`);
            }

            let strategy: 'WEIGHT' | 'UNIT' = 'UNIT';
            // Strategy selection based on product type configuration
            const preset = STRATEGY_MAP[row.productTypeName] || 'AUTO';

            if (preset === 'WEIGHT') {
                // FORCE WEIGHT: Product type requires weight-based comparison
                // Example: "Wasserenergetisierer", "Handstein" - always compare per kg
                strategy = 'WEIGHT';
                trace.push(`⚙️ Strat: FORCE WEIGHT (${row.productTypeName} requires weight comparison)`);
            } else if (preset === 'UNIT') {
                // FORCE UNIT: Product type requires unit-based comparison
                // Example: "Halskette", "Anhänger" - always compare per piece
                strategy = 'UNIT';
                trace.push(`⚙️ Strat: FORCE UNIT (${row.productTypeName} requires unit comparison)`);
            } else {
                // AUTO Mode: Decide based on available data
                // WHY: Flexible handling when product type isn't explicitly configured
                if (weightInfo.weight !== null) {
                    // Weight found: Use weight-based comparison (more accurate for materials)
                    strategy = 'WEIGHT';
                    trace.push(`⚙️ Strat: AUTO -> WEIGHT (Weight found in data)`);
                } else {
                    // No weight: Use unit-based comparison (fallback)
                    strategy = 'UNIT';
                    trace.push(`⚙️ Strat: AUTO -> UNIT (No weight data available)`);
                }
            }

            // ========================================
            // D. NORMALIZATION (Final Comparable Price)
            // ========================================
            // WHAT: Calculate final price in consistent unit (€/kg or €/Stk)
            // WHY: Enables fair comparison across different vendors and packaging
            let finalNormalizedPrice = 0;
            let unitLabel: AuditRow['Unit'] = '€/Stk';

            if (strategy === 'WEIGHT') {
                // Weight-based normalization: Price per kilogram
                // FORMULA: effectivePrice / weightInKg = price per kg
                // WHY: Allows comparing different package sizes fairly
                if (weightInfo.weight && weightInfo.weight > 0) {
                    finalNormalizedPrice = effectivePrice / weightInfo.weight;
                    unitLabel = '€/kg';
                } else {
                    // ERROR: Strategy requires weight but none found
                    // WHY: Penalty price ensures these entries are clearly marked as problematic
                    finalNormalizedPrice = 999999; // High penalty price
                    unitLabel = 'ERR';
                    trace.push(`❌ ERROR: Strategy is WEIGHT but no weight found!`);
                    log.warn(`Weight strategy selected but no weight found for offering: ${row.offeringTitle}`);
                }
            } else {
                // Unit-based normalization: Price per piece
                // WHY: Standard comparison for finished products where each piece is comparable
                finalNormalizedPrice = effectivePrice;
                unitLabel = '€/Stk';
            }

            // ========================================
            // E. GROUP KEY GENERATION
            // ========================================
            // WHAT: Create grouping key for price comparison (ProductType > Material > Form)
            // WHY: Groups comparable products together for fair price comparison
            // 
            // NULL HANDLING: If material/form is missing (NULL in DB),
            // show descriptive message with offering ID so the data issue can be quickly fixed
            const materialDisplay = row.finalMaterialName 
                ? row.finalMaterialName 
                : `<no material in product def and offering>[ID:${row.offeringId}]`;
            
            const formDisplay = row.finalFormName 
                ? row.finalFormName 
                : `<no form in product def and offering>[ID:${row.offeringId}]`;

            // Build result object
            return {
                Row_ID: (index + 1).toString(),
                Group_Key: `${row.productTypeName} > ${materialDisplay} > ${formDisplay}`,
                Wholesaler: row.wholesalerName,
                Origin_Country: country,
                Product_Title: (row.offeringTitle || 'NULL').substring(0, 50), // Truncate for readability

                Raw_Price_List: listPrice,
                Raw_Weight_Input: row.offeringWeightGrams !== null 
                    ? String(row.offeringWeightGrams) 
                    : '-',

                Detected_Bulk_Price: priceInfo.price,
                Detected_Weight_Kg: weightInfo.weight,
                Applied_Markup_Pct: markupPct,

                Final_Normalized_Price: parseFloat(finalNormalizedPrice.toFixed(2)),
                Unit: unitLabel,

                Calculation_Trace: trace.join(' | ')
            };
        });

    log.info(`Transformation complete: ${auditData.length} audit rows generated`);
    return auditData;
}

// ==========================================
// 6. REPORT GENERATION LOGIC
// ==========================================

/**
 * Generates and saves audit reports from sorted audit data.
 * 
 * WHAT: Creates two markdown reports:
 * 1. audit_log.md: Detailed flat table with all offerings and calculation traces
 * 2. best_buy_report.md: Grouped report showing best prices per product group
 * 
 * @param sortedData - Audit rows sorted by group and price
 */
function generateReports(sortedData: AuditRow[]): void {
    log.info(`Generating reports from ${sortedData.length} audit rows`);

    // Build reports using builder pattern
    const auditMarkdown = buildAuditMarkdown(sortedData);
    const bestBuyMarkdown = buildBestBuyMarkdown(sortedData);

    log.info('Reports generated, saving files...');

    // Print console summary
    printConsoleSummary(sortedData);

    // Save report files
    saveReportFile('audit_log.md', auditMarkdown);
    saveReportFile('best_buy_report.md', bestBuyMarkdown);

    log.info('Reports saved successfully');
}

// ==========================================
// 7. MAIN FUNCTIONS (ENTRY POINTS)
// ==========================================

/**
 * Entry point for CSV-based audit table creation.
 * Reads CSV file, parses it, normalizes data, transforms to audit rows, and generates reports.
 * 
 * USAGE: Useful for offline analysis or when DB access is not available.
 */
function createAuditTableFromCsv() {
    log.info('Starting audit table creation from CSV');
    
    const filePath = path.isAbsolute(CSV_FILENAME)
        ? CSV_FILENAME
        : path.join(__dirname, CSV_FILENAME);

    if (!fs.existsSync(filePath)) {
        log.error(`CSV file not found: ${filePath}`);
        process.exit(1);
    }

    log.info(`Reading CSV file: ${filePath}`);
    
    // Read and parse CSV data
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rawData = parseCSV(fileContent);
    log.info(`Read ${rawData.length} rows from CSV`);

    if (rawData.length === 0) {
        log.warn('No data found in CSV file');
        return;
    }

    // Process data using the refactored function
    createAuditTable(rawData);
}

/**
 * Entry point for database-based audit table creation.
 * Loads offerings from enriched view, normalizes data, transforms to audit rows, and generates reports.
 * 
 * USAGE: Preferred method - uses live data from database with proper typing.
 */
async function createAuditTableFromDb() {
    log.info('Starting audit table creation from database');
    
    const pool = await db;
    const transaction = pool.transaction();
    let transactionCommitted = false;
    
    try {
        await transaction.begin();
        log.info('Loading enriched offerings from database...');
        
        // Load all data from the enriched view
        // WHY: view_offerings_enriched contains merged data (offering + product_def)
        //      with COALESCE logic for material/form inheritance
        const rows = await loadOfferingsFromEnrichedView(transaction);
        log.info(`Loaded ${rows.length} rows from database`);

        if (rows.length === 0) {
            log.warn('No data found in database');
            await transaction.rollback();
            return;
        }

        await transaction.commit();
        transactionCommitted = true;
        log.info('Transaction committed successfully');

        // Process data using the new function (outside of transaction context)
        // WHY: Data processing doesn't need to be inside transaction - data is already loaded
        createAuditTableFromEnrichedView(rows);
    } catch (error) {
        log.error('Error loading data from database', { error });
        // Only rollback if transaction hasn't been committed
        // WHY: Prevent rollback errors when transaction was already committed
        if (!transactionCommitted) {
            try {
                await rollbackTransaction(transaction);
            } catch (rollbackError) {
                log.error('Error during rollback', { rollbackError });
            }
        }
        process.exit(1);
    } finally {
        // Close database connection pool to allow Node.js process to exit
        // WHY: The connection pool keeps the process alive - we need to close it explicitly
        //      for scripts that should exit after completion
        try {
            await pool.close();
            log.info('Database connection pool closed');
        } catch (closeError) {
            log.warn('Error closing connection pool', { closeError });
        }
    }
}

/**
 * Creates audit table from RawOffering array (CSV path).
 * This function normalizes CSV data (strings) to NormalizedOffering format,
 * then uses the core transformation logic.
 * 
 * PIPELINE: CSV strings → Normalized → Transformed → Sorted → Reports
 * 
 * @param rawData - Array of raw offerings from CSV with string values
 */
function createAuditTable(rawData: RawOffering[]) {
    log.info(`Starting transformation of ${rawData.length} raw offerings from CSV`);
    
    // Normalize CSV data (string-to-number conversion)
    // WHY: CSV provides strings, but calculations need numbers
    const normalizedOfferings = rawData.map(normalizeRawOffering);
    log.info(`Normalized ${normalizedOfferings.length} offerings`);

    // Transform to audit rows using core logic
    const auditData = transformOfferingsToAuditRows(normalizedOfferings);

    // Sort by group key, then by normalized price (ascending)
    // WHY: Groups comparable products together, cheapest first for easy identification
    log.info('Sorting audit data by group and price');
    const sortedData = auditData.sort((a, b) => {
        if (a.Group_Key < b.Group_Key) return -1;
        if (a.Group_Key > b.Group_Key) return 1;
        return a.Final_Normalized_Price - b.Final_Normalized_Price;
    });

    // Generate and save reports
    generateReports(sortedData);
}

/**
 * Creates audit table from OfferingEnrichedView array (DB path).
 * This function normalizes DB data (already typed numbers) to NormalizedOffering format,
 * then uses the core transformation logic. No string parsing needed!
 * 
 * PIPELINE: DB typed data → Normalized → Transformed → Sorted → Reports
 * 
 * @param enrichedData - Array of enriched offerings from database with typed values
 */
function createAuditTableFromEnrichedView(enrichedData: OfferingEnrichedView[]) {
    log.info(`Starting transformation of ${enrichedData.length} enriched offerings from database`);
    
    // Normalize DB data (direct use, no parsing needed)
    // WHY: DB already provides typed numbers, no string conversion required
    const normalizedOfferings = enrichedData.map(normalizeEnrichedView);
    log.info(`Normalized ${normalizedOfferings.length} offerings (no parsing required)`);

    // Transform to audit rows using core logic
    const auditData = transformOfferingsToAuditRows(normalizedOfferings);

    // Sort by group key, then by normalized price (ascending)
    // WHY: Groups comparable products together, cheapest first for easy identification
    log.info('Sorting audit data by group and price');
    const sortedData = auditData.sort((a, b) => {
        if (a.Group_Key < b.Group_Key) return -1;
        if (a.Group_Key > b.Group_Key) return 1;
        return a.Final_Normalized_Price - b.Final_Normalized_Price;
    });

    // Generate and save reports
    generateReports(sortedData);
}

// Script entry point
// WHY: Execute async function and handle exit properly
//      If CSV mode is needed, uncomment createAuditTableFromCsv() and comment createAuditTableFromDb()
(async () => {
    try {
        // createAuditTableFromCsv(); // Uncomment for CSV mode
        await createAuditTableFromDb();
        
        // Explicit exit after successful completion
        // WHY: Ensures Node.js process terminates even if connection pool doesn't close immediately
        log.info('Analysis complete, exiting...');
        process.exit(0);
    } catch (error) {
        log.error('Fatal error in analysis script', { error });
        process.exit(1);
    }
})();

