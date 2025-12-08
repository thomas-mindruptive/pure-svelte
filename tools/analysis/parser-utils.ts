/**
 * Parsing and extraction utilities for offering data.
 * 
 * This module provides functions to:
 * - Parse currency strings to numbers
 * - Extract weight information from various sources
 * - Extract dimension information
 * - Validate package weight data
 * 
 * Data sources are prioritized by reliability:
 * 1. Dedicated database fields (most reliable)
 * 2. Regex extraction from title/packaging (fallback with warning)
 */

import { type RawOffering } from './analyze-config.js';
import { parseDimensions, parseWeightRange } from '$lib/utils/parseUtils.js';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

/**
 * Normalized offering type for extraction functions.
 * Contains only the fields needed for dimension/weight extraction.
 */
type NormalizedOfferingForExtraction = {
    offeringDimensions: string | null;
    offeringWeightRange: string | null;
    offeringPackageWeight: string | null;
    offeringWeightGrams: number | null;
    offeringTitle: string;
    offeringPackaging: string | null;
};

// ==========================================
// CURRENCY PARSING
// ==========================================

/**
 * Parses a currency string to a numeric value.
 * Handles European format (comma as decimal separator) and currency symbols.
 * 
 * IMPORTANT: Returns 0 for invalid values as a data quality indicator.
 * Callers should check for 0 when the original value is non-empty.
 * 
 * @param val - Currency string to parse (e.g., "1.299,00 €", "12.50")
 * @returns Parsed number, or 0 if invalid/empty
 * 
 * @example
 * parseMoney("1.299,00 €")  // → 1299.00
 * parseMoney("12.50")       // → 12.50
 * parseMoney("NULL")        // → 0
 * parseMoney("invalid")     // → 0 (warning indicator)
 */
export function parseMoney(val: string): number {
    if (!val || val === 'NULL') return 0;
    
    // Remove currency symbols and whitespace, normalize decimal separator
    const cleaned = val.replace(/[€$]/g, '').trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    
    // NaN indicates invalid input - return 0 as a signal
    // This helps identify data quality issues upstream
    if (isNaN(parsed)) {
        return 0;
    }
    
    return parsed;
}

// ==========================================
// WEIGHT EXTRACTION
// ==========================================

/**
 * Extracts weight in kg from a raw offering.
 * Uses a priority cascade of data sources.
 * 
 * PRIORITY ORDER:
 * 1. offeringWeightGrams field (explicit, most reliable)
 * 2. Regex in title/packaging for "Xkg" pattern
 * 3. Regex in title/packaging for "Xg" pattern
 * 
 * @param row - Raw offering data
 * @returns Object with weight in kg and source description
 */
export function extractWeightKg(row: RawOffering): { weight: number | null, source: string } {
    // Priority 1: Explicit weight field
    const rawW = parseMoney(row.offeringWeightGrams);
    if (rawW > 0) {
        return { weight: rawW / 1000, source: 'Column (g)' };
    }

    // Priority 2/3: Text mining from title and packaging
    const textToScan = (row.offeringTitle + ' ' + (row.offeringPackaging || '')).toLowerCase();

    // Look for kilogram pattern first (e.g., "1.5 kg", "2kg")
    const kgMatch = textToScan.match(/(\d+[\.,]?\d*)\s*kg/);
    if (kgMatch) {
        return { 
            weight: parseFloat(kgMatch[1].replace(',', '.')), 
            source: 'Regex (Title/Pack kg)' 
        };
    }
    
    // Look for gram pattern (e.g., "500 g", "250g")
    // Use word boundary \b to avoid matching "gold", "ring", etc.
    const gMatch = textToScan.match(/(\d+)\s*g\b/); 
    if (gMatch) {
        return { 
            weight: parseFloat(gMatch[1]) / 1000, 
            source: 'Regex (Title/Pack g)' 
        };
    }

    return { weight: null, source: 'None' };
}

/**
 * Searches for volume discount prices hidden in the comment field.
 * Returns the lowest valid price found, or the list price if none found.
 * 
 * VALIDATION RULES:
 * - Must be lower than list price (otherwise not a discount)
 * - Must be > 10% of list price (filters out false positives like dimensions)
 * 
 * @param row - Raw offering data
 * @param listPrice - The official list price to compare against
 * @returns Object with best price and source indicator
 */
