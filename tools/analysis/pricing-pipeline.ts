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

/**
 * Normalized offering data structure used throughout the pricing pipeline.
 * Contains all necessary fields from various data sources (CSV, DB views)
 * in a unified format for consistent processing.
 */
export interface NormalizedOffering {
    wholesalerName: string;
    wholesalerId: number;
    wholesalerRelevance: string | null;
    wholesalerCountry: string | null;          // Used for import markup calculation
    productTypeName: string;
    finalMaterialName: string | null;
    finalFormName: string | null;
    offeringTitle: string;
    offeringPrice: number;                      // List price from wholesaler
    offeringPricePerPiece: number | null;
    offeringWeightGrams: number | null;         // Exact weight if available
    offeringComment: string | null;             // May contain bulk pricing info
    offeringPackaging: string | null;           // e.g., "10 kg"
    offeringDimensions: string | null;          // e.g., "20x30x15 mm"
    offeringWeightRange: string | null;         // e.g., "50-100g"
    offeringPackageWeight: string | null;
    offeringId: number;
}

/**
 * Result from bulk price detection (Step A).
 * Contains the best price found and its source (list price or bulk discount).
 */
export interface BestPriceResult {
    price: number;                              // Best price found (may be lower than list price)
    source: string;                             // 'List' or 'Bulk (Comment)'
    commentExcerpt?: string;                    // Excerpt from comment where bulk price was found
    trace: string[];                            // Debug trace for transparency
}

/**
 * Result from landed cost calculation (Step B).
 * Applies import markup for non-EU countries to get true cost.
 */
export interface LandedCostResult {
    effectivePrice: number;                     // Price after import markup (if applicable)
    markupPct: number;                          // Markup percentage applied (0 for EU, 25 for non-EU)
    country: string;                            // Normalized country code
    isEu: boolean;                              // Whether country is in EU zone
    trace: string[];                            // Debug trace for transparency
}

/**
 * Result from pricing strategy determination (Step C).
 * Decides whether to price by weight (€/kg) or by unit (€/Stk).
 */
export interface PricingStrategyResult {
    strategy: 'WEIGHT' | 'UNIT';                // WEIGHT: price per kg, UNIT: price per piece
    trace: string[];                            // Debug trace for transparency
}

/**
 * Result from normalized price calculation (Step D).
 * Contains the final comparable price in €/kg or €/Stk.
 */
export interface NormalizedPriceResult {
    normalizedPrice: number;                    // Final price for comparison (€/kg or €/Stk)
    unit: '€/kg' | '€/Stk' | 'ERR';            // Unit of the normalized price
    calcMethod: ReportRow['Calculation_Method']; // How weight was determined (EXACT, CALC, RANGE, etc.)
    calcTooltip: string;                        // Human-readable explanation of calculation
    weightKg: number | null;                    // Weight in kg (null for UNIT strategy)
    trace: string[];                            // Debug trace for transparency
}

/**
 * Result from metadata extraction (Step E).
 * Contains dimensions, package weight, and related warnings.
 */
export interface MetadataResult {
    dimensions: string | null;                  // Formatted dimensions string
    dimensionsSource: string;                   // Where dimensions came from (Field, Packaging, etc.)
    dimensionsWarning: string | null;           // Warning if dimension data is problematic
    packageWeight: string | null;               // Formatted package weight string
    packageWeightWarning: string | null;        // Warning if package weight is problematic
    trace: string[];                            // Debug trace for transparency
}

// ==========================================
// STEP A: BULK PRICE DETECTION
// ==========================================

/**
 * Extracts all price-like patterns from a comment string.
 * 
 * PATTERN MATCHING:
 * - Finds: €5, $5.50, 3,20, 10.00, etc.
 * - Regex: /[\$€]?\s?(\d+[\.,]?\d{0,2})/g
 * 
 * NORMALIZATION:
 * - Removes currency symbols (€, $)
 * - Converts comma to dot (3,20 → 3.20)
 * - Converts to float number
 * 
 * @param comment - Comment text to search for prices
 * @returns Array of found price values (normalized to numbers)
 * 
 * @example
 * extractPricesFromComment("ab 50 Stück: 3.20 EUR oder 2,50")
 * → [50, 3.20, 2.50]
 */
