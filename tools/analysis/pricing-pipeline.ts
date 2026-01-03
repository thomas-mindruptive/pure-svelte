/**
 * Pricing Pipeline - Individual transformation steps for price analysis.
 * 
 * This module contains the discrete steps of the pricing transformation pipeline,
 * extracted from transformOfferingsToAuditRows for better maintainability.
 * 
 * PIPELINE FLOW:
 * 1. detectBestPrice() - Find bulk discounts in comments
 * 2. calculateLandedCost() - Apply import markup for non-EU countries
 * 3. determineEffectiveWeight() - Determine weight from various sources
 * 4. determinePricingStrategy() - Choose WEIGHT vs UNIT strategy
 * 5. calculateNormalizedPrice() - Calculate final comparable price
 * 6. extractMetadata() - Extract dimensions, package weight, etc.
 */

import { EU_ZONE, IMPORT_MARKUP, STRATEGY_MAP, type ReportRow } from './analyze-config.js';
import { extractDimensions, validatePackageWeight, extractPieceCount } from './parser-utils.js';
import { calculateWeightFromDimensions } from './geometry-utils.js';
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
    offeringBulkPrices: string | null;          // New strict bulk prices field
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
 * Detects the best available price for an offering.
 * 
 * STRATEGY:
 * 1. Start with the list price as baseline
 * 2. Parse the strict 'bulk_prices' field (Format: Quantity|Unit|Price|Info)
 * 3. Fail fast if parsing encounters invalid format
 * 4. Find the lowest price from valid bulk entries
 * 5. Return the best price found with its source
 * 
 * @param offering - The normalized offering to analyze
 * @param listPrice - The official list price from the wholesaler
 * @param reportBuilder - Optional report builder to add legend entries
 * @returns Best price result with source information
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
            'Bulk-Preis aus bulk_prices Feld',
            'Niedrigster Preis aus der strikten Bulk-Preis-Tabelle.'
        );
    }

    // No bulk prices = return list price
    if (!offering.offeringBulkPrices) {
        return { price: listPrice, source: 'List', trace };
    }

    const bulkPrices = offering.offeringBulkPrices.split(/\r?\n/).filter(l => l.trim().length > 0);
    let lowest = listPrice;
    let lowestSource = 'List';
    let foundValidBulk = false;

    trace.push(`🔍 Analyzing ${bulkPrices.length} bulk price entries...`);

    for (const line of bulkPrices) {
        const parts = line.split('|').map(p => p.trim());
        
        // Validation: Must have at least 3 parts (Quantity, Unit, Price)
        if (parts.length < 3) {
            throw new Error(`Invalid bulk price format in offering ${offering.offeringId}: "${line}". Expected: Quantity|Unit|Price|Info`);
        }

        const quantity = parseFloat(parts[0]);
        const unit = parts[1].toLowerCase(); // Normalize unit for trace
        const price = parseFloat(parts[2]);
        // const info = parts[3] || '';

        // Fail fast on invalid numbers
        if (isNaN(quantity) || isNaN(price)) {
            throw new Error(`Invalid number in bulk price for offering ${offering.offeringId}: "${line}"`);
        }

        // Check if this is a better price
        // Note: Bulk prices are typically UNIT prices (price per 1 unit of the bulk quantity)
        if (price < lowest) {
            lowest = price;
            lowestSource = `Bulk (${quantity} ${unit})`;
            foundValidBulk = true;
        }
    }

    if (foundValidBulk) {
        trace.push(`💰 Best Price: ${lowest.toFixed(2)} (from ${lowestSource})`);
        return { 
            price: lowest, 
            source: 'Bulk (Field)', 
            trace 
        };
    }

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
// STEP C: WEIGHT DETERMINATION
// ==========================================

/**
 * Determines both total weight (for pricing) and per-piece weight (for sorting).
 * 
 * LOGIC:
 * - Total Weight: Used for price normalization (€/kg calculations)
 * - Per-Piece Weight: Used for size-based sorting in reports
 * 
 * For bulk offerings with dimensions, these values differ:
 * - Total = package weight (e.g., 2.5kg)
 * - Per-Piece = calculated from dimensions (e.g., 220g for a 5.5cm cluster)
 * 
 * PRIORITY for PER-PIECE:
 * 1. Dimensions (geometry calculation) - highest priority
 * 2. Explicit weight/range (for non-bulk items)
 * 3. null (for bulk without dimensions) - cannot determine
 * 
 * @param row - Normalized offering data
 * @returns Object with both total and per-piece weights
 */
