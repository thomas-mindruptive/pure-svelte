import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 1. IMPORTS: Konfiguration & Interfaces
import {
    CSV_FILENAME,
    IMPORT_MARKUP,
    EU_ZONE,
    STRATEGY_MAP,
    type RawOffering,
    type ReportRow,
    analysisOptions
} from './analyze-config.js';

// 2. IMPORTS: Report Builder & Output
import { ReportBuilder } from './md-report-builder.js';

import {
    saveReportFile,
    printConsoleSummary
} from './output.js';
import {
    parseMoney,
    extractDimensions,
    validatePackageWeight
} from './parser-utils.js';
import {
    calculateWeightFromDimensions
} from './geometry-utils.js';
import { parseCSV } from './parse-csv.js';
import { buildOfferingsWhereCondition, loadOfferingsFromEnrichedView, type LoadOfferingsOptions } from '$lib/backendQueries/entityOperations/offering.js';
import { db } from '$lib/backendQueries/db.js';
import { rollbackTransaction } from '$lib/backendQueries/transactionWrapper.js';
import { log } from '$lib/utils/logger.js';
import type { OfferingEnrichedView } from '$lib/domain/domainTypes.js';
import { ComparisonOperator, LogicalOperator } from '$lib/backendQueries/queryGrammar.js';
import type { WhereCondition, WhereConditionGroup } from '$lib/backendQueries/queryGrammar.js';

// Workaround für __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 3. NORMALIZED INTERFACE FOR TRANSFORMATION
// ==========================================

interface NormalizedOffering {
    wholesalerName: string;
    wholesalerId: number;
    wholesalerRelevance: string | null;
    wholesalerCountry: string | null;
    productTypeName: string;
    finalMaterialName: string | null;
    finalFormName: string | null;
    offeringTitle: string;
    offeringPrice: number;
    offeringPricePerPiece: number | null;
    offeringWeightGrams: number | null;
    offeringComment: string | null;
    offeringPackaging: string | null;
    offeringDimensions: string | null;
    offeringWeightRange: string | null;
    offeringPackageWeight: string | null;
    offeringId: number;
}

// ==========================================
// 4. ADAPTER FUNCTIONS
// ==========================================

function normalizeRawOffering(row: RawOffering): NormalizedOffering {
    const price = parseMoney(row.offeringPrice);

    if (price === 0 && row.offeringPrice && row.offeringPrice !== 'NULL' && row.offeringPrice.trim().length > 0) {
        log.warn(`Invalid price value for offering "${row.offeringTitle}": "${row.offeringPrice}" - possible CSV parsing issue or data quality problem`);
    }

    const pricePerPieceStr = row.offeringPricePerPiece;
    const pricePerPiece = (pricePerPieceStr && pricePerPieceStr !== 'NULL')
        ? parseMoney(pricePerPieceStr)
        : null;

    const weightGramsStr = row.offeringWeightGrams;
    const weightGrams = (weightGramsStr && weightGramsStr !== 'NULL')
        ? parseMoney(weightGramsStr)
        : null;

    const offeringId = row.offeringId && row.offeringId !== 'NULL'
        ? parseInt(row.offeringId, 10) || 0
        : 0;

    const wholesalerId = row.wholesalerId && row.wholesalerId !== 'NULL'
        ? parseInt(row.wholesalerId, 10) || 0
        : 0;

    return {
        wholesalerName: row.wholesalerName,
        wholesalerId: wholesalerId,
        wholesalerRelevance: (row.wholesalerRelevance && row.wholesalerRelevance !== 'NULL')
            ? row.wholesalerRelevance
            : null,
        wholesalerCountry: (row.wholesalerCountry && row.wholesalerCountry !== 'NULL')
            ? row.wholesalerCountry
            : null,
        productTypeName: row.productTypeName,
        finalMaterialName: row.finalMaterialName || null,
        finalFormName: row.finalFormName || null,
        offeringTitle: row.offeringTitle,
        offeringPrice: price,
        offeringPricePerPiece: pricePerPiece,
        offeringWeightGrams: weightGrams,
        offeringComment: (row.offeringComment && row.offeringComment !== 'NULL')
            ? row.offeringComment
            : null,
        offeringPackaging: (row.offeringPackaging && row.offeringPackaging !== 'NULL')
            ? row.offeringPackaging
            : null,
        offeringDimensions: (row.offeringDimensions && row.offeringDimensions !== 'NULL')
            ? row.offeringDimensions
            : null,
        offeringWeightRange: (row.offeringWeightRange && row.offeringWeightRange !== 'NULL')
            ? row.offeringWeightRange
            : null,
        offeringPackageWeight: (row.offeringPackageWeight && row.offeringPackageWeight !== 'NULL')
            ? row.offeringPackageWeight
            : null,
        offeringId: offeringId,
    };
}

