import { type RawOffering } from './analyze-config.js';

// ==========================================
// PARSING & EXTRACTION UTILS
// ==========================================

/**
 * Liest CSV-Text ein und mappt sie auf das RawOffering Interface.
 * Nutzt einen robusten Split-Algorithmus, der Kommas innerhalb von 
 * Anführungszeichen ignoriert.
 */
export function parseCSV(text: string): RawOffering[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    // Header bereinigen (Quotes entfernen)
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const result: RawOffering[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Robustes Splitting: Trenne bei Komma, aber NICHT innerhalb von Quotes
        // Regex Lookahead prüft auf gerade Anzahl nachfolgender Anführungszeichen
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => {
            return val.trim().replace(/^"|"$/g, '');
        });

        const obj: any = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || 'NULL';
        });
        result.push(obj as RawOffering);
    }
    return result;
}

/**
 * Wandelt Währungsstrings (z.B. "1.299,00 €") in saubere Floats um.
 */
export function parseMoney(val: string): number {
    if (!val || val === 'NULL') return 0;
    // Entferne Währungssymbole, Leerzeichen und tausche Komma zu Punkt
    return parseFloat(val.replace(/[€$]/g, '').replace(',', '.'));
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