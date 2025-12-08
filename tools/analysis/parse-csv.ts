/**
 * CSV parsing utility for reading offering data exports.
 * 
 * Handles CSV quirks like:
 * - Quoted fields containing commas
 * - Various quote styles
 * - Empty fields defaulting to 'NULL'
 */

import type { RawOffering } from "./analyze-config";

// ==========================================
// CSV PARSING
// ==========================================

/**
 * Parses CSV text into an array of RawOffering objects.
 * 
 * FEATURES:
 * - Handles commas inside quoted fields correctly
 * - Strips leading/trailing quotes from values
 * - Maps headers to object properties
 * - Defaults empty values to 'NULL'
 * 
 * ALGORITHM:
 * Uses regex with lookahead to split on commas only when followed
 * by an even number of quotes (i.e., not inside a quoted field).
 * 
 * @param text - Raw CSV file content as string
 * @returns Array of parsed RawOffering objects
 * 
 * @example
 * const csv = `name,price,comment
 * "Stone A","12.50","includes, comma"
 * "Stone B","8.00","no comma"`;
 * 
 * parseCSV(csv);
 * // → [
 * //   { name: "Stone A", price: "12.50", comment: "includes, comma" },
 * //   { name: "Stone B", price: "8.00", comment: "no comma" }
 * // ]
 */
export function parseCSV(text: string): RawOffering[] {
    // Split into lines and handle empty input
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];  // Need at least header + 1 data row

    // Parse header row - strip quotes and whitespace
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const result: RawOffering[] = [];

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;  // Skip empty lines

        // ROBUST SPLIT: Split on comma, but NOT inside quoted fields
        // The regex lookahead (?=...) checks that there's an even number
        // of quotes following the comma (meaning we're outside a quoted field)
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => {
            // Strip leading/trailing quotes and whitespace from each value
            return val.trim().replace(/^"|"$/g, '');
        });

        // Map values to headers, creating the object
        const obj: any = {};
        headers.forEach((header, index) => {
            // Default to 'NULL' for missing values (consistent with DB export format)
            obj[header] = values[index] || 'NULL';
        });
        
        result.push(obj as RawOffering);
    }
    
    return result;
}
