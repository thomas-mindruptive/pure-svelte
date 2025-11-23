import { type RawOffering } from './analyze-config.js';
import { parseDimensions, parseWeightRange } from '$lib/utils/parseUtils.js';

// Type for normalized offering (used for extraction functions)
type NormalizedOfferingForExtraction = {
    offeringDimensions: string | null;
    offeringWeightRange: string | null;
    offeringPackageWeight: string | null;
    offeringWeightGrams: number | null;
    offeringTitle: string;
    offeringPackaging: string | null;
};

// ==========================================
// PARSING & EXTRACTION UTILS
// ==========================================


/**
 * Wandelt Währungsstrings (z.B. "1.299,00 €") in saubere Floats um.
 * 
 * WICHTIG: Gibt 0 zurück wenn der Wert kein gültiger Preis ist (z.B. Text).
 * Dies dient als Indikator für Datenqualitätsprobleme.
 * 
 * @param val - String-Wert der geparst werden soll
 * @returns Parsed number oder 0 wenn ungültig
 */
export function parseMoney(val: string): number {
    if (!val || val === 'NULL') return 0;
    
    // Entferne Währungssymbole, Leerzeichen und tausche Komma zu Punkt
    const cleaned = val.replace(/[€$]/g, '').trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    
    // Validierung: Wenn das Ergebnis NaN ist, war der Wert kein gültiger Preis
    // WARUM: Das deutet auf ein Datenqualitätsproblem hin (z.B. Text im Preis-Feld)
    if (isNaN(parsed)) {
        return 0;
    }
    
    return parsed;
}

/**
 * Versucht das Gewicht zu ermitteln (in kg).
 * Priorität: 
 * 1. Explizite Spalte "offeringWeightGrams"
 * 2. Regex im Titel oder Verpackungstext ("1kg", "500g")
 */
