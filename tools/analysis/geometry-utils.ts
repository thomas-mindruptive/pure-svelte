/**
 * Geometry utilities for estimating weight from dimensions.
 * 
 * This module provides functions to:
 * - Parse dimension strings (e.g., "50mm", "10x20x30cm", "[30mm][3mm]")
 * - Calculate bounding box volume
 * - Estimate weight using material density and form factor
 * 
 * Used as a fallback when no explicit weight data is available.
 * Results are ESTIMATES and should be treated with appropriate caution.
 */

import { getDensity, getFormFactor } from './material-densities';
import { parseDimensions } from '$lib/utils/parseUtils.js';

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
 * - Bracket notation: "[30mm][3mm]" → Uses first aspect only (e.g., pendant size, ignores hole size)
 * 
 * BRACKET NOTATION:
 * Brackets represent different aspects/components of a product:
 * - Pendant: [30mm][3mm] → [stone size][hole size] → Only first aspect used for weight
 * - Necklace: [45cm][5mm][2mm] → [length][bead size][hole] → Only first aspect used
 * 
 * UNIT HANDLING:
 * - mm (default): No conversion
 * - cm: Multiplied by 10
 * - m: Multiplied by 1000
 * 
 * FAIL FAST:
 * Throws Error if dimension format is invalid (indicates data quality issue in database)
 * 
 * @param dimStr - Dimension string to parse
 * @returns Parsed dimensions with volume, or null if parsing fails
 * @throws Error if dimension format is invalid
 * 
 * @example
 * parseDimensionsToVolume("50mm")      // → 50×50×50mm, 125cm³
 * parseDimensionsToVolume("10x20cm")   // → 100×200×100mm, 2000cm³
 * parseDimensionsToVolume("5x10x15mm") // → 5×10×15mm, 0.75cm³
 * parseDimensionsToVolume("[30mm][3mm]") // → 30×30×30mm, 27cm³ (only first aspect)
 */
export function parseDimensionsToVolume(dimStr: string): ParsedDimensions | null {
    if (!dimStr) return null;

    // Use validated parsing from parseUtils (supports bracket notation)
    const parsed = parseDimensions(dimStr);
    
    // FAIL FAST: Invalid format indicates data quality issue
    if (!parsed.valid) {
        throw new Error(
            `Invalid dimension format in database: "${dimStr}". ` +
            `Validation error: ${parsed.error || 'Unknown error'}`
        );
    }
    
    if (!parsed.data) {
        throw new Error(
            `parseDimensions returned valid=true but no data for: "${dimStr}"`
        );
    }
    
    const { data } = parsed;
    
    // Determine unit conversion factor (convert to mm)
    let factor = 1.0;
    if (data.unit === 'cm') {
        factor = 10.0;  // cm → mm
    } else if (data.unit === 'm') {
        factor = 1000.0;  // m → mm
    }
    
    let L = 0, B = 0, H = 0;
    
    // BRACKET NOTATION: Use only first aspect for weight calculation
    // Example: [30mm][3mm] → pendant size is 30mm, hole size 3mm (ignore hole)
    if (data.aspects && data.aspects.length > 0) {
        const firstAspect = data.aspects[0];
        
        // Convert first aspect's unit to mm
        const aspectFactor = firstAspect.unit === 'cm' ? 10.0 : firstAspect.unit === 'm' ? 1000.0 : 1.0;
        
        if (firstAspect.values && firstAspect.values.length > 0) {
            // Single value or multi-dimensional in first aspect
            const vals = firstAspect.values.map(v => v * aspectFactor);
            
            if (vals.length >= 3) {
                L = vals[0];
                B = vals[1];
                H = vals[2];
            } else if (vals.length === 2) {
                L = vals[0];
                B = vals[1];
                H = Math.min(L, B);
            } else {
                // Single value: assume cubic/spherical
                L = vals[0];
                B = vals[0];
                H = vals[0];
            }
        } else if (firstAspect.range) {
            // Range in first aspect: use average
            const avg = ((firstAspect.range.min + firstAspect.range.max) / 2) * aspectFactor;
            L = avg;
            B = avg;
            H = avg;
        } else if (firstAspect.multiDimRange) {
            // Multi-dimensional range: use average of each dimension
            const { min, max } = firstAspect.multiDimRange;
            const vals = min.map((minVal, i) => ((minVal + max[i]) / 2) * aspectFactor);
            
            if (vals.length >= 3) {
                L = vals[0];
                B = vals[1];
                H = vals[2];
            } else if (vals.length === 2) {
                L = vals[0];
                B = vals[1];
                H = Math.min(L, B);
            } else {
                L = vals[0];
                B = vals[0];
                H = vals[0];
            }
        }
    }
    // NORMAL NOTATION: "10x5x3mm" or "5-10mm"
    else if (data.values && data.values.length > 0) {
        const vals = data.values.map(v => v * factor);
        
        if (vals.length >= 3) {
            L = vals[0];
            B = vals[1];
            H = vals[2];
        } else if (vals.length === 2) {
            L = vals[0];
            B = vals[1];
            H = Math.min(L, B);
        } else {
            L = vals[0];
            B = vals[0];
            H = vals[0];
        }
    }
    // RANGE: "5-10mm"
    else if (data.range) {
        const avg = ((data.range.min + data.range.max) / 2) * factor;
        L = avg;
        B = avg;
        H = avg;
    }
    // MULTI-DIMENSIONAL RANGE: "10-20mm x 5-8mm"
    else if (data.multiDimRange) {
        const { min, max } = data.multiDimRange;
        const vals = min.map((minVal, i) => ((minVal + max[i]) / 2) * factor);
        
        if (vals.length >= 3) {
            L = vals[0];
            B = vals[1];
            H = vals[2];
        } else if (vals.length === 2) {
            L = vals[0];
            B = vals[1];
            H = Math.min(L, B);
        } else {
            L = vals[0];
            B = vals[0];
            H = vals[0];
        }
    } else {
        throw new Error(
            `Unable to extract dimensions from parsed data: "${dimStr}"`
        );
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
