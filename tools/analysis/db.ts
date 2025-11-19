import { loadOfferingsFromEnrichedView } from "$lib/backendQueries/entityOperations/offering";
import { db } from "$lib/backendQueries/db";
import { CSV_FILENAME } from "./analyze-config";
import * as fs from 'fs';
import * as path from 'path';

async function exportToCsv() {
    console.log('Connecting to DB...');
    const pool = await db;
    const transaction = pool.transaction();
    
    try {
        await transaction.begin();
        console.log('Loading enriched offerings...');
        
        // Load all data from the enriched view
        const rows = await loadOfferingsFromEnrichedView(transaction);
        console.log(`Loaded ${rows.length} rows.`);

        if (rows.length === 0) {
            console.warn('No data found to export.');
            return;
        }

        // Generate CSV content
        console.log('Generating CSV...');
        
        // Extract headers from the first row
        const headers = Object.keys(rows[0]);
        
        // Create header line
        const headerLine = headers.join(',');
        
        // Create data lines
        const dataLines = rows.map(row => {
            return headers.map(header => {
                const val = row[header];
                
                if (val === null || val === undefined) {
                    return '';
                }
                
                // Escape special characters
                // WICHTIG: Newlines entfernen, da der simple CSV-Parser in parser-utils.ts Zeilenumbrüche
                // als neue Datensätze interpretiert (auch innerhalb von Quotes).
                let strVal = String(val).replace(/[\r\n]+/g, ' ');

                // Wenn Komma oder Quote enthalten -> in Quotes setzen und interne Quotes escapen
                if (strVal.includes(',') || strVal.includes('"')) {
                    return `"${strVal.replace(/"/g, '""')}"`;
                }
                return strVal;
            }).join(',');
        });

        const csvContent = [headerLine, ...dataLines].join('\n');

        // Write to file
        console.log(`Writing to ${CSV_FILENAME}...`);
        
        // Ensure directory exists
        const dir = path.dirname(CSV_FILENAME);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(CSV_FILENAME, csvContent, 'utf-8');
        console.log('Export successful!');

        await transaction.commit();
    } catch (err) {
        console.error('Export failed:', err);
        await transaction.rollback();
        process.exit(1);
    } finally {
        // Close connection logic if needed, though often pool handles it.
        // For a script, we might want to exit explicitly.
        process.exit(0);
    }
}

exportToCsv();
