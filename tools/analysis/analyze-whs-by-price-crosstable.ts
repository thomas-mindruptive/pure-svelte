import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 1. IMPORTS: Konfiguration & Interfaces
// Wichtig: In ESM TypeScript müssen lokale Imports die Endung .js haben
import { 
    CSV_FILENAME, 
    IMPORT_MARKUP, 
    EU_ZONE, 
    STRATEGY_MAP, 
    type RawOffering, 
    type AuditRow 
} from './analyze-config.js';

// 2. IMPORTS: Report Builder & Output
import { 
    buildAuditMarkdown, 
    buildBestBuyMarkdown 
} from './report-builder.js';

import { 
    saveReportFile, 
    printConsoleSummary 
} from './output.js';

// Workaround für __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 3. HELPER FUNKTIONEN (Business Logik)
// ==========================================

/**
 * Liest CSV ein und mappt sie auf das RawOffering Interface.
 * Behandelt Anführungszeichen korrekt.
 */
function parseCSV(text: string): RawOffering[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    // Header bereinigen (Quotes entfernen)
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const result: RawOffering[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Regex Split: Trennt bei Komma, außer das Komma ist in Quotes
        const rowData = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        
        // Fallback für einfaches Split, falls Regex keine Matches liefert (leere Zeilen etc.)
        const values = rowData 
            ? rowData.map(v => v.replace(/^"|"$/g, '').trim()) 
            : line.split(',');

        const obj: any = {};
        headers.forEach((header, index) => {
            // 'NULL' Strings in echte leere Strings oder Nichts wandeln, falls nötig
            // Hier behalten wir 'NULL' Strings bei, filtern sie aber später
            obj[header] = values[index] || 'NULL';
        });
        result.push(obj as RawOffering);
    }
    return result;
}

/**
 * Wandelt Währungsstrings in saubere Floats um.
 */
function parseMoney(val: string): number {
    if (!val || val === 'NULL') return 0;
    // Entferne €, $, Leerzeichen und tausche Komma zu Punkt
    return parseFloat(val.replace(/[€$]/g, '').replace(',', '.'));
}

/**
 * Versucht das Gewicht zu ermitteln.
 * Priorität: 1. Spalte "WeightGrams" -> 2. Regex im Titel/Verpackung
 */