function extractPricesFromComment(comment: string): number[] {
    // Search for price patterns: $5, €5, 5.50, 5,50
    // Pattern matches: optional currency symbol, optional space, digits with optional decimal separator
    const matches = comment.match(/[\$€]?\s?(\d+[\.,]?\d{0,2})/g);
    
    if (!matches) {
        return [];
    }
    
    // Normalize each match: remove currency symbols, trim, convert comma to dot
    return matches.map(m => 
        parseFloat(m.replace(/[€$]/g, '').trim().replace(',', '.'))
    );
}

/**
 * Finds the lowest valid price from a list of candidates.
 * 
 * VALIDATION RULES:
 * - Must be lower than list price (otherwise it's not a discount)
 * - Must be greater than 10% of list price (prevents false positives like "2mm" or "1x")
 * 
 * WHY 10% THRESHOLD:
 * Comments often contain measurements like "2-3 mm" or "1x verfügbar" which would
 * otherwise be detected as prices. The 10% threshold filters these out.
 * 
 * @param candidates - Array of price candidates extracted from comment
 * @param listPrice - The official list price as baseline for validation
 * @returns Lowest valid price or null if none found
 * 
 * @example
 * // List price: 10.00€
 * findLowestValidPrice([50, 3.20, 2.50, 0.50], 10.00)
 * → 2.50 (3.20 and 2.50 are valid, 2.50 is lowest, 50 is higher than list, 0.50 is < 10%)
 */
function findLowestValidPrice(candidates: number[], listPrice: number): number | null {
    let lowest = listPrice;
    
    // Check each candidate price
    for (const price of candidates) {
        // Validation: Must be lower than list price AND greater than 10% of list price
        if (price < lowest && price > (listPrice * 0.1)) {
            lowest = price;
        }
    }
    
    // Return lowest if we found a better price, otherwise null
    return lowest < listPrice ? lowest : null;
}

/**
 * Extracts a text excerpt around a price match for context display.
 * 
 * PURPOSE:
 * Shows users where in the comment the bulk price was found,
 * providing context like "ab 50 Stück: 3.20 EUR".
 * 
 * @param comment - Full comment text to extract from
 * @param priceString - The price string to find (e.g., "3.20")
 * @param contextChars - Number of characters to include before/after (default: 20)
 * @returns Text excerpt with context around the price
 * 
 * @example
 * extractCommentExcerpt("Sonderangebot ab 50 Stück: 3.20 EUR pro Stück", "3.20", 20)
 * → "ab 50 Stück: 3.20 EUR pro Stück"
 */
function extractCommentExcerpt(
    comment: string, 
    priceString: string, 
    contextChars: number = 20
): string {
    const index = comment.indexOf(priceString);
    
    // If price string not found, return beginning of comment
    if (index === -1) {
        return comment.substring(0, 50);
    }
    
    // Extract characters before and after the price
    const start = Math.max(0, index - contextChars);
    const end = Math.min(comment.length, index + priceString.length + contextChars);
    
    return comment.substring(start, end).trim();
}

/**
 * Detects the best available price for an offering.
 * 
 * STRATEGY:
 * 1. Start with the list price as baseline
 * 2. Search comment field for bulk pricing mentions (e.g., "ab 10 Stk: 5.50€")
 * 3. Extract all price-like patterns using regex
 * 4. Find the lowest valid price (must be < list price and > 10% of list price)
 * 5. Return the best price found with its source
 * 
 * VALIDATION:
 * - Bulk price must be lower than list price (otherwise it's not a discount)
 * - Bulk price must be > 10% of list price (to avoid false positives like "2mm" or "1x")
 * 
 * @param offering - The normalized offering to analyze
 * @param listPrice - The official list price from the wholesaler
 * @param reportBuilder - Optional report builder to add legend entries
 * @returns Best price result with source information
 * 
 * @example
 * // Comment: "ab 50 Stück: 3.20 EUR"
 * // List price: 4.50
 * // Result: { price: 3.20, source: 'Bulk (Comment)', commentExcerpt: "...ab 50 Stück: 3.20 EUR..." }
 */
