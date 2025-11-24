import * as path from 'path';
import { fileURLToPath } from 'url';
import { log } from '$lib/utils/logger.js';
import { analyzeOfferingsFromDb, analyzeOfferingsFromCsv } from './analyze-wholesaler.js';
import { ReportBuilder } from './md-report-builder.js';

// Workaround für __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Script entry point
// WHY: Execute async function and handle exit properly
//      If CSV mode is needed, uncomment analyzeOfferingsFromCsv() and comment analyzeOfferingsFromDb()
(async () => {
    try {
        // analyzeOfferingsFromCsv(); // Uncomment for CSV mode
        await analyzeOfferingsFromDb();
        
        // Explicit exit after successful completion
        // WHY: Ensures Node.js process terminates even if connection pool doesn't close immediately
        log.info('Analysis complete, exiting...');
        process.exit(0);
    } catch (error) {
        log.error('Fatal error in analysis script', { error });
        process.exit(1);
    }
})();