export function determineEffectiveWeight(row: NormalizedOffering): {
    weightKg: number | null,
    weightPerPieceGrams: number | null,
    source: string,
    method: ReportRow['Calculation_Method'],
    tooltip: string,
    tooltipPerPiece: string,
    warning?: string
} {
    // Detect if this is a bulk offering
    const isBulk = row.offeringPackaging?.toLowerCase().includes('bulk')
        || row.offeringPackaging?.toLowerCase().includes('sack')
        || row.offeringPackaging?.toLowerCase().includes('karton')
        || row.offeringPackaging?.toLowerCase().includes('beutel');

    // PRIORITY 1: Dimensions (gives per-piece weight directly)
    if (row.offeringDimensions) {
        const calcResult = calculateWeightFromDimensions(
            row.offeringDimensions,
            row.finalMaterialName || '',
            row.finalFormName || ''
        );

        if (calcResult) {
            const perPieceGrams = calcResult.weightGrams;
            
            // For bulk offerings, check package weight for total
            let totalKg = perPieceGrams / 1000; // default: same as per-piece
            let tooltipTotal = `Total: ${(perPieceGrams / 1000).toFixed(3)}kg (calculated from dimensions)`;
            
            if (isBulk) {
                const pkgCheck = validatePackageWeight(row.offeringPackaging, row.offeringPackageWeight);
                if (pkgCheck.packageWeightDisplay && pkgCheck.packageWeightDisplay.toLowerCase().includes('kg')) {
                    const val = parseFloat(pkgCheck.packageWeightDisplay.replace('kg', '').trim());
                    if (!isNaN(val)) {
                        totalKg = val;
                        tooltipTotal = `Total: ${val}kg (bulk package)`;
                    }
                }
            }
            
            return {
                weightKg: totalKg,
                weightPerPieceGrams: perPieceGrams,
                source: 'Calculated',
                method: 'CALC',
                tooltip: tooltipTotal,
                tooltipPerPiece: `Per-Piece: ${Math.round(perPieceGrams)}g (${calcResult.trace})`
            };
        }
    }

    // PRIORITY 2: Bulk Package (without dimensions)
    if (isBulk) {
        const pkgCheck = validatePackageWeight(row.offeringPackaging, row.offeringPackageWeight);
        if (pkgCheck.packageWeightDisplay && pkgCheck.packageWeightDisplay.toLowerCase().includes('kg')) {
            const val = parseFloat(pkgCheck.packageWeightDisplay.replace('kg', '').trim());
            if (!isNaN(val)) {
                const totalKg = val;
                let perPieceGrams: number | null = null;
                let tooltipPerPiece = '⚠️ No dimensions available for per-piece calculation';
                let warning: string | undefined = 'Bulk offering without per-piece size data';

                // NEU: Stückzahl extrahieren und Einzelgewicht berechnen
                const pieceCount = extractPieceCount(row.offeringPackaging);
                if (pieceCount && pieceCount > 0) {
                    // Berechnung: (Gesamtgewicht in g) / Stückzahl
                    perPieceGrams = (totalKg * 1000) / pieceCount;
                    tooltipPerPiece = `Per-Piece: ~${Math.round(perPieceGrams)}g (calc: ${totalKg}kg / ${pieceCount} pcs)`;
                    warning = undefined; // Warnung entfernen, da wir nun ein Einzelgewicht haben
                }

                return {
                    weightKg: totalKg,
                    weightPerPieceGrams: perPieceGrams,
                    source: `Bulk Pkg (${pkgCheck.packageWeightDisplay})`,
                    method: 'BULK',
                    tooltip: `Total: ${totalKg}kg (bulk package)`,
                    tooltipPerPiece: tooltipPerPiece,
                    warning: warning
                };
            }
        }
    }

    // PRIORITY 3: Explicit Weight Field (non-bulk or no package info)
    if (row.offeringWeightGrams && row.offeringWeightGrams > 0) {
        const grams = row.offeringWeightGrams;
        return {
            weightKg: grams / 1000,
            weightPerPieceGrams: grams,
            source: 'Weight Field',
            method: 'EXACT',
            tooltip: `Weight: ${grams}g (field)`,
            tooltipPerPiece: `Per-Piece: ${grams}g (field)`
        };
    }

    // PRIORITY 4: Weight Range Field (Average)
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
                    weightPerPieceGrams: avgGrams,
                    source: `Range Avg (${row.offeringWeightRange})`,
                    method: 'RANGE',
                    tooltip: `Weight: ${avgGrams}g (average from range '${row.offeringWeightRange}')`,
                    tooltipPerPiece: `Per-Piece: ${Math.round(avgGrams)}g (average from range)`
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
                    weightPerPieceGrams: grams,
                    source: `Range Single (${row.offeringWeightRange})`,
                    method: 'RANGE',
                    tooltip: `Weight: ${grams}g (from range field)`,
                    tooltipPerPiece: `Per-Piece: ${grams}g (from range field)`
                };
            }
        }
    }

    return { 
        weightKg: null, 
        weightPerPieceGrams: null,
        source: 'None', 
        method: 'ERR', 
        tooltip: 'No weight data available.',
        tooltipPerPiece: '⚠️ No weight data available'
    };
}