export function detectBestPrice(
    offering: NormalizedOffering,
    listPrice: number,
    reportBuilder?: ReportBuilder
): BestPriceResult {
    const trace: string[] = [];

    // Add legend entry for bulk pricing if report builder is available
    if (reportBuilder && !reportBuilder['legendEntries'].has('Preis (Norm.)_Bulk')) {
        reportBuilder.addToLegend(
            'Preis (Norm.)_Bulk',
            'Bulk-Preis aus Comment-Feld extrahiert',
            'Regex-Pattern durchsucht Comment nach Preisen.'
        );
    }

    // No comment field = no bulk pricing info available
    if (!offering.offeringComment) {
        return { price: listPrice, source: 'List', trace };
    }

    // STEP 1: Extract all prices from comment
    // Uses regex to find all price-like patterns (€5, $5.50, 3,20, etc.)
    const priceCandidates = extractPricesFromComment(offering.offeringComment);
    
    // STEP 2: Find the lowest valid bulk price
    // Validates each candidate: must be < list price and > 10% of list price
    const bulkPrice = findLowestValidPrice(priceCandidates, listPrice);
    
    // STEP 3: If bulk price found, extract context and return
    if (bulkPrice !== null) {
        // Extract excerpt from comment showing where the price was found
        const excerpt = extractCommentExcerpt(
            offering.offeringComment, 
            bulkPrice.toString()
        );
        
        // Add trace information for debugging
        trace.push(`💰 Bulk Found: ${bulkPrice.toFixed(2)} (was ${listPrice.toFixed(2)})`);
        trace.push(`💬 Comment: "...${excerpt}..."`);
        
        return { 
            price: bulkPrice, 
            source: 'Bulk (Comment)', 
            commentExcerpt: excerpt, 
            trace 
        };
    }

    // No bulk price found, return list price
    return { price: listPrice, source: 'List', trace };
}

// ==========================================
// STEP B: LANDED COST CALCULATION
// ==========================================

/**
 * Calculates the landed cost by applying import markup for non-EU countries.
 * 
 * BUSINESS LOGIC:
 * - EU countries: No markup (free trade within EU)
 * - Non-EU countries: +25% markup to account for:
 *   - Import duties and taxes
 *   - Shipping costs
 *   - Customs clearance
 *   - Currency conversion fees
 *   - Administrative overhead
 * 
 * CALCULATION:
 * - EU: effectivePrice = price (no change)
 * - Non-EU: effectivePrice = price × 1.25 (25% markup)
 * 
 * This ensures fair comparison between EU and non-EU suppliers by factoring
 * in the real total cost of acquisition.
 * 
 * @param price - The price to calculate landed cost for (may be bulk price)
 * @param country - Country code of the wholesaler (e.g., "DE", "CN", "IN")
 * @param reportBuilder - Optional report builder to add legend entries
 * @returns Landed cost result with markup information
 * 
 * @example
 * // EU supplier (Germany)
 * calculateLandedCost(100, "DE") → { effectivePrice: 100, markupPct: 0, country: "DE", isEu: true }
 * 
 * @example
 * // Non-EU supplier (China)
 * calculateLandedCost(100, "CN") → { effectivePrice: 125, markupPct: 25, country: "CN", isEu: false }
 */
