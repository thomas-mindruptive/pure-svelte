/**
 * Output utilities for saving reports and displaying summaries.
 * 
 * This module provides:
 * - File saving with automatic directory creation
 * - Console summary output for quick overview
 */

import * as fs from 'fs';
import * as path from 'path';
import { type ReportRow, OUTPUT_DIR } from './analyze-config.js';

// ==========================================
// FILE OUTPUT
// ==========================================

/**
 * Saves content to a file in the report output directory.
 * Creates the directory if it doesn't exist.
 * Overwrites existing files with the same name.
 * 
 * @param filename - Name of the file to create (e.g., "report.md")
 * @param content - Content to write to the file
 * 
 * @example
 * saveReportFile("report.md", "# My Report\n...");
 * // Creates: C:/dev/pure/pureenergy-schema/reports/report.md
 */
export function saveReportFile(filename: string, content: string) {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const fullPath = path.join(OUTPUT_DIR, filename);

    // Add BOM to open correctly in excel.
    const outputContent = filename.endsWith('.csv') ? '\ufeff' + content : content;
    
    // Write file with explicit overwrite flag
    fs.writeFileSync(fullPath, outputContent, { encoding: 'utf-8', flag: 'w' });
    
    console.log(`✅ Report saved: ${fullPath}`);
}

// ==========================================
// CONSOLE OUTPUT
// ==========================================

/**
 * Prints a summary table to the console for quick overview.
 * Shows the first 10 entries with key information.
 * 
 * Useful for:
 * - Quick verification that analysis ran correctly
 * - Spotting obvious issues (e.g., all prices showing as ERR)
 * - Getting a feel for the data distribution
 * 
 * @param data - Array of report rows to summarize
 * 
 * @example
 * printConsoleSummary(reportRows);
 * // Console output:
 * // 📊 AUDIT SUMMARY (Top 10 Entries)
 * // ┌─────────┬──────────┬─────┬──────────┬──────┬─────────┐
 * // │ Grp     │ Händler  │ Land│ Norm. €  │ Unit │ Info    │
 * // ├─────────┼──────────┼─────┼──────────┼──────┼─────────┤
 * // │ ...     │ ...      │ DE  │ 12.50    │ €/kg │ EU      │
 * // └─────────┴──────────┴─────┴──────────┴──────┴─────────┘
 */
export function printConsoleSummary(data: ReportRow[]) {
    console.log('\n📊 AUDIT SUMMARY (Top 10 Entries)');
    
    // Transform data for readable console output
    const displayTable = data.slice(0, 10).map(r => ({
        // Build composite group key for display
        'Grp': `${r.Product_Type} > ${r.Material_Name}`.substring(0, 20),
        // Truncate long wholesaler names
        'Händler': r.Wholesaler.substring(0, 15),
        // Country code
        'Land': r.Origin_Country,
        // Normalized price (2 decimal places)
        'Norm. €': r.Final_Normalized_Price,
        // Unit (€/kg or €/Stk)
        'Unit': r.Unit,
        // Quick indicator: Import or EU
        'Info': r.Calculation_Trace.includes('Import') ? '✈️ Import' : 'EU'
    }));

    // Use console.table for formatted output
    console.table(displayTable);
    
    // Show count of remaining entries
    console.log(`... and ${data.length - 10} more entries.`);
}