// ==========================================
// STEP D: PRICING STRATEGY DETERMINATION
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
    weightResult: { weightKg: number | null }
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
        // If we can determine weight → use WEIGHT strategy, otherwise UNIT strategy
        const strategy = weightResult.weightKg !== null ? 'WEIGHT' : 'UNIT';
        return { strategy, trace };
    }
}

// ==========================================
// STEP E: NORMALIZED PRICE CALCULATION
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
    weightResult: {
        weightKg: number | null;
        source: string;
        method: ReportRow['Calculation_Method'];
        tooltip: string;
    }
): NormalizedPriceResult {
    const trace: string[] = [];

    if (strategy === 'WEIGHT') {
        // WEIGHT STRATEGY: Calculate price per kilogram
        
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
        // UNIT STRATEGY: Price per piece
        
        // Weight is stored for sorting purposes, even though not used for pricing
        // This enables size-sorted reports for unit-priced items (e.g., pendants, jewelry)
        // Bulk items (e.g., "1kg Trommelsteine") will have weight from package
        if (weightResult.weightKg) {
            trace.push(`📊 Weight determined for sorting: ${weightResult.method} (${weightResult.weightKg.toFixed(3)}kg)`);
        }
        
        // The effective price is already in €/piece, so use it directly
        // No division or calculation needed for price
        return {
            normalizedPrice: effectivePrice,              // Same as effective price
            unit: '€/Stk',
            calcMethod: 'UNIT',
            calcTooltip: `Strategy: UNIT. Price per piece. Calc: ${effectivePrice.toFixed(2)}€ / 1 pc`,
            weightKg: weightResult.weightKg,              // Store weight for size-sorted reports!
            trace
        };
    }
}

// ==========================================
// STEP F: METADATA EXTRACTION
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
        dimensionsSource: dimensionsInfo.source,                    // Where dimensions came from (Field, Packaging, etc.)
        dimensionsWarning: dimensionsInfo.warning,                  // Warning if dimensions are problematic
        packageWeight: packageWeightInfo.packageWeightDisplay,      // Formatted package weight (e.g., "5kg")
        packageWeightWarning: packageWeightInfo.warning,            // Warning if package weight is problematic
        trace
    };
}

// ==========================================
// STEP G: REPORT ROW ASSEMBLY
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
    weightResult: {
        weightKg: number | null;
        weightPerPieceGrams: number | null;
        source: string;
        method: ReportRow['Calculation_Method'];
        tooltip: string;
        tooltipPerPiece: string;
        warning?: string;
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
        Detected_Weight_Kg: weightResult.weightKg,          // Determined weight in kg (from separate weight pipeline step)
        Applied_Markup_Pct: landedCostResult.markupPct,    // Import markup percentage (0 for EU, 25 for non-EU)

        // === DIMENSIONS & WEIGHT METADATA ===
        // Physical measurements and their sources
        Dimensions: metadataResult.dimensions,              // Formatted dimensions (e.g., "20×30×15mm")
        Dimensions_Source: metadataResult.dimensionsSource, // Where dimensions came from
        Dimensions_Warning: metadataResult.dimensionsWarning, // Warning if dimensions are problematic
        
        // Format weight for display: grams if < 1kg, otherwise kg
        // Calculation logic:
        // - Weight comes from determineEffectiveWeight() (Step C)
        // - It prioritizes: Bulk Pkg > Exact Field > Range Avg > Geometric Calc
        Weight_Display: weightResult.weightKg 
            ? (weightResult.weightKg < 1 
                ? `${Math.round(weightResult.weightKg * 1000)}g`  // < 1kg -> show grams (e.g. "43g")
                : `${weightResult.weightKg.toFixed(2)}kg`)        // >= 1kg -> show kg (e.g. "1.25kg")
            : '-',                                          // No weight available
        
        Weight_Source: weightResult.method,                 // How weight was determined (EXACT, CALC, RANGE, BULK)
        Weight_Warning: null,                               // Currently unused (reserved for future warnings)
        Package_Weight: metadataResult.packageWeight,       // Bulk package weight if available
        Package_Weight_Warning: metadataResult.packageWeightWarning, // Warning if package weight is problematic

        // === PER-PIECE WEIGHT (for size-based sorting) ===
        // Format per-piece weight for display
        Weight_Per_Piece_Grams: weightResult.weightPerPieceGrams,
        Weight_Per_Piece_Display: weightResult.weightPerPieceGrams !== null
            ? (weightResult.weightPerPieceGrams < 1000
                ? `${Math.round(weightResult.weightPerPieceGrams)}g`   // < 1kg -> show grams (e.g. "220g")
                : `${(weightResult.weightPerPieceGrams / 1000).toFixed(2)}kg`) // >= 1kg -> show kg (e.g. "1.25kg")
            : (weightResult.warning ? '⚠️ Unknown' : '-'),     // Unknown or no data
        Weight_Per_Piece_Tooltip: weightResult.tooltipPerPiece,

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
