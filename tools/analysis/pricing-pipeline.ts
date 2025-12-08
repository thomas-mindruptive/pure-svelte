/**
 * Pricing Pipeline - Individual transformation steps for price analysis.
 * 
 * This module contains the discrete steps of the pricing transformation pipeline,
 * extracted from transformOfferingsToAuditRows for better maintainability.
 * 
 * PIPELINE FLOW:
 * 1. detectBestPrice() - Find bulk discounts in comments
 * 2. calculateLandedCost() - Apply import markup for non-EU countries
 * 3. determinePricingStrategy() - Choose WEIGHT vs UNIT strategy
 * 4. calculateNormalizedPrice() - Calculate final comparable price
 * 5. extractMetadata() - Extract dimensions, package weight, etc.
 */

import { EU_ZONE, IMPORT_MARKUP, STRATEGY_MAP, type ReportRow } from './analyze-config.js';
import { extractDimensions, validatePackageWeight } from './parser-utils.js';
import { log } from '$lib/utils/logger.js';
import type { ReportBuilder } from './report-builder.js';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface NormalizedOffering {
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

export interface BestPriceResult {
    price: number;
    source: string;
    commentExcerpt?: string;
    trace: string[];
}

export interface LandedCostResult {
    effectivePrice: number;
    markupPct: number;
    country: string;
    isEu: boolean;
    trace: string[];
}

export interface PricingStrategyResult {
    strategy: 'WEIGHT' | 'UNIT';
    trace: string[];
}

export interface NormalizedPriceResult {
    normalizedPrice: number;
    unit: '€/kg' | '€/Stk' | 'ERR';
    calcMethod: ReportRow['Calculation_Method'];
    calcTooltip: string;
    weightKg: number | null;
    trace: string[];
}

export interface MetadataResult {
    dimensions: string | null;
    dimensionsSource: string;
    dimensionsWarning: string | null;
    packageWeight: string | null;
    packageWeightWarning: string | null;
    trace: string[];
}

// ==========================================
// STEP A: BULK PRICE DETECTION
// ==========================================

export function detectBestPrice(
    offering: NormalizedOffering,
    listPrice: number,
    reportBuilder?: ReportBuilder
): BestPriceResult {
    const trace: string[] = [];

    if (reportBuilder && !reportBuilder['legendEntries'].has('Preis (Norm.)_Bulk')) {
        reportBuilder.addToLegend(
            'Preis (Norm.)_Bulk',
            'Bulk-Preis aus Comment-Feld extrahiert',
            'Regex-Pattern durchsucht Comment nach Preisen.'
        );
    }

    if (!offering.offeringComment) {
        return { price: listPrice, source: 'List', trace };
    }

    const matches = offering.offeringComment.match(/[\$€]?\s?(\d+[\.,]?\d{0,2})/g);

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
            const commentText = offering.offeringComment!;
            const matchString = lowestMatch as string; // Type assertion after null check
            const matchIndex = commentText.indexOf(matchString);
            const start = Math.max(0, matchIndex - 20);
            const end = Math.min(commentText.length, matchIndex + matchString.length + 20);
            const excerpt = commentText.substring(start, end).trim();

            trace.push(`💰 Bulk Found: ${lowest.toFixed(2)} (was ${listPrice.toFixed(2)})`);
            trace.push(`💬 Comment: "...${excerpt}..."`);

            return { price: lowest, source: 'Bulk (Comment)', commentExcerpt: excerpt, trace };
        }
    }

    return { price: listPrice, source: 'List', trace };
}

// ==========================================
// STEP B: LANDED COST CALCULATION
// ==========================================