function extractWeightKg(row: RawOffering): { weight: number | null, source: string } {
    // 1. Priorität: Explizites Feld
    const rawW = parseMoney(row.offeringWeightGrams);
    if (rawW > 0) return { weight: rawW / 1000, source: 'Column (g)' };

    // 2. Priorität: Text-Mining
    const textToScan = (row.offeringTitle + ' ' + (row.offeringPackaging || '')).toLowerCase();

    // Suche nach "1.5 kg" oder "1kg"
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
 */
function getBestPrice(row: RawOffering, listPrice: number): { price: number, source: string } {
    if (!row.offeringComment || row.offeringComment === 'NULL') {
        return { price: listPrice, source: 'List' };
    }

    // Suche nach Preismustern (Zahl mit Dezimalstelle oder Währungssymbol)
    // Regex fängt z.B. "2.55" in "Bulk 50+ 2.55"
    const matches = row.offeringComment.match(/[\$€]?\s?(\d+[\.,]\d{2})/g);
    
    if (matches) {
        let lowest = listPrice;
        matches.forEach(m => {
            const val = parseFloat(m.replace(/[€$]/g, '').replace(',', '.'));
            // Plausibilitätscheck:
            // - Muss billiger sein als Liste
            // - Darf nicht fast 0 sein (z.B. Fehlerkennung von Maßen wie "0.50 cm")
            // - Sollte > 10% des Listenpreises sein (Schutz vor Tippfehlern)
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

// ==========================================
// 4. MAIN LOGIK: KARTESISCHES PRODUKT
// ==========================================

function createAuditTable() {
    // Pfad auflösen
    const filePath = path.isAbsolute(CSV_FILENAME) 
        ? CSV_FILENAME 
        : path.join(__dirname, CSV_FILENAME);
    
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Datei nicht gefunden: ${filePath}`);
        process.exit(1);
    }

    // Daten lesen
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rawData = parseCSV(fileContent);
    console.log(`📥 ${rawData.length} Zeilen eingelesen.`);

    // --- TRANSFORMATION START ---
    const auditData: AuditRow[] = rawData
        .filter(r => r.wholesalerName !== 'pureEnergy') // Filter: Dubletten entfernen
        .map((row, index) => {
            const trace: string[] = [];
            
            // A. Basis-Preis Ermittlung
            const listPrice = parseMoney(row.offeringPrice);
            const priceInfo = getBestPrice(row, listPrice);
            
            if (priceInfo.source !== 'List') {
                trace.push(`💰 Bulk Found: ${priceInfo.price.toFixed(2)} (was ${listPrice})`);
            }

            // B. Landed Cost (Zoll & Import)
            const country = (row.wholesalerCountry && row.wholesalerCountry !== 'NULL') 
                ? row.wholesalerCountry.toUpperCase() 
                : 'UNKNOWN';
            
            const isEu = EU_ZONE.has(country);
            let markupPct = 0;
            let effectivePrice = priceInfo.price;

            if (isEu) {
                trace.push(`🌍 Origin: ${country} (EU)`);
            } else {
                markupPct = (IMPORT_MARKUP - 1) * 100;
                effectivePrice = priceInfo.price * IMPORT_MARKUP;
                trace.push(`✈️ Origin: ${country} (+${markupPct}% Markup applied)`);
            }

            // C. Gewicht & Strategie-Wahl
            const weightInfo = extractWeightKg(row);
            if (weightInfo.source !== 'None') {
                trace.push(`⚖️ Weight: ${weightInfo.weight}kg [${weightInfo.source}]`);
            }

            let strategy: 'WEIGHT' | 'UNIT' = 'UNIT';
            // Suche Strategie basierend auf Use-Case (productTypeName)
            const preset = STRATEGY_MAP[row.productTypeName] || 'AUTO';

            if (preset === 'WEIGHT') {
                strategy = 'WEIGHT';
                trace.push(`⚙️ Strat: FORCE WEIGHT (by Type)`);
            } else if (preset === 'UNIT') {
                strategy = 'UNIT';
                trace.push(`⚙️ Strat: FORCE UNIT (by Type)`);
            } else {
                // AUTO Mode
                if (weightInfo.weight !== null) {
                    strategy = 'WEIGHT';
                    trace.push(`⚙️ Strat: AUTO -> WEIGHT (Weight found)`);
                } else {
                    strategy = 'UNIT';
                    trace.push(`⚙️ Strat: AUTO -> UNIT (No Weight)`);
                }
            }

            // D. Normalisierung (Der finale Vergleichspreis)
            let finalNormalizedPrice = 0;
            let unitLabel: AuditRow['Unit'] = '€/Stk';

            if (strategy === 'WEIGHT') {
                if (weightInfo.weight && weightInfo.weight > 0) {
                    finalNormalizedPrice = effectivePrice / weightInfo.weight;
                    unitLabel = '€/kg';
                } else {
                    finalNormalizedPrice = 999999; // Penalty für fehlendes Gewicht
                    unitLabel = 'ERR';
                    trace.push(`❌ ERROR: Strategy is WEIGHT but no weight found!`);
                }
            } else {
                finalNormalizedPrice = effectivePrice;
                unitLabel = '€/Stk';
            }

            // Ergebnis-Objekt zusammenbauen
            return {
                Row_ID: (index + 1).toString(),
                Group_Key: `${row.productTypeName} > ${row.finalMaterialName} > ${row.finalFormName}`,
                Wholesaler: row.wholesalerName,
                Origin_Country: country,
                Product_Title: row.offeringTitle.substring(0, 50), // Kürzen für Lesbarkeit
                
                Raw_Price_List: listPrice,
                Raw_Weight_Input: row.offeringWeightGrams !== 'NULL' ? row.offeringWeightGrams : '-',
                
                Detected_Bulk_Price: priceInfo.price,
                Detected_Weight_Kg: weightInfo.weight,
                Applied_Markup_Pct: markupPct,
                
                Final_Normalized_Price: parseFloat(finalNormalizedPrice.toFixed(2)),
                Unit: unitLabel,
                
                Calculation_Trace: trace.join(' | ')
            };
        });
    // --- TRANSFORMATION ENDE ---

    // 4. Sortieren (Erst nach Gruppe, dann nach Preis aufsteigend)
    const sortedData = auditData.sort((a, b) => {
        if (a.Group_Key < b.Group_Key) return -1;
        if (a.Group_Key > b.Group_Key) return 1;
        return a.Final_Normalized_Price - b.Final_Normalized_Price;
    });

    // 5. Reports erstellen (Via Builder Pattern)
    const auditMarkdown = buildAuditMarkdown(sortedData);
    const bestBuyMarkdown = buildBestBuyMarkdown(sortedData);

    // 6. Output speichern (Via Output Modul)
    console.log(`\n✅ Daten verarbeitet. Erstelle Reports...`);
    
    printConsoleSummary(sortedData);
    
    saveReportFile('audit_log.md', auditMarkdown);
    saveReportFile('best_buy_report.md', bestBuyMarkdown);
}

// Script starten
createAuditTable();