export function calculateLandedCost(
    price: number,
    country: string | null,
    reportBuilder?: ReportBuilder
): LandedCostResult {
    const trace: string[] = [];
    
    // Normalize country code to uppercase for consistent lookup
    const normalizedCountry = country ? country.toUpperCase() : 'UNKNOWN';

    // Add legend entry for origin country if report builder is available
    if (reportBuilder && !reportBuilder['legendEntries'].has('Herkunft')) {
        reportBuilder.addToLegend(
            'Herkunft',
            'Herkunftsland (Wholesaler Country)',
            'Nicht-EU-Länder bekommen Import-Markup (+25%).'
        );
    }

    // Check if country is in EU zone (defined in analyze-config.ts)
    const isEu = EU_ZONE.has(normalizedCountry);
    let markupPct = 0;
    let effectivePrice = price;

    if (isEu) {
        // EU supplier: No markup needed (free trade within EU)
        trace.push(`🌍 Origin: ${normalizedCountry} (EU - no markup)`);
    } else {
        // Non-EU supplier: Apply import markup
        // IMPORT_MARKUP is defined in analyze-config.ts (typically 1.25 = 25% markup)
        markupPct = (IMPORT_MARKUP - 1) * 100;              // Convert to percentage for display
        effectivePrice = price * IMPORT_MARKUP;             // Calculate final landed cost
        
        trace.push(`✈️ Origin: ${normalizedCountry} (+${markupPct.toFixed(0)}% Markup = ${effectivePrice.toFixed(2)})`);
    }

    return { effectivePrice, markupPct, country: normalizedCountry, isEu, trace };
}

// ==========================================
// STEP C: PRICING STRATEGY DETERMINATION
// ==========================================

/**
 * Determines the pricing strategy for an offering: WEIGHT (€/kg) vs UNIT (€/Stk).
 * 
 * DECISION LOGIC (priority order):
 * 1. PRESET WEIGHT: If product type is configured for weight-based pricing (e.g., "Rohsteine")
 *    → Always use WEIGHT strategy (€/kg)
 * 
 * 2. PRESET UNIT: If product type is configured for unit-based pricing (e.g., "Schmuck")
 *    → Always use UNIT strategy (€/Stk)
 * 
 * 3. AUTO: If no preset exists, check if weight data is available
 *    → Weight available: Use WEIGHT strategy (€/kg)
 *    → No weight: Use UNIT strategy (€/Stk)
 * 
 * RATIONALE:
 * - Weight-based (€/kg): Better for comparing raw materials where size varies
 *   Example: A 2kg crystal ball vs a 3kg crystal ball should be compared per kg
 * 
 * - Unit-based (€/Stk): Better for finished products where value is per piece
 *   Example: A finished pendant is sold as one unit, not by weight
 * 
 * @param offering - The normalized offering to analyze
 * @param determineWeightFn - Function to check if weight data is available
 * @returns Pricing strategy result (WEIGHT or UNIT)
 * 
 * @example
 * // Rohsteine (raw stones) → Always WEIGHT
 * determinePricingStrategy({ productTypeName: "Rohsteine", ... }) → { strategy: "WEIGHT" }
 * 
 * @example
 * // Unknown product with weight data → AUTO decides WEIGHT
 * determinePricingStrategy({ productTypeName: "Unbekannt", ... }) → { strategy: "WEIGHT" }
 * 
 * @example
 * // Unknown product without weight data → AUTO decides UNIT
 * determinePricingStrategy({ productTypeName: "Unbekannt", ... }) → { strategy: "UNIT" }
 */
export function determinePricingStrategy(
    offering: NormalizedOffering,
    determineWeightFn: (offering: NormalizedOffering) => { weightKg: number | null }
): PricingStrategyResult {
    const trace: string[] = [];
    
    // Check if product type has a preset strategy (defined in STRATEGY_MAP in analyze-config.ts)
    // Examples: "Rohsteine" → WEIGHT, "Anhänger" → UNIT, "Handstein" → AUTO
    const preset = STRATEGY_MAP[offering.productTypeName] || 'AUTO';

    // CASE 1: Explicit WEIGHT preset (always price per kilogram)
    if (preset === 'WEIGHT') {
        return { strategy: 'WEIGHT', trace };
    } 
    // CASE 2: Explicit UNIT preset (always price per piece)
    else if (preset === 'UNIT') {
        return { strategy: 'UNIT', trace };
    } 
    // CASE 3: AUTO preset (decide based on weight availability)
    else {
        // Try to determine if weight data is available
        const weightCheck = determineWeightFn(offering);
        
        // If we can determine weight → use WEIGHT strategy, otherwise UNIT strategy
        const strategy = weightCheck.weightKg !== null ? 'WEIGHT' : 'UNIT';
        return { strategy, trace };
    }
}