export function getBestPrice(row: RawOffering, listPrice: number): { price: number, source: string } {
    if (!row.offeringComment || row.offeringComment === 'NULL') {
        return { price: listPrice, source: 'List' };
    }

    // Find price patterns (number with decimal, optionally with currency symbol)
    const matches = row.offeringComment.match(/[\$€]?\s?(\d+[\.,]\d{2})/g);
    
    if (matches) {
        let lowest = listPrice;
        matches.forEach(m => {
            const val = parseFloat(m.replace(/[€$]/g, '').replace(',', '.'));
            // Plausibility check:
            // - Must be cheaper than list price
            // - Must be > 10% of list price (protects against typos or dimensions like "0.5 cm")
            if (val < lowest && val > (listPrice * 0.1)) {
                lowest = val;
            }
        });

        if (lowest < listPrice) {
            return { price: lowest, source: 'Bulk (Comment)' };
        }
    }
    return { price: listPrice, source: 'List' };
}

// ==========================================
// DIMENSION EXTRACTION
// ==========================================

/**
 * Extracts dimensions from a normalized offering.
 * 
 * PRIORITY ORDER:
 * 1. offeringDimensions field (dedicated field, most reliable)
 * 2. Regex in title (fallback, generates warning)
 * 
 * PATTERNS MATCHED:
 * - "20x50" or "20x50cm" or "20 x 50 cm"
 * - "30-40mm" or "30mm"
 * - "2,1x2,7cm"
 * 
 * @param row - Normalized offering data
 * @returns Dimensions string, source, and optional warning
 */