export function calculateLandedCost(
    price: number,
    country: string | null,
    reportBuilder?: ReportBuilder
): LandedCostResult {
    const trace: string[] = [];
    const normalizedCountry = country ? country.toUpperCase() : 'UNKNOWN';

    if (reportBuilder && !reportBuilder['legendEntries'].has('Herkunft')) {
        reportBuilder.addToLegend(
            'Herkunft',
            'Herkunftsland (Wholesaler Country)',
            'Nicht-EU-Länder bekommen Import-Markup (+25%).'
        );
    }

    const isEu = EU_ZONE.has(normalizedCountry);
    let markupPct = 0;
    let effectivePrice = price;

    if (isEu) {
        trace.push(`🌍 Origin: ${normalizedCountry} (EU - no markup)`);
    } else {
        markupPct = (IMPORT_MARKUP - 1) * 100;
        effectivePrice = price * IMPORT_MARKUP;
        trace.push(`✈️ Origin: ${normalizedCountry} (+${markupPct.toFixed(0)}% Markup = ${effectivePrice.toFixed(2)})`);
    }

    return { effectivePrice, markupPct, country: normalizedCountry, isEu, trace };
}

// ==========================================
// STEP C: PRICING STRATEGY DETERMINATION
// ==========================================

export function determinePricingStrategy(
    offering: NormalizedOffering,
    determineWeightFn: (offering: NormalizedOffering) => { weightKg: number | null }
): PricingStrategyResult {
    const trace: string[] = [];
    const preset = STRATEGY_MAP[offering.productTypeName] || 'AUTO';

    if (preset === 'WEIGHT') {
        return { strategy: 'WEIGHT', trace };
    } else if (preset === 'UNIT') {
        return { strategy: 'UNIT', trace };
    } else {
        const weightCheck = determineWeightFn(offering);
        const strategy = weightCheck.weightKg !== null ? 'WEIGHT' : 'UNIT';
        return { strategy, trace };
    }
}

// ==========================================
// STEP D: NORMALIZED PRICE CALCULATION
// ==========================================

export function calculateNormalizedPrice(
    effectivePrice: number,
    strategy: 'WEIGHT' | 'UNIT',
    offering: NormalizedOffering,
    determineWeightFn: (offering: NormalizedOffering) => {
        weightKg: number | null;
        source: string;
        method: ReportRow['Calculation_Method'];
        tooltip: string;
    }
): NormalizedPriceResult {
    const trace: string[] = [];

    if (strategy === 'WEIGHT') {
        const weightResult = determineWeightFn(offering);
        
        if (weightResult.weightKg && weightResult.weightKg > 0) {
            const normalizedPrice = effectivePrice / weightResult.weightKg;
            const calcTooltip = `${weightResult.tooltip} Calc: ${effectivePrice.toFixed(2)}€ / ${weightResult.weightKg.toFixed(3)}kg`;
            trace.push(`⚖️ Weight Strat: ${weightResult.method} (${weightResult.weightKg.toFixed(3)}kg)`);

            return {
                normalizedPrice,
                unit: '€/kg',
                calcMethod: weightResult.method,
                calcTooltip,
                weightKg: weightResult.weightKg,
                trace
            };
        } else {
            trace.push(`❌ ERROR: WEIGHT Strategy but no weight found`);
            return {
                normalizedPrice: 999999,
                unit: 'ERR',
                calcMethod: 'ERR',
                calcTooltip: 'Error: WEIGHT strategy selected but no weight data available.',
                weightKg: null,
                trace
            };
        }
    } else {
        return {
            normalizedPrice: effectivePrice,
            unit: '€/Stk',
            calcMethod: 'UNIT',
            calcTooltip: `Strategy: UNIT. Price per piece. Calc: ${effectivePrice.toFixed(2)}€ / 1 pc`,
            weightKg: null,
            trace
        };
    }
}

// ==========================================
// STEP E: METADATA EXTRACTION
// ==========================================