function normalizeEnrichedView(row: OfferingEnrichedView): NormalizedOffering {
    return {
        wholesalerName: row.wholesalerName,
        wholesalerId: row.wholesalerId,
        wholesalerRelevance: row.wholesalerRelevance || null,
        wholesalerCountry: row.wholesalerCountry || null,
        productTypeName: row.productTypeName,
        finalMaterialName: row.finalMaterialName || null,
        finalFormName: row.finalFormName || null,
        offeringTitle: row.offeringTitle,
        offeringPrice: row.offeringPrice || 0,
        offeringPricePerPiece: row.offeringPricePerPiece ?? null,
        offeringWeightGrams: row.offeringWeightGrams || null,
        offeringComment: row.offeringComment || null,
        offeringPackaging: row.offeringPackaging || null,
        offeringDimensions: row.offeringDimensions || null,
        offeringWeightRange: row.offeringWeightRange || null,
        offeringPackageWeight: row.offeringPackageWeight || null,
        offeringId: row.offeringId,
    };
}

// ==========================================
// 5. CORE TRANSFORMATION LOGIC
// ==========================================

/**
 * Extracts the best (lowest) price from an offering by searching for bulk prices in the comment field.
 * 
 * WHY: Many wholesalers include volume discount prices in comments like "ab 10 Stk: 3.50€".
 * This function parses these to find the actual best available price.
 * 
 * VALIDATION: Found prices must be:
 * - Lower than the list price (otherwise it's not a discount)
 * - At least 10% of list price (to filter out false positives like quantities)
 * 
 * @param row - The normalized offering with comment field
 * @param listPrice - The official list price to compare against
 * @param reportBuilder - Optional builder for adding legend entries
 * @returns Object with best price, source indicator, and optional excerpt from comment
 */
