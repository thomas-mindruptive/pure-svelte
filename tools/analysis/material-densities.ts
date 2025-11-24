/**
 * Physikalische Eigenschaften von Materialien und Formen zur Gewichtsberechnung.
 */

// Dichte in g/cm³
// Quellen: Durchschnittswerte für typische Mineralien
export const MATERIAL_DENSITIES: Record<string, number> = {
    'Amethyst': 2.65,
    'Bergkristall': 2.65,
    'Rosenquarz': 2.65,
    'Quarz': 2.65,
    'Achat': 2.60,
    'Citrin': 2.65,
    'Rauchquarz': 2.65,
    'Jaspis': 2.7,
    'Tigerauge': 2.65,
    'Obsidian': 2.4,
    'Lapislazuli': 2.7,
    'Fluorit': 3.18,
    'Calcit': 2.71,
    'Turmalin': 3.06,
    'Hämatit': 5.26, // Viel schwerer!
    'Labradorit': 2.7,
    'Mondstein': 2.57,
    'Selenit': 2.3,
    'Karneol': 2.6,
    'Aventurin': 2.65,
    'Sodalith': 2.3,
    'Amazonit': 2.56,
    'Malachit': 4.0,
    'Pyrit': 5.0,
    'Schungit': 1.9, // Kohlenstoffhaltig, leichter
    
    // Fallback
    'DEFAULT': 2.65 
};

/**
 * Formfaktor (Fill Factor)
 * Gibt an, wie viel Volumen einer Bounding-Box (L x B x H) tatsächlich vom Stein ausgefüllt wird.
 * 
 * Beispiele:
 * - Würfel: 1.0 (füllt Box komplett)
 * - Kugel: ~0.52 (4/3 * pi * r^3 / (2r)^3)
 */
export const FORM_FACTORS: Record<string, number> = {
    // Geometrische Formen
    'Kugel': 0.52,
    'Würfel': 1.0,
    'Quader': 1.0,
    'Ei': 0.6, // Ähnlich Kugel, etwas mehr Volumen in der Box
    'Pyramide': 0.33,
    'Obelisk': 0.4, // Basis + Spitze
    'Zylinder': 0.78, // pi * r^2 * h / (2r * 2r * h) -> pi/4
    'Scheibe': 0.8, // Zylinder-ähnlich
    'Donut': 0.6, // Zylinder minus Loch
    'Herz': 0.5, // Flaches Herz
    
    // Natürliche Formen
    'Rohstein': 0.6, // Unregelmäßig
    'Trommelstein': 0.65, // Abgerundet, füllt Box besser als Rohstein
    'Seifenstein': 0.7, // Flacher Trommelstein
    'Handschmeichler': 0.7,
    
    // Komplexe Formen
    'Druse': 0.4, // Viel Hohlraum
    'Geode': 0.4,
    'Cluster': 0.5, // Viel Luft zwischen Spitzen
    'Stufe': 0.5,
    
    // Fallback
    'DEFAULT': 0.6
};

export function getDensity(materialName: string): number {
    // Einfacher String-Match Versuch (Case insensitive)
    const key = Object.keys(MATERIAL_DENSITIES).find(k => materialName.toLowerCase().includes(k.toLowerCase()));
    return key ? MATERIAL_DENSITIES[key] : MATERIAL_DENSITIES['DEFAULT'];
}

export function getFormFactor(formName: string): number {
    // Einfacher String-Match Versuch
    const key = Object.keys(FORM_FACTORS).find(k => formName.toLowerCase().includes(k.toLowerCase()));
    return key ? FORM_FACTORS[key] : FORM_FACTORS['DEFAULT'];
}