// ==========================================
// STEP D: NORMALIZED PRICE CALCULATION
// ==========================================

/**
 * Calculates the normalized price for comparison across different offerings.
 * 
 * PURPOSE:
 * Makes prices comparable by normalizing them to a common unit:
 * - WEIGHT strategy → €/kg (euro per kilogram)
 * - UNIT strategy → €/Stk (euro per piece)
 * 
 * WEIGHT STRATEGY CALCULATION:
 * The weight can be determined by different methods (priority order):
 * 
 * 1. EXACT: Direct weight from offeringWeightGrams field
 *    Example: offeringWeightGrams = 50 → 0.050 kg
 *    Calculation: price / 0.050 kg = €/kg
 * 
 * 2. RANGE: Average of weight range (e.g., "50-100g" → 75g)
 *    Example: weightRange = "50-100g" → 0.075 kg average
 *    Calculation: price / 0.075 kg = €/kg
 * 
 * 3. BULK: Weight from packaging field (e.g., "5 kg")
 *    Example: packaging = "5 kg" → 5.000 kg
 *    Calculation: price / 5.000 kg = €/kg
 * 
 * 4. CALC: Geometric calculation from dimensions using:
 *    - Bounding box volume from dimensions (L × W × H)
 *    - Form factor (sphere ≈ 0.52, cube = 1.0, etc.)
 *    - Material density (g/cm³)
 *    Formula: weight = volume × formFactor × density
 *    Example: 20mm sphere of Amethyst (density 2.65 g/cm³)
 *      → volume = 4.19 cm³
 *      → weight = 4.19 × 0.52 × 2.65 = 5.8g = 0.0058 kg
 *    Calculation: price / 0.0058 kg = €/kg
 * 
 * ERROR HANDLING:
 * If WEIGHT strategy is selected but no weight can be determined:
 * → Return error price (999999) to flag the issue in reports
 * → This indicates missing or invalid data that needs attention
 * 
 * UNIT STRATEGY CALCULATION:
 * Simply return the effective price as-is (no division needed)
 * → normalizedPrice = effectivePrice (already in €/piece)
 * 
 * @param effectivePrice - Price after import markup (from calculateLandedCost)
 * @param strategy - Pricing strategy (WEIGHT or UNIT) from determinePricingStrategy
 * @param offering - The normalized offering being analyzed
 * @param determineWeightFn - Function to determine weight (returns method, weight, tooltip)
 * @returns Normalized price result with calculation details
 * 
 * @example
 * // WEIGHT strategy with 0.05kg weight
 * calculateNormalizedPrice(10.00, 'WEIGHT', offering, fn)
 * → { normalizedPrice: 200.00, unit: '€/kg', calcMethod: 'EXACT', weightKg: 0.05 }
 * 
 * @example
 * // UNIT strategy
 * calculateNormalizedPrice(15.50, 'UNIT', offering, fn)
 * → { normalizedPrice: 15.50, unit: '€/Stk', calcMethod: 'UNIT', weightKg: null }
 */
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
        // WEIGHT STRATEGY: Calculate price per kilogram
        
        // Call the weight determination function (from analyze-wholesaler.ts)
        // This tries EXACT → RANGE → BULK → CALC methods in priority order
        const weightResult = determineWeightFn(offering);
        
        if (weightResult.weightKg && weightResult.weightKg > 0) {
            // SUCCESS: We have a valid weight, calculate €/kg
            
            // Formula: normalizedPrice = effectivePrice / weightKg
            // Example: 10.00€ / 0.05kg = 200.00€/kg
            const normalizedPrice = effectivePrice / weightResult.weightKg;
            
            // Build detailed tooltip showing calculation steps
            const calcTooltip = `${weightResult.tooltip} Calc: ${effectivePrice.toFixed(2)}€ / ${weightResult.weightKg.toFixed(3)}kg`;
            
            trace.push(`⚖️ Weight Strat: ${weightResult.method} (${weightResult.weightKg.toFixed(3)}kg)`);

            return {
                normalizedPrice,
                unit: '€/kg',
                calcMethod: weightResult.method,          // EXACT, RANGE, BULK, or CALC
                calcTooltip,
                weightKg: weightResult.weightKg,
                trace
            };
        } else {
            // ERROR: WEIGHT strategy selected but no weight could be determined
            // This indicates missing or invalid data that needs attention
            
            trace.push(`❌ ERROR: WEIGHT Strategy but no weight found`);
            
            // Return error price (999999) to make this offering stand out in reports
            // This high price will sort it to the bottom, flagging it for review
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
        // UNIT STRATEGY: Price per piece (no weight needed)
        
        // The effective price is already in €/piece, so use it directly
        // No division or calculation needed
        return {
            normalizedPrice: effectivePrice,              // Same as effective price
            unit: '€/Stk',
            calcMethod: 'UNIT',
            calcTooltip: `Strategy: UNIT. Price per piece. Calc: ${effectivePrice.toFixed(2)}€ / 1 pc`,
            weightKg: null,                               // Weight not applicable for UNIT strategy
            trace
        };
    }
}