export function extractWeightKg(row: RawOffering): { weight: number | null, source: string } {
    // 1. Priorität: Explizites Feld
    const rawW = parseMoney(row.offeringWeightGrams);
    if (rawW > 0) return { weight: rawW / 1000, source: 'Column (g)' };

    // 2. Priorität: Text-Mining
    const textToScan = (row.offeringTitle + ' ' + (row.offeringPackaging || '')).toLowerCase();

    // Suche nach "1.5 kg"
    const kgMatch = textToScan.match(/(\d+[\.,]?\d*)\s*kg/);
    if (kgMatch) {
        return { 
            weight: parseFloat(kgMatch[1].replace(',', '.')), 
            source: 'Regex (Title/Pack kg)' 
        };
    }
    
    // Suche nach "500 g" (Boundary \b wichtig, damit "gold" nicht matcht)
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
 * Prüft, ob im Kommentarfeld ein günstigerer Staffelpreis versteckt ist.
 * Gibt den niedrigsten gefundenen Preis zurück (oder den Listenpreis).
 */
export function getBestPrice(row: RawOffering, listPrice: number): { price: number, source: string } {
    if (!row.offeringComment || row.offeringComment === 'NULL') {
        return { price: listPrice, source: 'List' };
    }

    // Suche nach Preismustern (Zahl mit Dezimalstelle)
    const matches = row.offeringComment.match(/[\$€]?\s?(\d+[\.,]\d{2})/g);
    
    if (matches) {
        let lowest = listPrice;
        matches.forEach(m => {
            const val = parseFloat(m.replace(/[€$]/g, '').replace(',', '.'));
            // Plausibilitätscheck:
            // - Muss billiger sein als Liste
            // - > 10% des Listenpreises (Schutz vor Tippfehlern oder Maßen wie "0.5 cm")
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

/**
 * Extrahiert Dimensions (Größe) aus einem normalisierten Offering.
 * Priorität:
 * 1. offeringDimensions Feld (wenn vorhanden)
 * 2. Regex im Titel (wenn nur im Titel gefunden => Warnung)
 * 
 * @param row - Normalized offering
 * @returns Dimensions string, source, und optional warning
 */
export function extractDimensions(row: NormalizedOfferingForExtraction): { 
    dimensions: string | null, 
    source: string, 
    warning: string | null 
} {
    // 1. Priorität: Explizites Feld
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

    // 2. Priorität: Regex im Titel
    // Pattern: z.B. "20x50", "30-40mm", "10x10", "20x50cm", "30mm"
    const titleLower = row.offeringTitle.toLowerCase();
    // Suche nach Dimensionen-Pattern: 
    // - "20x50" oder "20x50cm" oder "20 x 50 cm"
    // - "30-40mm" oder "30mm"
    // - "2,1x2,7cm"
    const dimMatch = titleLower.match(/(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*(?:mm|cm|m)?/i) || 
                     titleLower.match(/(\d+[\.,]?\d*)\s*[-–]\s*(\d+[\.,]?\d*)\s*(?:mm|cm|m)/i) ||
                     titleLower.match(/(\d+[\.,]?\d*)\s*(?:mm|cm|m)\b/i);
    
    if (dimMatch) {
        // Warnung: Gefunden im Titel, aber nicht im dimensions Feld
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
 * Extrahiert Gewicht aus einem normalisierten Offering (erweitert).
 * Priorität:
 * 1. offeringWeightRange Feld
 * 2. offeringWeightGrams Feld
 * 3. Regex im Titel/Packaging (wenn nur im Titel gefunden => Warnung)
 * 
 * @param row - Normalized offering
 * @returns Weight in kg, source, display string, und optional warning
 */
export function extractWeightKgFromNormalized(row: NormalizedOfferingForExtraction): { 
    weight: number | null, 
    source: string,
    display: string | null,
    warning: string | null 
} {
    // 1. Priorität: weight_range Feld
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

    // 2. Priorität: weight_grams Feld
    if (row.offeringWeightGrams && row.offeringWeightGrams > 0) {
        const weightInKg = row.offeringWeightGrams / 1000;
        return {
            weight: weightInKg,
            source: 'Weight Grams Field',
            display: `${row.offeringWeightGrams}g`,
            warning: null
        };
    }

    // 3. Priorität: Regex im Titel/Packaging
    const textToScan = (row.offeringTitle + ' ' + (row.offeringPackaging || '')).toLowerCase();

    // Suche nach "1.5 kg"
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
    
    // Suche nach "500 g"
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

/**
 * Validiert package_weight gegen packaging Feld.
 * Prüft, ob das Gewicht im packaging-Text mit package_weight übereinstimmt.
 * 
 * @param packaging - Packaging text (z.B. "bulk 1kg")
 * @param packageWeight - Package weight string (z.B. "1kg")
 * @returns Validation result mit warning wenn mismatch
 */
export function validatePackageWeight(
    packaging: string | null, 
    packageWeight: string | null
): { 
    packageWeightDisplay: string | null,
    warning: string | null 
} {
    if (!packaging || !packageWeight) {
        // Wenn packaging Gewicht enthält, aber package_weight fehlt => Warnung
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

    // Parse package_weight
    const parsedPackageWeight = parseWeightRange(packageWeight);
    if (!parsedPackageWeight.valid || !parsedPackageWeight.data) {
        return { packageWeightDisplay: packageWeight, warning: null };
    }

    // Extrahiere Gewicht aus packaging
    const packagingLower = packaging.toLowerCase();
    const weightMatch = packagingLower.match(/(\d+[\.,]?\d*)\s*(kg|g)\b/);
    if (!weightMatch) {
        // Kein Gewicht im packaging gefunden => kein Vergleich möglich
        return { packageWeightDisplay: packageWeight, warning: null };
    }

    // Vergleiche Gewichte
    const packagingWeightValue = parseFloat(weightMatch[1].replace(',', '.'));
    const packagingWeightUnit = weightMatch[2];
    const packagingWeightInGrams = packagingWeightUnit === 'kg' 
        ? packagingWeightValue * 1000
        : packagingWeightValue;

    // parseWeightRange gibt min/max immer in Gramm zurück (unabhängig von unit)
    // unit ist nur zur Anzeige
    const packageWeightAvgInGrams = (parsedPackageWeight.data.min + parsedPackageWeight.data.max) / 2;

    // Vergleich mit Toleranz von 10g (für Rundungsfehler)
    const tolerance = 10; // in Gramm
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