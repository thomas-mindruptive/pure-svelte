import { loadOfferingsFromEnrichedView } from "$lib/backendQueries/entityOperations/offering";
import { db } from "$lib/backendQueries/db";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts potential bulk prices from offering comments and saves them to a CSV file for review.
 * Does NOT perform database updates.
 * 
 * Usage:
 * npm run an:extract-bulk
 */

import sql from 'mssql';

// Configuration
const UPDATE_DB = false; // Set to true to apply changes to database
const OUT_FILE = 'tools/analysis/bulk-prices-review.csv';

async function main() {
    console.log('🔌 Connecting to DB...');
    const pool = await db;
    const transaction = pool.transaction();

    try {
        await transaction.begin();
        console.log('📥 Loading offerings...');
        
        const rows = await loadOfferingsFromEnrichedView(transaction);
        console.log(`✅ Loaded ${rows.length} offerings.`);

        const candidates = [];

        for (const row of rows) {
            // Check both potential field names depending on how loadOfferingsFromEnrichedView maps data
            // Based on domainTypes, it might be 'wioComment' or 'offeringComment'
            const comment = row.offeringComment || (row as any)['wioComment'];
            const offeringId = row.offeringId;
            const title = row.offeringTitle || (row as any)['wioTitle'] || 'Untitled';
            const supplier = row.wholesalerName;

            if (!comment || typeof comment !== 'string') {
                continue;
            }

            // Extract bulk prices
            const bulkPrices = extractBulkPrices(comment);
            
            if (bulkPrices.length > 0) {
                const bulkString = bulkPrices.join('\n'); // Will be quoted in CSV
                
                candidates.push({
                    offeringId,
                    supplier,
                    title,
                    originalComment: comment,
                    bulkString
                });
            }
        }

        console.log(`📝 Found ${candidates.length} candidates with potential bulk prices.`);
        
        // Always write review CSV
        writeReviewCsv(candidates);

        // Update DB if configured
        if (UPDATE_DB) {
            await updateDatabase(transaction, candidates);
        } else {
            console.log('ℹ️  DB Update skipped (UPDATE_DB = false). Set UPDATE_DB = true to apply changes.');
        }

        await transaction.commit();

    } catch (err) {
        console.error('❌ Error:', err);
        await transaction.rollback();
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

function writeReviewCsv(candidates: any[]) {
    console.log(`💾 Writing to ${OUT_FILE}...`);
    
    // Ensure directory exists
    const dir = path.dirname(OUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const csvRows = [];
    csvRows.push(['Offering_ID', 'Supplier', 'Title', 'Original_Comment', 'Extracted_Bulk_String', 'Status'].join(','));

    for (const c of candidates) {
        const cols = [
            String(c.offeringId),
            escapeCsv(c.supplier),
            escapeCsv(c.title),
            escapeCsv(c.originalComment.substring(0, 100).replace(/[\r\n]+/g, ' ') + (c.originalComment.length > 100 ? '...' : '')), 
            escapeCsv(c.bulkString),
            'REVIEW_NEEDED'
        ];
        csvRows.push(cols.join(','));
    }

    fs.writeFileSync(OUT_FILE, csvRows.join('\n'), 'utf-8');
    console.log('🎉 CSV created! Please open in Excel/Numbers to verify.');
}

async function updateDatabase(transaction: sql.Transaction, candidates: any[]) {
    console.log('🚀 Starting DB Update...');
    let updatedCount = 0;

    for (const c of candidates) {
        const request = new sql.Request(transaction);
        request.input('bp', sql.NVarChar, c.bulkString);
        request.input('oid', sql.Int, c.offeringId);
        
        // We overwrite existing bulk_prices as discussed (one-time migration / correction)
        await request.query(`
            UPDATE wholesaler_item_offerings 
            SET bulk_prices = @bp 
            WHERE offering_id = @oid
        `);
        updatedCount++;
    }
    console.log(`✅ Updated ${updatedCount} records in database.`);
}

// Helper to escape values for CSV
function escapeCsv(str: string | null): string {
    if (!str) return '';
    // If value contains comma, double quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Extraction logic
function extractBulkPrices(comment: string): string[] {
    const prices: string[] = [];
    
    // Normalize newlines
    const lines = comment.split(/\r?\n/);
    
    // 1. Tabular Format: "Bulk 3 - 10 €7.26"
    // Captures: Min, Max (optional), Price
    const tableRegex = /^(?:Bulk|Price|\s)*(\d+)\s*[-–]\s*(\d+|\+|ß)?\s*(?:Stück|pcs)?\s*.*?(?:€|EUR|\$)\s*([\d,\.]+)/i;
    
    // 2. "Ab X" Format: "Ab 5 Stück: € 9,80"
    // Captures: Amount, Unit, Price
    const abRegex = /ab\s+(\d+(?:[\.,]\d+)?)\s*(stk|stück|pcs|kg|g|set|box|pack)\s*[:]?\s*(?:[\d,\.]+\s*€)?\s*[:]?\s*(?:€|EUR|\$)?\s*([\d,\.]+)/i;

    // 3. Discount Table: "5 - 9 25% 1,49 €"
    // Captures: Min, Max, Price, Discount
    const discountTableRegex = /^\s*(\d+)\s*[-–]\s*(\d+|\+)\s*(\d+%)\s*([\d,\.]+)\s*(?:€|EUR)/i;

    // 4. Colon List: "10: 19€" (inline)
    const colonRegex = /(\d+)\s*:\s*([\d,\.]+)\s*(?:€|EUR)/gi;

    for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.length < 4) continue;

        // Try Strategy 3 (Discount Table) - Most specific first
        let match = cleanLine.match(discountTableRegex);
        if (match) {
            const min = match[1];
            const discount = match[3];
            const priceVal = parseFloat(match[4].replace(',', '.'));
            
            if (!isNaN(priceVal)) {
                // Format: Min|Unit|Price|Info
                prices.push(`${min}|Stk|${priceVal.toFixed(2)}|-${discount}`);
                continue;
            }
        }

        // Try Strategy 1 (Tabular)
        match = cleanLine.match(tableRegex);
        if (match) {
            const min = match[1];
            const priceVal = parseFloat(match[3].replace(',', '.'));
            
            if (!isNaN(priceVal)) {
                prices.push(`${min}|Stk|${priceVal.toFixed(2)}`);
                continue;
            }
        }

        // Try Strategy 2 ("Ab X")
        match = cleanLine.match(abRegex);
        if (match) {
            const amount = match[1];
            const unit = normalizeUnit(match[2]);
            const priceVal = parseFloat(match[3].replace(',', '.'));
            
            if (!isNaN(priceVal)) {
                prices.push(`${amount}|${unit}|${priceVal.toFixed(2)}`);
                continue;
            }
        }
    }

    // Try Strategy 4 (Colon List - fallback)
    if (prices.length === 0 && (comment.includes(':') || comment.includes('Stück'))) {
        let match;
        while ((match = colonRegex.exec(comment)) !== null) {
            const min = match[1];
            const priceVal = parseFloat(match[2].replace(',', '.'));
            
            if (parseInt(min) < 1000 && !isNaN(priceVal)) {
                 const entry = `${min}|Stk|${priceVal.toFixed(2)}`;
                 if (!prices.includes(entry)) {
                     prices.push(entry);
                 }
            }
        }
    }

    return [...new Set(prices)];
}

function normalizeUnit(u: string): string {
    if (!u) return 'Stk';
    u = u.toLowerCase();
    if (u.match(/stk|stück|pcs/)) return 'Stk';
    if (u === 'kg' || u.includes('kilogram')) return 'kg';
    if (u.match(/g|gramm/)) return 'g';
    if (u.match(/set|box|pack|ve/)) return 'Set';
    return u;
}

main();
