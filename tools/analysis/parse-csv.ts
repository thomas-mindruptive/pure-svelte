import type { RawOffering } from "./analyze-config";

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