export function extractMetadata(offering: NormalizedOffering): MetadataResult {
    const trace: string[] = [];

    const dimensionsInfo = extractDimensions(offering);
    const packageWeightInfo = validatePackageWeight(
        offering.offeringPackaging,
        offering.offeringPackageWeight
    );

    if (packageWeightInfo.packageWeightDisplay) {
        trace.push(`📦 Package Weight: ${packageWeightInfo.packageWeightDisplay} [Field]`);
    }

    return {
        dimensions: dimensionsInfo.dimensions,
        dimensionsSource: dimensionsInfo.source,
        dimensionsWarning: dimensionsInfo.warning,
        packageWeight: packageWeightInfo.packageWeightDisplay,
        packageWeightWarning: packageWeightInfo.warning,
        trace
    };
}

// ==========================================
// STEP F: REPORT ROW ASSEMBLY
// ==========================================

/**
 * Builds a complete ReportRow from pipeline results.
 * 
 * This is the final assembly step that combines all pipeline outputs
 * into a single ReportRow structure ready for reporting.
 * 
 * @param index - Row index (0-based)
 * @param offering - Normalized offering data
 * @param listPrice - Original list price
 * @param priceResult - Result from detectBestPrice()
 * @param landedCostResult - Result from calculateLandedCost()
 * @param normalizedPriceResult - Result from calculateNormalizedPrice()
 * @param metadataResult - Result from extractMetadata()
 * @param allTraces - Combined trace entries from all steps
 * @returns Complete ReportRow ready for reporting
 */
export function buildReportRow(
    index: number,
    offering: NormalizedOffering,
    listPrice: number,
    priceResult: { price: number; source: string },
    landedCostResult: { effectivePrice: number; markupPct: number; country: string },
    normalizedPriceResult: {
        normalizedPrice: number;
        unit: '€/kg' | '€/Stk' | 'ERR';
        calcMethod: ReportRow['Calculation_Method'];
        calcTooltip: string;
        weightKg: number | null;
    },
    metadataResult: {
        dimensions: string | null;
        dimensionsSource: string;
        dimensionsWarning: string | null;
        packageWeight: string | null;
        packageWeightWarning: string | null;
    },
    allTraces: string[]
): ReportRow {
    // Build display values for group components
    const materialDisplay = offering.finalMaterialName || `[no mat]`;
    const formDisplay = offering.finalFormName || `[no form]`;

    return {
        Row_ID: (index + 1).toString(),
        Offering_ID: offering.offeringId,
        Product_Type: offering.productTypeName,
        Material_Name: materialDisplay,
        Form_Name: formDisplay,
        Wholesaler: offering.wholesalerName,
        Origin_Country: landedCostResult.country,
        Product_Title: (offering.offeringTitle || 'NULL').substring(0, 50),

        Raw_Price_List: listPrice,
        Offering_Price: offering.offeringPrice,
        Offering_Price_Per_Piece: offering.offeringPricePerPiece,
        Raw_Weight_Input: offering.offeringWeightGrams !== null ? String(offering.offeringWeightGrams) : '-',

        Detected_Bulk_Price: priceResult.price,
        Detected_Weight_Kg: normalizedPriceResult.weightKg,
        Applied_Markup_Pct: landedCostResult.markupPct,

        Dimensions: metadataResult.dimensions,
        Dimensions_Source: metadataResult.dimensionsSource,
        Dimensions_Warning: metadataResult.dimensionsWarning,
        Weight_Display: normalizedPriceResult.weightKg 
            ? (normalizedPriceResult.weightKg < 1 
                ? `${Math.round(normalizedPriceResult.weightKg * 1000)}g`
                : `${normalizedPriceResult.weightKg.toFixed(2)}kg`)
            : '-',
        Weight_Source: normalizedPriceResult.calcMethod,
        Weight_Warning: null,
        Package_Weight: metadataResult.packageWeight,
        Package_Weight_Warning: metadataResult.packageWeightWarning,

        Final_Normalized_Price: parseFloat(normalizedPriceResult.normalizedPrice.toFixed(2)),
        Unit: normalizedPriceResult.unit,
        Calculation_Method: normalizedPriceResult.calcMethod,
        Calculation_Tooltip: normalizedPriceResult.calcTooltip,

        Calculation_Trace: allTraces.join(' | ')
    };
}