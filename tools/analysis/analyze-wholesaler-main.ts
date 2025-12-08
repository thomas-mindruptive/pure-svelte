/**
 * Main entry point for the wholesaler price analysis CLI tool.
 * 
 * This script:
 * 1. Loads offering data from the database (or CSV as fallback)
 * 2. Transforms offerings into normalized comparison data
 * 3. Generates Markdown and CSV reports
 * 
 * USAGE:
 * npx tsx tools/analysis/analyze-wholesaler-main.ts
 * 
 * OUTPUT:
 * Reports are saved to: C:/dev/pure/pureenergy-schema/reports/
 * - report.md          (grouped by use case)
 * - report_by_stone.md (grouped by material)
 * - report_by_product_type.md (grouped by product type)
 * - audit_log.md                (detailed audit trail)
 * - *.csv versions of each report
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { log } from '$lib/utils/logger.js';
import { analyzeOfferingsFromDb, analyzeOfferingsFromCsv } from './analyze-wholesaler.js';
import { ReportBuilder } from './report-builder.js';

// ESM workaround for __dirname (not available in ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// SCRIPT ENTRY POINT
// ==========================================

/**
 * Main async function that runs the analysis.
 * 
 * DATA SOURCE OPTIONS:
 * - analyzeOfferingsFromDb(): Loads directly from database (default)
 * - analyzeOfferingsFromCsv(): Loads from CSV export file (fallback)
 * 
 * To switch to CSV mode:
 * 1. Uncomment analyzeOfferingsFromCsv()
 * 2. Comment out analyzeOfferingsFromDb()
 */
(async () => {
    try {
        log.info('Starting wholesaler price analysis...');
        
        // === DATABASE MODE (default) ===
        // Loads offerings directly from the database for most up-to-date data
        await analyzeOfferingsFromDb();
        
        // === CSV MODE (fallback) ===
        // Uncomment this line and comment out analyzeOfferingsFromDb() above
        // to analyze from a CSV export instead:
        // analyzeOfferingsFromCsv();
        
        // Explicit exit after successful completion
        // REASON: Ensures Node.js process terminates cleanly even if
        // database connection pool doesn't close immediately
        log.info('Analysis complete, exiting...');
        process.exit(0);
        
    } catch (error) {
        // Log error details and exit with failure code
        log.error('Fatal error in analysis script', { error });
        process.exit(1);
    }
})();
