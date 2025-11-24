import { getDensity, getFormFactor } from './material-densities';

interface ParsedDimensions {
    length: number; // mm
    width: number;  // mm
    height: number; // mm
    volumeCm3: number;
}

/**
 * Extrahiert Dimensionen aus einem String und berechnet die Bounding Box.
 * Erwartet Eingabe in mm oder cm. Konvertiert alles zu mm für die interne Berechnung,
 * gibt Volumen aber in cm³ zurück (da Dichte in g/cm³).
 */
export function parseDimensionsToVolume(dimStr: string): ParsedDimensions | null {
    if (!dimStr) return null;

    // Normalisiere String: Komma zu Punkt, lowercase
    const s = dimStr.toLowerCase().replace(/,/g, '.');
    
    // Regex für "10x20x30" oder "10 x 20 x 30 mm" oder "50mm"
    // Versuche 3 Zahlen zu finden
    const numbers = s.match(/(\d+(\.\d+)?)/g);
    
    if (!numbers || numbers.length === 0) return null;
    
    const vals = numbers.map(n => parseFloat(n));
    
    // Einheit erkennen (Default: mm)
    let factor = 1.0; // mm -> mm
    if (s.includes('cm')) factor = 10.0; // cm -> mm
    else if (s.includes('m') && !s.includes('mm') && !s.includes('cm')) factor = 1000.0; // m -> mm
    
    let L = 0, B = 0, H = 0;
    
    if (vals.length >= 3) {
        // 3 Dimensionen: L x B x H
        L = vals[0] * factor;
        B = vals[1] * factor;
        H = vals[2] * factor;
    } else if (vals.length === 2) {
        // 2 Dimensionen: L x B (z.B. flacher Stein), nehme an H = B (oder min(L,B))
        // Bei "10x5cm" -> L=100, B=50, H=50 (Schätzung)
        L = vals[0] * factor;
        B = vals[1] * factor;
        H = Math.min(L, B); 
    } else if (vals.length === 1) {
        // 1 Dimension: z.B. "50mm" (Kugel/Würfel)
        L = vals[0] * factor;
        B = vals[0] * factor;
        H = vals[0] * factor;
    } else {
        return null;
    }
    
    // Volumen in cm³ = (L_mm * B_mm * H_mm) / 1000
    const volCm3 = (L * B * H) / 1000.0;
    
    return {
        length: L,
        width: B,
        height: H,
        volumeCm3: volCm3
    };
}

/**
 * Berechnet das geschätzte Gewicht basierend auf Dimensionen, Material und Form.
 * @returns Gewicht in Gramm
 */
export function calculateWeightFromDimensions(
    dimStr: string | undefined, 
    materialName: string, 
    formName: string
): { weightGrams: number, trace: string } | null {
    
    if (!dimStr) return null;
    
    const dims = parseDimensionsToVolume(dimStr);
    if (!dims) return null;
    
    const density = getDensity(materialName);
    const formFactor = getFormFactor(formName);
    
    // Gewicht = Volumen * Faktor * Dichte
    const weightGrams = dims.volumeCm3 * formFactor * density;
    
    // Trace für Tooltip
    const trace = `Geom: ${Math.round(dims.length)}x${Math.round(dims.width)}x${Math.round(dims.height)}mm -> Vol: ${dims.volumeCm3.toFixed(1)}cm³ * Form(${formName}): ${formFactor} * Dens(${materialName}): ${density} = ${Math.round(weightGrams)}g`;
    
    return { weightGrams, trace };
}
