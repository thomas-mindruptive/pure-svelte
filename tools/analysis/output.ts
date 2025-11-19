import * as fs from 'fs';
import * as path from 'path';
import { type AuditRow, OUTPUT_DIR } from './analyze-config.js';

/**
 * Speichert einen beliebigen Text-Inhalt in eine Datei im Report-Ordner.
 */
export function saveReportFile(filename: string, content: string) {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const fullPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(fullPath, content, 'utf-8');
    
    console.log(`✅ Report gespeichert: ${fullPath}`);
}

/**
 * Konsolen-Output für schnellen Überblick
 */
export function printConsoleSummary(data: AuditRow[]) {
    console.log('\n📊 AUDIT SUMMARY (Top 10 Entries)');
    
    // Mapping für lesbare Konsolen-Ausgabe
    const displayTable = data.slice(0, 10).map(r => ({
        'Grp': r.Group_Key.length > 20 ? r.Group_Key.substring(0, 17) + '...' : r.Group_Key,
        'Händler': r.Wholesaler.substring(0, 15),
        'Land': r.Origin_Country,
        'Norm. €': r.Final_Normalized_Price,
        'Unit': r.Unit,
        'Info': r.Calculation_Trace.includes('Import') ? '✈️ Import' : 'EU'
    }));

    console.table(displayTable);
    console.log(`... und ${data.length - 10} weitere Zeilen.`);
}