// ==========================================
// STEP E: METADATA EXTRACTION
// ==========================================

/**
 * Extracts and validates metadata from the offering.
 * 
 * METADATA COLLECTED:
 * 
 * 1. DIMENSIONS:
 *    - Extracted from offeringDimensions or offeringPackaging fields
 *    - Parsed formats: "20x30x15 mm", "Ø 25mm", "15-20 mm", etc.
 *    - Source tracking: Where the dimensions came from (Field, Packaging, etc.)
 *    - Validation: Warnings for suspicious or missing dimensions
 * 
 * 2. PACKAGE WEIGHT:
 *    - Extracted from offeringPackaging or offeringPackageWeight fields
 *    - Parsed formats: "5 kg", "500g", "1 Pkg = 10kg", etc.
 *    - Validation: Warnings for conflicting or suspicious weights
 * 
 * PURPOSE:
 * This metadata is displayed in reports to help users understand:
 * - Physical size of the product (dimensions)
 * - Package quantities (package weight)
 * - Data quality issues (warnings)
 * 
 * The metadata doesn't affect price calculations but provides important
 * context for buyers making purchase decisions.
 * 
 * @param offering - The normalized offering to extract metadata from
 * @returns Metadata result with dimensions, package weight, and warnings
 * 
 * @example
 * // Offering with clear dimensions
 * { offeringDimensions: "20x30x15 mm" }
 * → { dimensions: "20×30×15mm", dimensionsSource: "Field", dimensionsWarning: null }
 * 
 * @example
 * // Offering with package weight
 * { offeringPackaging: "5 kg" }
 * → { packageWeight: "5kg", packageWeightWarning: null }
 * 
 * @example
 * // Offering with suspicious data
 * { offeringPackaging: "5 kg", offeringPackageWeight: "10 kg" }
 * → { packageWeight: "5kg", packageWeightWarning: "Conflicting package weights found" }
 */