export function getBestPriceFromNormalized(row: NormalizedOffering, listPrice: number, reportBuilder?: ReportBuilder): { price: number, source: string, commentExcerpt?: string } {
    if (reportBuilder && !reportBuilder['legendEntries'].has('Preis (Norm.)_Bulk')) {
        reportBuilder.addToLegend(
            'Preis (Norm.)_Bulk',
            'Bulk-Preis aus Comment-Feld extrahiert',
            'Regex-Pattern `[€$]?\\s?(\\d+[\\.,]?\\d{0,2})` durchsucht Comment nach Preisen. Niedrigster gültiger Preis (muss < Listenpreis und > 10% des Listenpreises sein) wird verwendet. Quelle: `offeringComment` Feld aus Datenbank/CSV'
        );
    }

    if (!row.offeringComment) {
        return { price: listPrice, source: 'List' };
    }

    const matches = row.offeringComment.match(/[\$€]?\s?(\d+[\.,]?\d{0,2})/g);

    if (matches) {
        let lowest = listPrice;
        let lowestMatch: string | null = null;

        matches.forEach(m => {
            const val = parseFloat(m.replace(/[€$]/g, '').trim().replace(',', '.'));
            if (val < lowest && val > (listPrice * 0.1)) {
                lowest = val;
                lowestMatch = m.trim();
            }
        });

        if (lowest < listPrice && lowestMatch !== null) {
            const commentText = row.offeringComment!;
            const matchString: string = lowestMatch;
            const matchIndex = commentText.indexOf(matchString);
            const matchLength = matchString.length;
            const start = Math.max(0, matchIndex - 20);
            const end = Math.min(commentText.length, matchIndex + matchLength + 20);
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
 * Determines the effective weight in kg using a priority-based cascade of sources.
 * 
 * PRIORITY ORDER (first match wins):
 * 1. BULK - Bulk packaging weight (e.g., "1kg" in packaging field) - most reliable for bulk orders
 * 2. EXACT - Explicit weight field (offeringWeightGrams) - direct measurement from supplier
 * 3. RANGE - Weight range field average (e.g., "30-50g" → 40g) - supplier estimate
 * 4. CALC - Geometric calculation from dimensions × form factor × density - computed estimate
 * 
 * WHY CASCADE: Different data sources have different reliability. Bulk packaging is most
 * reliable because it's what you actually receive. Geometric calculation is least reliable
 * as it involves assumptions about shape and material density.
 * 
 * @param row - The normalized offering with weight/dimension data
 * @returns Object with weight in kg, source description, calculation method, and tooltip
 */
function determineEffectiveWeight(row: NormalizedOffering): {
    weightKg: number | null,
    source: string,
    method: ReportRow['Calculation_Method'],
    tooltip: string,
    warning?: string
} {
    // 1. Bulk Packaging Check
    const pkgCheck = validatePackageWeight(row.offeringPackaging, row.offeringPackageWeight);
    if (pkgCheck.packageWeightDisplay && pkgCheck.packageWeightDisplay.toLowerCase().includes('kg')) {
        const val = parseFloat(pkgCheck.packageWeightDisplay.replace('kg', '').trim());
        if (!isNaN(val)) {
            return {
                weightKg: val,
                source: `Bulk Pkg (${pkgCheck.packageWeightDisplay})`,
                method: 'BULK',
                tooltip: `Strategie: WEIGHT. Quelle: Bulk-Verpackung '${pkgCheck.packageWeightDisplay}'.`
            };
        }
    }

    // 2. Explicit Weight Field
    if (row.offeringWeightGrams && row.offeringWeightGrams > 0) {
        const kg = row.offeringWeightGrams / 1000;
        return {
            weightKg: kg,
            source: 'Weight Field',
            method: 'EXACT',
            tooltip: `Strategie: WEIGHT. Quelle: Feld 'offeringWeightGrams' (${row.offeringWeightGrams}g).`
        };
    }

    // 3. Weight Range Field (Average)
    if (row.offeringWeightRange) {
        // Simple regex for range like "30-50g" or "30 - 50 g"
        const matches = row.offeringWeightRange.match(/(\d+[\.,]?\d*)\s*[-–]\s*(\d+[\.,]?\d*)/);
        if (matches && matches.length === 3) {
            const min = parseFloat(matches[1].replace(',', '.'));
            const max = parseFloat(matches[2].replace(',', '.'));
            if (!isNaN(min) && !isNaN(max)) {
                const avgGrams = (min + max) / 2;
                return {
                    weightKg: avgGrams / 1000,
                    source: `Range Avg (${row.offeringWeightRange})`,
                    method: 'RANGE',
                    tooltip: `Strategie: WEIGHT. Quelle: Mittelwert aus Range '${row.offeringWeightRange}' (${avgGrams}g).`
                };
            }
        }
        // Check if single value in range field
        const singleMatch = row.offeringWeightRange.match(/(\d+[\.,]?\d*)\s*g/i);
        if (singleMatch && singleMatch.length === 2) {
            const grams = parseFloat(singleMatch[1].replace(',', '.'));
            if (!isNaN(grams)) {
                return {
                    weightKg: grams / 1000,
                    source: `Range Single (${row.offeringWeightRange})`,
                    method: 'RANGE',
                    tooltip: `Strategie: WEIGHT. Quelle: Einzelwert aus Range '${row.offeringWeightRange}' (${grams}g).`
                };
            }
        }
    }

    // 4. Geometric Calculation
    if (row.offeringDimensions) {
        const calcResult = calculateWeightFromDimensions(
            row.offeringDimensions,
            row.finalMaterialName || '',
            row.finalFormName || ''
        );

        if (calcResult) {
            return {
                weightKg: calcResult.weightGrams / 1000,
                source: 'Calculated',
                method: 'CALC',
                tooltip: `Strategie: WEIGHT (Kalkuliert). ${calcResult.trace}`
            };
        }
    }

    return { weightKg: null, source: 'None', method: 'ERR', tooltip: 'Kein Gewicht ermittelbar.' };
}

/**
 * Transforms normalized offerings into report rows with calculated normalized prices.
 * 
 * This is the MAIN TRANSFORMATION PIPELINE that:
 * 1. Filters offerings (excludes internal suppliers, applies relevance filters)
 * 2. Detects bulk prices from comments
 * 3. Applies import markup for non-EU countries (+25%)
 * 4. Determines pricing strategy (WEIGHT vs UNIT based on product type)
 * 5. Calculates normalized price (€/kg or €/Stk) for comparison
 * 
 * The resulting ReportRow contains all data needed for the comparison reports,
 * including a trace of how the price was calculated for transparency.
 * 
 * @param normalizedOfferings - Array of offerings in normalized format
 * @param reportBuilder - Optional builder for collecting legend entries
 * @param options - Filter options (excluded IDs, allowed relevances)
 * @returns Array of report rows ready for grouping and ranking
 */
export function transformOfferingsToAuditRows(normalizedOfferings: NormalizedOffering[],
    reportBuilder?: ReportBuilder,
    options?: LoadOfferingsOptions): ReportRow[] {
    log.info(`Starting transformation of ${normalizedOfferings.length} offerings`);

    const auditData: ReportRow[] = normalizedOfferings
        .filter(row => {
            // Filter out internal supplier by name (legacy check for backwards compatibility)
            if (row.wholesalerName === 'pureEnergy') return false;
            // Filter out by ID (primary exclusion mechanism)
            if (row.wholesalerId > 0 && options?.excludedWholesalerIds?.includes(row.wholesalerId)) return false;
            // Filter by relevance level (only include high/medium relevance suppliers)
            if ((options?.allowedWholesalerRelevances?.length ?? 0) > 0) {
                if (!row.wholesalerRelevance || !options?.allowedWholesalerRelevances?.includes(row.wholesalerRelevance)) {
                    return false;
                }
            }
            return true;
        })
        .map((row, index) => {
            // Trace collects human-readable steps for debugging and tooltips
            const trace: string[] = [];

            // ========================================
            // STEP A: BASE PRICE DETECTION
            // Search for bulk/volume discounts in comment field
            // ========================================
            log.debug(`Processing offering ${index + 1}: ${row.offeringTitle}`);
            const listPrice = row.offeringPrice;
            const priceInfo = getBestPriceFromNormalized(row, listPrice, reportBuilder);

            if (priceInfo.source !== 'List') {
                trace.push(`💰 Bulk Found: ${priceInfo.price.toFixed(2)} (was ${listPrice.toFixed(2)})`);
                if (priceInfo.commentExcerpt) {
                    trace.push(`💬 Comment: "...${priceInfo.commentExcerpt}..."`);
                }
                log.debug(`Found bulk price: ${priceInfo.price} (source: ${priceInfo.source})`);
            }

            // ========================================
            // STEP B: LANDED COST CALCULATION
            // Apply import markup for non-EU countries (customs, shipping, risk)
            // ========================================
            const country = row.wholesalerCountry ? row.wholesalerCountry.toUpperCase() : 'UNKNOWN';
            if (reportBuilder && !reportBuilder['legendEntries'].has('Herkunft')) {
                reportBuilder.addToLegend(
                    'Herkunft',
                    'Herkunftsland (Wholesaler Country)',
                    'Aus `wholesalerCountry` Feld. Wenn fehlend: zeigt "UNKNOWN". Nicht-EU-Länder bekommen Import-Markup (+25%) angewendet. Quelle: Datenbank/CSV Feld `wholesalerCountry`'
                );
            }

            const isEu = EU_ZONE.has(country);
            let markupPct = 0;
            let effectivePrice = priceInfo.price;

            if (isEu) {
                trace.push(`🌍 Origin: ${country} (EU - no markup)`);
            } else {
                markupPct = (IMPORT_MARKUP - 1) * 100;
                effectivePrice = priceInfo.price * IMPORT_MARKUP;
                trace.push(`✈️ Origin: ${country} (+${markupPct.toFixed(0)}% Markup = ${effectivePrice.toFixed(2)})`);
            }

            if (reportBuilder && !reportBuilder['legendEntries'].has('Preis (Norm.)_Import')) {
                reportBuilder.addToLegend(
                    'Preis (Norm.)_Import',
                    'Effektiver Preis nach Import-Markup für Nicht-EU-Länder',
                    `Wenn Land NICHT in EU-Zone: \`price * 1.25\` (+25% Markup). EU-Länder (DE, AT, NL, etc.): kein Markup. Quelle: Bulk-Preis oder Listenpreis aus vorherigem Schritt`
                );
            }

            // ========================================
            // STEP C: STRATEGY & WEIGHT DETERMINATION
            // Choose pricing strategy based on product type:
            // - WEIGHT: Compare by €/kg (raw stones, bulk materials)
            // - UNIT: Compare by €/Stk (jewelry, pendants, necklaces)
            // - AUTO: Use WEIGHT if weight data available, else UNIT
            // ========================================
            const dimensionsInfo = extractDimensions(row); // Extract dimensions for display

            // Validate and display package weight if available
            const packageWeightInfo = validatePackageWeight(row.offeringPackaging, row.offeringPackageWeight);
            if (packageWeightInfo.packageWeightDisplay) {
                trace.push(`📦 Package Weight: ${packageWeightInfo.packageWeightDisplay} [Field]`);
            }

            // Determine pricing strategy from STRATEGY_MAP or use AUTO
            let strategy: 'WEIGHT' | 'UNIT' = 'UNIT';
            const preset = STRATEGY_MAP[row.productTypeName] || 'AUTO';

            if (preset === 'WEIGHT') strategy = 'WEIGHT';
            else if (preset === 'UNIT') strategy = 'UNIT';
            else {
                // AUTO mode: Prefer WEIGHT-based pricing if weight data is available,
                // as it enables better comparison across different package sizes
                const weightCheck = determineEffectiveWeight(row);
                if (weightCheck.weightKg !== null) strategy = 'WEIGHT';
                else strategy = 'UNIT';
            }

            let finalNormalizedPrice = 0;
            let unitLabel: ReportRow['Unit'] = '€/Stk';
            let calcMethod: ReportRow['Calculation_Method'] = 'UNIT';
            let calcTooltip = '';

            // ========================================
            // STEP D: FINAL PRICE NORMALIZATION
            // Calculate the comparable price based on strategy
            // ========================================
            if (strategy === 'WEIGHT') {
                // Weight-based: Calculate price per kilogram for fair comparison
                const weightResult = determineEffectiveWeight(row);
                if (weightResult.weightKg && weightResult.weightKg > 0) {
                    // Normalized price = effective price / weight in kg
                    finalNormalizedPrice = effectivePrice / weightResult.weightKg;
                    unitLabel = '€/kg';
                    calcMethod = weightResult.method;
                    calcTooltip = `${weightResult.tooltip} Rechnung: ${effectivePrice.toFixed(2)}€ / ${weightResult.weightKg.toFixed(3)}kg`;
                    trace.push(`⚖️ Weight Strat: ${weightResult.method} (${weightResult.weightKg.toFixed(3)}kg)`);
                } else {
                    // Error case: WEIGHT strategy chosen but no weight could be determined
                    finalNormalizedPrice = 999999; // Push to bottom of rankings
                    unitLabel = 'ERR';
                    calcMethod = 'ERR';
                    calcTooltip = 'Fehler: Strategie WEIGHT gewählt, aber kein Gewicht ermittelbar.';
                    trace.push(`❌ ERROR: WEIGHT Strategy but no weight found`);
                }
            } else {
                // Unit-based: Use effective price directly (price per piece)
                finalNormalizedPrice = effectivePrice;
                unitLabel = '€/Stk';
                calcMethod = 'UNIT';
                calcTooltip = `Strategie: UNIT. Preis pro Stück. Rechnung: ${effectivePrice.toFixed(2)}€ / 1 Stk`;
            }

            // ========================================
            // STEP E: BUILD GROUP KEY FOR RANKING
            // Format: "ProductType > Material > Form"
            // ========================================
            const materialDisplay = row.finalMaterialName || `[no mat]`;
            const formDisplay = row.finalFormName || `[no form]`;

            return {
                Row_ID: (index + 1).toString(),
                Offering_ID: row.offeringId,
                Group_Key: `${row.productTypeName} > ${materialDisplay} > ${formDisplay}`,
                Wholesaler: row.wholesalerName,
                Origin_Country: country,
                Product_Title: (row.offeringTitle || 'NULL').substring(0, 50),

                Raw_Price_List: listPrice,
                Offering_Price: row.offeringPrice,
                Offering_Price_Per_Piece: row.offeringPricePerPiece,
                Raw_Weight_Input: row.offeringWeightGrams !== null ? String(row.offeringWeightGrams) : '-',

                Detected_Bulk_Price: priceInfo.price,
                Detected_Weight_Kg: strategy === 'WEIGHT' ? (determineEffectiveWeight(row).weightKg) : null,
                Applied_Markup_Pct: markupPct,

                Dimensions: dimensionsInfo.dimensions,
                Dimensions_Source: dimensionsInfo.source,
                Dimensions_Warning: dimensionsInfo.warning,
                Weight_Display: determineEffectiveWeight(row).source, // Simplified display
                Weight_Source: determineEffectiveWeight(row).source,
                Weight_Warning: null,
                Package_Weight: packageWeightInfo.packageWeightDisplay,
                Package_Weight_Warning: packageWeightInfo.warning,

                Final_Normalized_Price: parseFloat(finalNormalizedPrice.toFixed(2)),
                Unit: unitLabel,
                Calculation_Method: calcMethod,
                Calculation_Tooltip: calcTooltip,

                Calculation_Trace: trace.join(' | ')
            };
        });

    log.info(`Transformation complete: ${auditData.length} audit rows generated`);
    return auditData;
}

// ==========================================
// 6. ENTRY POINTS
// ==========================================

export function analyzeOfferingsFromCsv() {
    log.info('Starting offering analysis from CSV');

    const filePath = path.isAbsolute(CSV_FILENAME)
        ? CSV_FILENAME
        : path.join(__dirname, CSV_FILENAME);

    if (!fs.existsSync(filePath)) {
        log.error(`CSV file not found: ${filePath}`);
        process.exit(1);
    }

    log.info(`Reading CSV file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rawData = parseCSV(fileContent);
    log.info(`Read ${rawData.length} rows from CSV`);

    if (rawData.length === 0) {
        log.warn('No data found in CSV file');
        return;
    }

    const reportBuilder = new ReportBuilder();
    processAndAnalyzeOfferingsFromCsv(rawData, reportBuilder);
} 

export async function analyzeOfferingsFromDb() {
    log.info('Starting offering analysis from database');

    const pool = await db;
    const transaction = pool.transaction();
    let transactionCommitted = false;

    try {
        await transaction.begin();
        log.info('Loading enriched offerings from database...');

        // Create combined WHERE condition from all filters
        const whereCondition = buildOfferingsWhereCondition(analysisOptions);

        if (whereCondition) {
            if ((analysisOptions.excludedWholesalerIds?.length ?? 0 )> 0) {
                log.info(`Excluding wholesaler IDs from analysis: ${analysisOptions.excludedWholesalerIds?.join(', ')}`);
            }
            if ((analysisOptions.allowedWholesalerRelevances?.length ??0 )> 0) {
                log.info(`Filtering by wholesaler relevance: ${analysisOptions.allowedWholesalerRelevances?.join(', ')}`);
            }
        }

        const rows = await loadOfferingsFromEnrichedView(transaction, whereCondition);
        log.info(`Loaded ${rows.length} rows from database`);

        if (rows.length === 0) {
            log.warn('No data found in database');
            await transaction.rollback();
            return;
        }

        await transaction.commit();
        transactionCommitted = true;
        log.info('Transaction committed successfully');

        const reportBuilder = new ReportBuilder();
        processAndAnalyzeOfferingsFromDb(rows, reportBuilder);
    } catch (error) {
        log.error('Error loading data from database', { error });
        if (!transactionCommitted) {
            try {
                await rollbackTransaction(transaction);
            } catch (rollbackError) {
                log.error('Error during rollback', { rollbackError });
            }
        }
        process.exit(1);
    } finally {
        try {
            await pool.close();
            log.info('Database connection pool closed');
        } catch (closeError) {
            log.warn('Error closing connection pool', { closeError });
        }
    }
}

function processAndAnalyzeOfferingsFromCsv(rawData: RawOffering[], reportBuilder: ReportBuilder) {
    log.info(`Starting transformation of ${rawData.length} raw offerings from CSV`);
    const normalizedOfferings = rawData.map(normalizeRawOffering);
    log.info(`Normalized ${normalizedOfferings.length} offerings`);

    const auditData = transformOfferingsToAuditRows(normalizedOfferings, reportBuilder);

    log.info('Sorting audit data by group and price');
    const sortedData = auditData.sort((a, b) => {
        if (a.Group_Key < b.Group_Key) return -1;
        if (a.Group_Key > b.Group_Key) return 1;
        return a.Final_Normalized_Price - b.Final_Normalized_Price;
    });

    reportBuilder.generateReports(sortedData);
}

function processAndAnalyzeOfferingsFromDb(enrichedData: OfferingEnrichedView[], reportBuilder: ReportBuilder) {
    log.info(`Starting transformation of ${enrichedData.length} enriched offerings from database`);
    const normalizedOfferings = enrichedData.map(normalizeEnrichedView);
    log.info(`Normalized ${normalizedOfferings.length} offerings (no parsing required)`);

    const auditData = transformOfferingsToAuditRows(normalizedOfferings, reportBuilder);

    log.info('Sorting audit data by group and price');
    const sortedData = auditData.sort((a, b) => {
        if (a.Group_Key < b.Group_Key) return -1;
        if (a.Group_Key > b.Group_Key) return 1;
        return a.Final_Normalized_Price - b.Final_Normalized_Price;
    });

    reportBuilder.generateReports(sortedData);
}
