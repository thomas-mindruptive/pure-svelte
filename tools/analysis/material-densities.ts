/**
 * Physical properties of minerals and forms for weight estimation.
 * 
 * This module provides:
 * - Material densities (g/cm³) for common gemstones and minerals
 * - Form factors (fill factors) for common shapes
 * - Lookup functions for fuzzy material/form matching
 * 
 * Used by geometry-utils.ts to calculate estimated weights from dimensions.
 */

// ==========================================
// MATERIAL DENSITIES
// ==========================================

/**
 * Density values in g/cm³ for common gemstone materials.
 * Sources: Average values for typical minerals from mineralogy references.
 * 
 * NOTE: These are approximate values. Actual density can vary based on:
 * - Purity and inclusions
 * - Crystal structure variations
 * - Water content (for some minerals)
 */
export const MATERIAL_DENSITIES: Record<string, number> = {
    // Quartz family (SiO2) - most common, ~2.65 g/cm³
    'Amethyst': 2.65,
    'Bergkristall': 2.65,     // Clear quartz
    'Rosenquarz': 2.65,       // Rose quartz
    'Quarz': 2.65,            // Generic quartz
    'Citrin': 2.65,           // Citrine (heat-treated amethyst)
    'Rauchquarz': 2.65,       // Smoky quartz
    'Tigerauge': 2.65,        // Tiger's eye (quartz with iron)
    'Aventurin': 2.65,        // Aventurine (quartz with mica)
    'Karneol': 2.6,           // Carnelian (chalcedony)
    'Achat': 2.60,            // Agate (banded chalcedony)
    'Jaspis': 2.7,            // Jasper (opaque chalcedony)
    
    // Feldspar family
    'Labradorit': 2.7,        // Labradorite
    'Mondstein': 2.57,        // Moonstone
    'Amazonit': 2.56,         // Amazonite
    
    // Other silicates
    'Obsidian': 2.4,          // Volcanic glass - slightly lighter
    'Lapislazuli': 2.7,       // Lapis lazuli
    'Sodalith': 2.3,          // Sodalite - lighter
    
    // Heavy minerals
    'Fluorit': 3.18,          // Fluorite - notably heavier
    'Calcit': 2.71,           // Calcite
    'Turmalin': 3.06,         // Tourmaline - heavier
    'Hämatit': 5.26,          // Hematite - VERY heavy (iron oxide)
    'Malachit': 4.0,          // Malachite - heavy (copper)
    'Pyrit': 5.0,             // Pyrite - heavy (iron sulfide)
    
    // Special cases
    'Selenit': 2.3,           // Selenite - lighter (hydrated gypsum)
    'Schungit': 1.9,          // Shungite - lightest (carbon-based)
    
    // Fallback for unknown materials
    'DEFAULT': 2.65           // Default to quartz density
};

// ==========================================
// FORM FACTORS (FILL FACTORS)
// ==========================================

/**
 * Form factors indicating what fraction of a bounding box is filled by the shape.
 * 
 * Used to estimate actual volume from bounding box dimensions:
 * Actual Volume = Bounding Box Volume × Form Factor
 * 
 * Mathematical basis:
 * - Cube: 1.0 (fills 100% of bounding box)
 * - Sphere: 4/3 × π × r³ / (2r)³ ≈ 0.52 (fills 52% of bounding box)
 * - Cylinder: π × r² × h / (2r × 2r × h) = π/4 ≈ 0.78
 */
export const FORM_FACTORS: Record<string, number> = {
    // === GEOMETRIC SHAPES ===
    'Kugel': 0.52,            // Sphere - exact: π/6 ≈ 0.524
    'Würfel': 1.0,            // Cube - fills box completely
    'Quader': 1.0,            // Rectangular prism
    'Ei': 0.6,                // Egg - similar to sphere but elongated
    'Pyramide': 0.33,         // Pyramid - 1/3 of prism volume
    'Obelisk': 0.4,           // Obelisk - tapered prism with point
    'Zylinder': 0.78,         // Cylinder - π/4 ≈ 0.785
    'Scheibe': 0.8,           // Disc - like short cylinder
    'Donut': 0.6,             // Torus - cylinder minus center hole
    'Herz': 0.5,              // Heart - flattened shape
    
    // === NATURAL SHAPES ===
    'Rohstein': 0.6,          // Raw stone - irregular shape
    'Trommelstein': 0.65,     // Tumbled stone - rounded, fills better
    'Seifenstein': 0.7,       // Soap stone - flattened tumbled
    'Handschmeichler': 0.7,   // Palm stone - ergonomic shape
    
    // === COMPLEX SHAPES ===
    'Druse': 0.4,             // Druse - hollow cavity
    'Geode': 0.4,             // Geode - hollow
    'Cluster': 0.5,           // Cluster - air between points
    'Stufe': 0.5,             // Specimen - irregular with matrix
    
    // Fallback for unknown forms
    'DEFAULT': 0.6            // Default to natural stone estimate
};

// ==========================================
// LOOKUP FUNCTIONS
// ==========================================

/**
 * Gets the density for a material name using fuzzy matching.
 * Performs case-insensitive substring matching to find the best match.
 * 
 * @param materialName - The material name to look up (e.g., "Amethyst AA Quality")
 * @returns Density in g/cm³ (defaults to 2.65 if no match found)
 * 
 * @example
 * getDensity("Amethyst")        // → 2.65
 * getDensity("amethyst dunkel") // → 2.65 (fuzzy match)
 * getDensity("Unknown Stone")   // → 2.65 (default)
 */
export function getDensity(materialName: string): number {
    // Try to find a matching material name (case-insensitive substring match)
    const key = Object.keys(MATERIAL_DENSITIES).find(k => 
        materialName.toLowerCase().includes(k.toLowerCase())
    );
    return key ? MATERIAL_DENSITIES[key] : MATERIAL_DENSITIES['DEFAULT'];
}

/**
 * Gets the form factor for a form name using fuzzy matching.
 * Performs case-insensitive substring matching to find the best match.
 * 
 * @param formName - The form name to look up (e.g., "Kugel poliert")
 * @returns Form factor between 0 and 1 (defaults to 0.6 if no match found)
 * 
 * @example
 * getFormFactor("Kugel")           // → 0.52
 * getFormFactor("Trommelstein AB") // → 0.65 (fuzzy match)
 * getFormFactor("Custom Shape")    // → 0.6 (default)
 */
export function getFormFactor(formName: string): number {
    // Try to find a matching form name (case-insensitive substring match)
    const key = Object.keys(FORM_FACTORS).find(k => 
        formName.toLowerCase().includes(k.toLowerCase())
    );
    return key ? FORM_FACTORS[key] : FORM_FACTORS['DEFAULT'];
}