export function extractMetadata(offering: NormalizedOffering): MetadataResult {
    const trace: string[] = [];

    // STEP 1: Extract and validate dimensions
    // Dimensions are used for:
    // - Display in reports (so users know the physical size)
    // - Geometric weight calculation (if no other weight source available)
    const dimensionsInfo = extractDimensions(offering);

    // STEP 2: Extract and validate package weight
    // Package weight represents bulk packaging (e.g., "5 kg pack", "1000 pieces per box")
    // This is different from individual piece weight
    const packageWeightInfo = validatePackageWeight(
        offering.offeringPackaging,
        offering.offeringPackageWeight
    );

    // Add to trace if package weight was found
    if (packageWeightInfo.packageWeightDisplay) {
        trace.push(`📦 Package Weight: ${packageWeightInfo.packageWeightDisplay} [Field]`);
    }

    return {
        dimensions: dimensionsInfo.dimensions,                      // Formatted dimensions (e.g., "20×30×15mm")
        dimensionsSource: dimensionsInfo.source,                    // Where dimensions came from
        dimensionsWarning: dimensionsInfo.warning,                  // Warning if dimensions are problematic
        packageWeight: packageWeightInfo.packageWeightDisplay,      // Formatted package weight (e.g., "5kg")
        packageWeightWarning: packageWeightInfo.warning,            // Warning if package weight is problematic
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
    // Prepare display values for material and form names
    // Use placeholder if missing (helps identify incomplete data)
    const materialDisplay = offering.finalMaterialName || `[no mat]`;
    const formDisplay = offering.finalFormName || `[no form]`;

    return {
        // === IDENTIFICATION FIELDS ===
        // These fields identify and group the offering
        Row_ID: (index + 1).toString(),                     // Sequential row number (1-based for display)
        Offering_ID: offering.offeringId,                   // Database ID for lookups
        Product_Type: offering.productTypeName,             // e.g., "Anhänger", "Handstein"
        Material_Name: materialDisplay,                     // e.g., "Amethyst", "Bergkristall"
        Form_Name: formDisplay,                             // e.g., "Kugel", "Herz"
        Wholesaler: offering.wholesalerName,                // Supplier name
        Origin_Country: landedCostResult.country,           // Country code (affects import markup)
        Product_Title: (offering.offeringTitle || 'NULL').substring(0, 50), // Truncated title

        // === RAW INPUT PRICES ===
        // Original prices before any processing
        Raw_Price_List: listPrice,                          // Original list price from wholesaler
        Offering_Price: offering.offeringPrice,             // Same as list price (kept for compatibility)
        Offering_Price_Per_Piece: offering.offeringPricePerPiece, // Price per piece if available
        Raw_Weight_Input: offering.offeringWeightGrams !== null ? String(offering.offeringWeightGrams) : '-', // Raw weight from DB

        // === CALCULATED INTERMEDIATE VALUES ===
        // Results from pipeline steps
        Detected_Bulk_Price: priceResult.price,             // Best price found (may be bulk discount)
        Detected_Weight_Kg: normalizedPriceResult.weightKg, // Determined weight in kg
        Applied_Markup_Pct: landedCostResult.markupPct,    // Import markup percentage (0 for EU, 25 for non-EU)

        // === DIMENSIONS & WEIGHT METADATA ===
        // Physical measurements and their sources
        Dimensions: metadataResult.dimensions,              // Formatted dimensions (e.g., "20×30×15mm")
        Dimensions_Source: metadataResult.dimensionsSource, // Where dimensions came from
        Dimensions_Warning: metadataResult.dimensionsWarning, // Warning if dimensions are problematic
        
        // Format weight for display: grams if < 1kg, otherwise kg
        Weight_Display: normalizedPriceResult.weightKg 
            ? (normalizedPriceResult.weightKg < 1 
                ? `${Math.round(normalizedPriceResult.weightKg * 1000)}g`  // Show as grams (e.g., "50g")
                : `${normalizedPriceResult.weightKg.toFixed(2)}kg`)        // Show as kg (e.g., "1.25kg")
            : '-',                                          // No weight available
        
        Weight_Source: normalizedPriceResult.calcMethod,    // How weight was determined (EXACT, CALC, RANGE, etc.)
        Weight_Warning: null,                               // Currently unused (reserved for future warnings)
        Package_Weight: metadataResult.packageWeight,       // Bulk package weight if available
        Package_Weight_Warning: metadataResult.packageWeightWarning, // Warning if package weight is problematic

        // === FINAL COMPARABLE PRICE ===
        // The main output: normalized price for comparison
        Final_Normalized_Price: parseFloat(normalizedPriceResult.normalizedPrice.toFixed(2)), // Rounded to 2 decimals
        Unit: normalizedPriceResult.unit,                   // "€/kg", "€/Stk", or "ERR"
        Calculation_Method: normalizedPriceResult.calcMethod, // How this price was calculated
        Calculation_Tooltip: normalizedPriceResult.calcTooltip, // Detailed explanation for tooltips

        // === DEBUG TRACE ===
        // Combined trace from all pipeline steps for debugging
        Calculation_Trace: allTraces.join(' | ')           // Human-readable trace of all calculations
    };
}