export function extractDimensions(row: NormalizedOfferingForExtraction): { 
    dimensions: string | null, 
    source: string, 
    warning: string | null 
} {
    // Priority 1: Dedicated dimensions field
    if (row.offeringDimensions) {
        const parsed = parseDimensions(row.offeringDimensions);
        if (parsed.valid) {
            return { 
                dimensions: row.offeringDimensions, 
                source: 'Field',
                warning: null
            };
        }
    }

    // Priority 2: Regex extraction from title
    const titleLower = row.offeringTitle.toLowerCase();
    
    // Try multiple dimension patterns
    const dimMatch = 
        titleLower.match(/(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*(?:mm|cm|m)?/i) ||  // 20x50cm
        titleLower.match(/(\d+[\.,]?\d*)\s*[-–]\s*(\d+[\.,]?\d*)\s*(?:mm|cm|m)/i) ||   // 30-40mm
        titleLower.match(/(\d+[\.,]?\d*)\s*(?:mm|cm|m)\b/i);                           // 50mm
    
    if (dimMatch) {
        const matchedText = dimMatch[0].trim();
        return {
            dimensions: matchedText,
            source: 'Regex (Title)',
            warning: 'Dimensions found in title but not in dimensions field - data quality issue'
        };
    }

    return { dimensions: null, source: 'None', warning: null };
}

/**
 * Extracts weight from a normalized offering with extended source tracking.
 * 
 * PRIORITY ORDER:
 * 1. offeringWeightRange field (e.g., "30-50g")
 * 2. offeringWeightGrams field (explicit value)
 * 3. Regex in title/packaging (fallback with warning)
 * 
 * @param row - Normalized offering data
 * @returns Weight in kg, source, display string, and optional warning
 */
export function extractWeightKgFromNormalized(row: NormalizedOfferingForExtraction): { 
    weight: number | null, 
    source: string,
    display: string | null,
    warning: string | null 
} {
    // Priority 1: Weight range field (e.g., "30-50g")
    if (row.offeringWeightRange) {
        const parsed = parseWeightRange(row.offeringWeightRange);
        if (parsed.valid && parsed.data) {
            const { min, max, unit } = parsed.data;
            const avgWeightInGrams = (min + max) / 2;
            const weightInKg = avgWeightInGrams / 1000;
            const displayStr = unit === 'kg' 
                ? `${(avgWeightInGrams / 1000).toFixed(2)}kg`
                : `${avgWeightInGrams}g`;
            return {
                weight: weightInKg,
                source: 'Weight Range Field',
                display: displayStr,
                warning: null
            };
        }
    }

    // Priority 2: Explicit weight in grams field
    if (row.offeringWeightGrams && row.offeringWeightGrams > 0) {
        const weightInKg = row.offeringWeightGrams / 1000;
        return {
            weight: weightInKg,
            source: 'Weight Grams Field',
            display: `${row.offeringWeightGrams}g`,
            warning: null
        };
    }

    // Priority 3: Regex extraction from title/packaging
    const textToScan = (row.offeringTitle + ' ' + (row.offeringPackaging || '')).toLowerCase();

    // Try kilogram pattern first
    const kgMatch = textToScan.match(/(\d+[\.,]?\d*)\s*kg/);
    if (kgMatch) {
        const weight = parseFloat(kgMatch[1].replace(',', '.'));
        return {
            weight: weight,
            source: 'Regex (Title/Pack kg)',
            display: `${weight}kg`,
            warning: 'Weight found in title/packaging but not in weight_range or weight_grams - data quality issue'
        };
    }
    
    // Try gram pattern
    const gMatch = textToScan.match(/(\d+)\s*g\b/);
    if (gMatch) {
        const weightInGrams = parseFloat(gMatch[1]);
        const weightInKg = weightInGrams / 1000;
        return {
            weight: weightInKg,
            source: 'Regex (Title/Pack g)',
            display: `${weightInGrams}g`,
            warning: 'Weight found in title/packaging but not in weight_range or weight_grams - data quality issue'
        };
    }

    return { weight: null, source: 'None', display: null, warning: null };
}

// ==========================================
// PACKAGE WEIGHT VALIDATION
// ==========================================

/**
 * Validates package_weight against the packaging field.
 * Checks if weight mentioned in packaging text matches the package_weight field.
 * 
 * USE CASES:
 * - Detect missing package_weight when packaging mentions weight
 * - Detect mismatches between fields (data quality issue)
 * 
 * @param packaging - Packaging text (e.g., "bulk 1kg")
 * @param packageWeight - Package weight field value (e.g., "1kg")
 * @returns Validation result with display value and optional warning
 */
export function validatePackageWeight(
    packaging: string | null, 
    packageWeight: string | null
): { 
    packageWeightDisplay: string | null,
    warning: string | null 
} {
    if (!packaging || !packageWeight) {
        // Check if packaging contains weight but field is missing
        if (packaging) {
            const packagingLower = packaging.toLowerCase();
            const weightInPackaging = packagingLower.match(/(\d+[\.,]?\d*)\s*(kg|g)\b/);
            if (weightInPackaging && !packageWeight) {
                return {
                    packageWeightDisplay: null,
                    warning: `Packaging contains weight ("${packaging}") but package_weight field is missing`
                };
            }
        }
        return { packageWeightDisplay: packageWeight || null, warning: null };
    }

    // Parse the package_weight field
    const parsedPackageWeight = parseWeightRange(packageWeight);
    if (!parsedPackageWeight.valid || !parsedPackageWeight.data) {
        return { packageWeightDisplay: packageWeight, warning: null };
    }

    // Extract weight from packaging text
    const packagingLower = packaging.toLowerCase();
    const weightMatch = packagingLower.match(/(\d+[\.,]?\d*)\s*(kg|g)\b/);
    if (!weightMatch) {
        // No weight found in packaging - can't compare
        return { packageWeightDisplay: packageWeight, warning: null };
    }

    // Compare weights with 10g tolerance for rounding errors
    const packagingWeightValue = parseFloat(weightMatch[1].replace(',', '.'));
    const packagingWeightUnit = weightMatch[2];
    const packagingWeightInGrams = packagingWeightUnit === 'kg' 
        ? packagingWeightValue * 1000
        : packagingWeightValue;

    // parseWeightRange returns min/max in grams (unit is just for display)
    const packageWeightAvgInGrams = (parsedPackageWeight.data.min + parsedPackageWeight.data.max) / 2;

    const tolerance = 10; // grams
    const matches = Math.abs(packagingWeightInGrams - packageWeightAvgInGrams) <= tolerance;

    if (!matches) {
        return {
            packageWeightDisplay: packageWeight,
            warning: `Mismatch: package_weight (${packageWeight}) doesn't match packaging (${weightMatch[0]})`
        };
    }

    return {
        packageWeightDisplay: packageWeight,
        warning: null
    };
}
