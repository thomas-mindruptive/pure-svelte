/**
 * Geometry utilities for estimating weight from dimensions.
 * 
 * This module provides functions to:
 * - Parse dimension strings (e.g., "50mm", "10x20x30cm")
 * - Calculate bounding box volume
 * - Estimate weight using material density and form factor
 * 
 * Used as a fallback when no explicit weight data is available.
 * Results are ESTIMATES and should be treated with appropriate caution.
 */

import { getDensity, getFormFactor } from './material-densities';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

/**
 * Parsed dimension data with calculated volume.
 * All linear dimensions are in millimeters for internal consistency.
 */
interface ParsedDimensions {
    length: number;     // Length in mm
    width: number;      // Width in mm
    height: number;     // Height in mm
    volumeCm3: number;  // Bounding box volume in cm³
}

// ==========================================
// DIMENSION PARSING
// ==========================================

/**
 * Parses a dimension string and calculates the bounding box volume.
 * 
 * SUPPORTED FORMATS:
 * - Single value: "50mm", "5cm" → Cube (L=B=H)
 * - Two values: "10x20cm" → L×B with H=min(L,B)
 * - Three values: "10x20x30mm" → L×B×H
 * 
 * UNIT HANDLING:
 * - mm (default): No conversion
 * - cm: Multiplied by 10
 * - m: Multiplied by 1000
 * 
 * @param dimStr - Dimension string to parse
 * @returns Parsed dimensions with volume, or null if parsing fails
 * 
 * @example
 * parseDimensionsToVolume("50mm")      // → 50×50×50mm, 125cm³
 * parseDimensionsToVolume("10x20cm")   // → 100×200×100mm, 2000cm³
 * parseDimensionsToVolume("5x10x15mm") // → 5×10×15mm, 0.75cm³
 */
export function parseDimensionsToVolume(dimStr: string): ParsedDimensions | null {
    if (!dimStr) return null;

    // Normalize: comma to dot, lowercase for unit matching
    const s = dimStr.toLowerCase().replace(/,/g, '.');
    
    // Extract all numeric values from the string
    const numbers = s.match(/(\d+(\.\d+)?)/g);
    
    if (!numbers || numbers.length === 0) return null;
    
    const vals = numbers.map(n => parseFloat(n));
    
    // Determine unit conversion factor (default: mm)
    let factor = 1.0;
    if (s.includes('cm')) {
        factor = 10.0;  // cm → mm
    } else if (s.includes('m') && !s.includes('mm') && !s.includes('cm')) {
        factor = 1000.0;  // m → mm
    }
    
    let L = 0, B = 0, H = 0;
    
    if (vals.length >= 3) {
        // Three dimensions: L × B × H
        L = vals[0] * factor;
        B = vals[1] * factor;
        H = vals[2] * factor;
    } else if (vals.length === 2) {
        // Two dimensions: L × B, estimate H as min(L, B)
        // This is a reasonable assumption for flat stones
        L = vals[0] * factor;
        B = vals[1] * factor;
        H = Math.min(L, B); 
    } else if (vals.length === 1) {
        // Single dimension: Assume cubic/spherical (L = B = H)
        L = vals[0] * factor;
        B = vals[0] * factor;
        H = vals[0] * factor;
    } else {
        return null;
    }
    
    // Calculate volume in cm³
    // Formula: (L_mm × B_mm × H_mm) / 1000 = volume_cm³
    const volCm3 = (L * B * H) / 1000.0;
    
    return {
        length: L,
        width: B,
        height: H,
        volumeCm3: volCm3
    };
}

// ==========================================
// WEIGHT CALCULATION
// ==========================================

/**
 * Calculates estimated weight from dimensions, material, and form.
 * 
 * CALCULATION FORMULA:
 * Weight = BoundingBoxVolume × FormFactor × Density
 * 
 * WHERE:
 * - BoundingBoxVolume: L × B × H in cm³
 * - FormFactor: How much of the bounding box is filled (0-1)
 * - Density: Material density in g/cm³
 * 
 * ACCURACY NOTE:
 * This is an ESTIMATE. Actual weight can vary significantly due to:
 * - Irregular shapes not matching form factor
 * - Material density variations
 * - Inclusions, cavities, or coatings
 * 
 * @param dimStr - Dimension string (e.g., "50mm", "10x20cm")
 * @param materialName - Material name for density lookup
 * @param formName - Form name for form factor lookup
 * @returns Object with weight in grams and trace string, or null if calculation fails
 * 
 * @example
 * calculateWeightFromDimensions("50mm", "Amethyst", "Kugel")
 * // → { weightGrams: 172, trace: "Geom: 50×50×50mm → Vol: 125cm³ × Form(Kugel): 0.52 × Dens(Amethyst): 2.65 = 172g" }
 */
export function calculateWeightFromDimensions(
    dimStr: string | undefined, 
    materialName: string, 
    formName: string
): { weightGrams: number, trace: string } | null {
    
    if (!dimStr) return null;
    
    // Parse dimensions to get bounding box volume
    const dims = parseDimensionsToVolume(dimStr);
    if (!dims) return null;
    
    // Look up physical properties
    const density = getDensity(materialName);       // g/cm³
    const formFactor = getFormFactor(formName);     // 0-1
    
    // Calculate estimated weight
    // Weight (g) = Volume (cm³) × FormFactor × Density (g/cm³)
    const weightGrams = dims.volumeCm3 * formFactor * density;
    
    // Build human-readable trace for tooltip/debugging
    const trace = `Geom: ${Math.round(dims.length)}x${Math.round(dims.width)}x${Math.round(dims.height)}mm -> Vol: ${dims.volumeCm3.toFixed(1)}cm³ * Form(${formName}): ${formFactor} * Dens(${materialName}): ${density} = ${Math.round(weightGrams)}g`;
    
    return { weightGrams, trace };
}
