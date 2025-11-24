import { type ReportRow } from './analyze-config.js';
import { saveReportFile, printConsoleSummary } from './output.js';
import { log } from '$lib/utils/logger.js';
import {
    groupByGroupKey,
    groupByStone,
    groupByProductType,
    calculateRank,
    calculateDiff,
    calculateInfo,
    extractGroupKeyParts,
    sortCandidatesByPrice,
    formatCalcForMarkdown
} from './report-grouping.js';
import {
    exportBestBuyReportToCsv,
    exportBestBuyByStoneToCsv,
    exportBestBuyByProductTypeToCsv
} from './csv-report-builder.js';

/**
 * ReportBuilder class for generating markdown reports with legend support.
 * Collects legend entries during report generation to explain column calculations.
 */
export class ReportBuilder {
    private legendEntries: Map<string, { meaning: string, calculation: string }> = new Map();

    /**
     * Adds or updates a legend entry for a column.
     * @param column - Column name (e.g., "Preis (Norm.)", "Rang")
     * @param meaning - What the column means
     * @param calculation - How the column is calculated
     */
    addToLegend(column: string, meaning: string, calculation: string): void {
        this.legendEntries.set(column, { meaning, calculation });
    }

    /**
     * Builds the legend section as markdown list.
     * @returns Markdown formatted legend section
     */
    buildLegendSection(): string {
        if (this.legendEntries.size === 0) {
            return '';
        }

        let md = `## 📖 Spalten-Legende\n\n`;

        // Define column order for consistent display
        const columnOrder = [
            'Rang',
            'Händler',
            'Herkunft',
            'Produkt',
            'Preis (Norm.)',
            'vs. Winner',
            'Info'
        ];

        // Build main entries
        const mainEntries: string[] = [];
        const subEntries: string[] = [];

        columnOrder.forEach(column => {
            const entry = this.legendEntries.get(column);
            if (entry) {
                mainEntries.push(`- **${column}**: ${entry.meaning}. Berechnung: ${entry.calculation}\n`);
            }

            // Check for sub-entries (e.g., "Preis (Norm.)_Bulk")
            if (column === 'Preis (Norm.)') {
                const bulkEntry = this.legendEntries.get('Preis (Norm.)_Bulk');
                const importEntry = this.legendEntries.get('Preis (Norm.)_Import');
                const weightEntry = this.legendEntries.get('Preis (Norm.)_Weight');
                const unitEntry = this.legendEntries.get('Preis (Norm.)_Unit');

                if (bulkEntry || importEntry || weightEntry || unitEntry) {
                    mainEntries.push(`- **Preis (Norm.)**: Finaler normalisierter Preis für Vergleich. Berechnung:\n`);
                    if (bulkEntry) {
                        subEntries.push(`    - Bulk-Preis: ${bulkEntry.meaning}. Berechnung: ${bulkEntry.calculation}\n`);
                    }
                    if (importEntry) {
                        subEntries.push(`    - Import-Markup: ${importEntry.meaning}. Berechnung: ${importEntry.calculation}\n`);
                    }
                    if (weightEntry) {
                        subEntries.push(`    - Gewicht-Normalisierung: ${weightEntry.meaning}. Berechnung: ${weightEntry.calculation}\n`);
                    }
                    if (unitEntry) {
                        subEntries.push(`    - Unit-Normalisierung: ${unitEntry.meaning}. Berechnung: ${unitEntry.calculation}\n`);
                    }
                } else {
                    // Fallback if no sub-entries but main entry exists
                    const mainEntry = this.legendEntries.get(column);
                    if (mainEntry) {
                        mainEntries.push(`- **${column}**: ${mainEntry.meaning}. Berechnung: ${mainEntry.calculation}\n`);
                    }
                }
            }
        });

        // Add any remaining entries not in the standard order
        this.legendEntries.forEach((entry, column) => {
            if (!columnOrder.includes(column) && !column.startsWith('Preis (Norm.)_')) {
                mainEntries.push(`- **${column}**: ${entry.meaning}. Berechnung: ${entry.calculation}\n`);
            }
        });

        // Combine main entries and sub-entries
        mainEntries.forEach(entry => md += entry);
        subEntries.forEach(entry => md += entry);

        md += `\n`;
        return md;
    }

    /**
     * Builds the detailed audit log markdown (flat table).
     * @param data - Array of audit rows
     * @returns Markdown string for audit log
     */
    buildAuditMarkdown(data: ReportRow[]): string {
        const now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        
        let md = `# 🕵️ Data Audit Log\n`;
        md += `Generiert: ${now} | Einträge: ${data.length}\n\n`;
        md += `| ID | Offering ID | Händler (Land) | Produkt | Größe | Gewicht | Price | Price/Piece | Norm. Preis | Trace |\n`;
        md += `|---|---|---|---|---|---|---|---|---|---|\n`;
        
        data.forEach(row => {
            // Pipes in Calculation_Trace sind Trennzeichen zwischen Trace-Einträgen (z.B. "Bulk Found | Comment | Origin")
            // Diese werden durch <br> ersetzt für visuelle Trennung in der HTML-Ausgabe
            // ABER: Echte Newlines in commentExcerpt (aus den Kommentaren) müssen auch durch <br> ersetzt werden,
            // damit die Markdown-Tabelle nicht bricht
            const trace = row.Calculation_Trace
                .replace(/[\r\n]+/g, '<br>')  // Echte Newlines aus Kommentaren durch <br> ersetzen
                .replace(/\|/g, '<br>');      // Pipes als Trennzeichen durch <br> ersetzen
            // WICHTIG: Pipe-Zeichen im Titel ESCAPEN (nicht ersetzen!), damit Markdown-Tabelle nicht bricht
            // Markdown escapt Pipe-Zeichen mit Backslash: | wird zu \|
            const product = row.Product_Title.replace(/\|/g, '\\|');
            const dimensions = row.Dimensions || '-';
            const weight = row.Weight_Display || '-';
            const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
            const offeringPrice = row.Offering_Price.toFixed(2);
            const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
            
            md += `| ${row.Row_ID} | ${row.Offering_ID} | **${row.Wholesaler}** (${row.Origin_Country}) | ${product} | ${dimensions}${warningIcon} | ${weight}${warningIcon} | ${offeringPrice} | ${offeringPricePerPiece} | **${row.Final_Normalized_Price.toFixed(2)}** ${row.Unit} | <small>${trace}</small> |\n`;
        });

        return md;
    }

    /**
     * Builds the best-buy report markdown (grouped & ranked).
     * Includes legend section at the top.
     * @param data - Array of audit rows
     * @returns Markdown string for best-buy report
     */
    buildBestBuyMarkdown(data: ReportRow[]): string {
        const now = new Date().toISOString().split('T')[0];

        // 1. Gruppieren (nutze report-grouping.ts)
        const { groups, sortedKeys } = groupByGroupKey(data);

        // 2. Header
        let md = `# 🏆 Best Price Report (${now})\n\n`;
        md += `Strategischer Einkaufs-Report nach Use-Case und Material.\n`;

        // 3. Legend section (inserted here, before existing legend)
        const legendSection = this.buildLegendSection();
        if (legendSection) {
            md += legendSection;
        }

        md += `> **Legende:** 🇨🇳 China-Importe enthalten bereits +25% Kalkulationsaufschlag.\n\n`;

        // Add legend entries for Rang, vs. Winner, Info columns (only once, before groups loop)
        if (!this.legendEntries.has('Rang')) {
            this.addToLegend(
                'Rang',
                'Rangposition basierend auf normalisiertem Preis (niedrigster = bester)',
                'Kandidaten sortiert nach `Final_Normalized_Price` aufsteigend. Position 1 = 🏆 (Gewinner), 2 = 🥈, 3 = 🥉, andere = Nummer'
            );
        }
        if (!this.legendEntries.has('vs. Winner')) {
            this.addToLegend(
                'vs. Winner',
                'Prozentuale Differenz zum günstigsten Preis (Gewinner)',
                `FORMULA: \`((price - winnerPrice) / winnerPrice) * 100\`. Gewinner zeigt "-", andere zeigen Prozentsatz (🔺 wenn >100%, + wenn ≤100%)`
            );
        }
        if (!this.legendEntries.has('Info')) {
            this.addToLegend(
                'Info',
                'Zusätzliche Informations-Icons',
                `📦 Bulk: Wenn \`Calculation_Trace\` "Bulk" enthält (Bulk-Preis im Comment gefunden). ⚖️ Calc.W.: Wenn \`Calculation_Trace\` "Regex" enthält (Gewicht aus Comment berechnet). 🌍 Country: Wenn Herkunftsland nicht DE/AT/NL und nicht UNKNOWN`
            );
        }
        if (!this.legendEntries.has('Händler')) {
            this.addToLegend(
                'Händler',
                'Händlername direkt aus Datenbank/CSV',
                'Quelle: `wholesalerName` Feld aus Datenbank/CSV'
            );
        }
        if (!this.legendEntries.has('Produkt')) {
            this.addToLegend(
                'Produkt',
                'Produkttitel direkt aus Datenbank/CSV',
                'Quelle: `offeringTitle` Feld aus Datenbank/CSV (max. 50 Zeichen)'
            );
        }

        // 4. Gruppen durchgehen
        sortedKeys.forEach(key => {
            const candidates = sortCandidatesByPrice(groups[key]);
            
            if (candidates.length === 0) return;
            
            // Der Gewinner (Referenz für Preisvergleich)
            const winner = candidates[0];

            // Section Header
            md += `### 📂 ${key}\n`;
            md += `*Vergleichsbasis: ${winner.Unit}*\n\n`;

            // Tabelle Header
            md += `| Rang | Offering ID | Händler | Herkunft | Produkt | Größe | Gewicht | Price | Price/Piece  | Preis (Norm.) | Calc | vs. Winner | Info |\n`;
            md += `|:---:|:-----------:|---------|:-------:|---------|-------|---------|----------------|-------------------------|---------------|------|------------|------|\n`;

            // --- SCHLEIFE ÜBER ALLE ANGEBOTE ---
            candidates.forEach((row, index) => {
                const rankDisplay = calculateRank(index);
                const diffStr = calculateDiff(row, winner, index);
                const info = calculateInfo(row);

                // Preis Formatierung (Gewinner fett)
                const priceDisplay = index === 0 
                    ? `**${row.Final_Normalized_Price.toFixed(2)}**`
                    : `${row.Final_Normalized_Price.toFixed(2)}`;
                
                // WICHTIG: Pipe-Zeichen im Titel ESCAPEN (nicht ersetzen!), damit Markdown-Tabelle nicht bricht
                // WARUM: Pipe-Zeichen (|) in Produkttiteln (z.B. "Bergkristall Wand| Doppelender")
                //        würden die Markdown-Tabelle zerbrechen, da | als Spaltentrenner verwendet wird
                // LÖSUNG: Escapen mit Backslash - | wird zu \| (wird in Markdown als normales Zeichen angezeigt)
                const productTitle = row.Product_Title.replace(/\|/g, '\\|');
                const dimensions = row.Dimensions || '-';
                const weight = row.Weight_Display || '-';
                const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
                const offeringPrice = row.Offering_Price.toFixed(2);
                const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
                const calcDisplay = formatCalcForMarkdown(row);
                
                md += `| ${rankDisplay} | ${row.Offering_ID} | ${row.Wholesaler} | ${row.Origin_Country} | ${productTitle} | ${dimensions}${warningIcon} | ${weight}${warningIcon} | ${offeringPrice} | ${offeringPricePerPiece} | ${priceDisplay} | ${calcDisplay} | ${diffStr} | ${info.join(' ')} |\n`;
            });

            md += `\n---\n`;
        });

        return md;
    }

    /**
     * Builds the best-buy report grouped by stone/material only (for quick overview per stone).
     * Groups all offerings by Material (Stein), then by Form, showing all offerings in a drill-down style table.
     * @param data - Array of audit rows
     * @returns Markdown string for best-buy report by stone
     */
    buildBestBuyByStoneMarkdown(data: ReportRow[]): string {
        const now = new Date().toISOString().split('T')[0];

        // 1. Gruppieren nach Material (Stein), dann nach Form (nutze report-grouping.ts)
        const { stoneGroups, sortedStones } = groupByStone(data);

        // 2. Header - EINE große Tabelle für alle Steine
        let md = `# 🏆 Best Price Report by Stone (${now})\n\n`;
        md += `Schnelle Übersicht: Angebote gruppiert nach Stein/Material.\n\n`;
        md += `> **Hinweis:** Diese Übersicht gruppiert nach Material (Stein). Für detaillierte Vergleiche nach Use-Case siehe \`best_buy_report.md\`.\n\n`;

        // 3. EINE Tabelle für alle Steine (Drill-Down-Stil)
        md += `| Stein | Produkttyp | Form | Offering ID | Rang | Händler | Herkunft | Produkt | Größe | Gewicht | Price | Price/Piece  | Preis (Norm.) | Calc | vs. Winner | Info |\n`;
        md += `|-------|------------|------|:-----------:|:---:|---------|:-------:|---------|-------|---------|----------------|-------------------------|---------------|------|------------|------|\n`;

        // 4. Stein-Gruppen durchgehen (nach Material sortiert) - ALLE in EINE Tabelle
        let lastStone = '';
        let lastProductType = '';
        let lastForm = '';

        sortedStones.forEach(stone => {
            const formGroups = stoneGroups[stone];
            const sortedForms = Object.keys(formGroups).sort();

            // Durch alle Formen gehen und Zeilen hinzufügen
            sortedForms.forEach(form => {
                const candidates = sortCandidatesByPrice(formGroups[form]);
                
                if (candidates.length === 0) return;
                
                // Der Gewinner (günstigstes Angebot für diese Form)
                const winner = candidates[0];
                
                // Zeilen für diese Form hinzufügen
                candidates.forEach((row, index) => {
                    const rankDisplay = calculateRank(index);
                    const diffStr = calculateDiff(row, winner, index);
                    const parts = extractGroupKeyParts(row.Group_Key);
                    const productType = parts.productType;
                    const info = calculateInfo(row);

                    // Preis Formatierung (Gewinner fett)
                    const priceDisplay = index === 0 
                        ? `**${row.Final_Normalized_Price.toFixed(2)}**`
                        : `${row.Final_Normalized_Price.toFixed(2)}`;
                    
                    // Pipe-Zeichen im Titel ESCAPEN
                    const productTitle = row.Product_Title.replace(/\|/g, '\\|');
                    const dimensions = row.Dimensions || '-';
                    const weight = row.Weight_Display || '-';
                    const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
                    const offeringPrice = row.Offering_Price.toFixed(2);
                    const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
                    const calcDisplay = formatCalcForMarkdown(row);
                    
                    // Drill-Down: Stein, Produkttyp und Form nur in der ersten Zeile einer neuen Gruppe
                    const isNewStone = (stone !== lastStone);
                    const isNewProductType = (productType !== lastProductType || isNewStone);
                    const isNewForm = (form !== lastForm || isNewStone);
                    const showStone = (index === 0 && isNewStone) ? stone : '';
                    const showProductType = (index === 0 && isNewProductType) ? productType : '';
                    const showForm = (index === 0 && isNewForm) ? form : '';
                    
                    // Update lastStone, lastProductType und lastForm NUR nach der ersten Zeile einer neuen Gruppe
                    if (index === 0) {
                        if (isNewStone) lastStone = stone;
                        if (isNewProductType) lastProductType = productType;
                        if (isNewForm) lastForm = form;
                    }
                    
                    md += `| ${showStone} | ${showProductType} | ${showForm} | ${row.Offering_ID} | ${rankDisplay} | ${row.Wholesaler} | ${row.Origin_Country} | ${productTitle} | ${dimensions}${warningIcon} | ${weight}${warningIcon} | ${offeringPrice} | ${offeringPricePerPiece} | ${priceDisplay} | ${calcDisplay} | ${diffStr} | ${info.join(' ')} |\n`;
                });
            });
        });

        return md;
    }

    /**
     * Builds the best-buy report grouped by product type (for quick overview per product type).
     * Groups all offerings by ProductType, then by Material, then by Form, showing all offerings in a drill-down style table.
     * @param data - Array of report rows
     * @returns Markdown string for best-buy report by product type
     */
    buildBestBuyByProductTypeMarkdown(data: ReportRow[]): string {
        const now = new Date().toISOString().split('T')[0];

        // 1. Gruppieren nach ProductType, dann nach Material (Stein), dann nach Form (nutze report-grouping.ts)
        const { productTypeGroups, sortedProductTypes } = groupByProductType(data);

        // 2. Header - EINE große Tabelle für alle ProductTypes
        let md = `# 🏆 Best Price Report by Product Type (${now})\n\n`;
        md += `Schnelle Übersicht: Angebote gruppiert nach Produkttyp.\n\n`;
        md += `> **Hinweis:** Diese Übersicht gruppiert nach Produkttyp. Für detaillierte Vergleiche nach Use-Case siehe \`best_buy_report.md\`.\n\n`;

        // 3. EINE Tabelle für alle ProductTypes (Drill-Down-Stil)
        md += `| Produkttyp | Stein | Form | Offering ID | Rang | Händler | Herkunft | Produkt | Größe | Gewicht | Price | Price/Piece  | Preis (Norm.) | Calc | vs. Winner | Info |\n`;
        md += `|------------|-------|------|:-----------:|:---:|---------|:-------:|---------|-------|---------|----------------|-------------------------|---------------|------|------------|------|\n`;

        // 4. ProductType-Gruppen durchgehen (nach ProductType sortiert) - ALLE in EINE Tabelle
        let lastProductType = '';
        let lastStone = '';
        let lastForm = '';

        sortedProductTypes.forEach(productType => {
            const materialGroups = productTypeGroups[productType];
            const sortedMaterials = Object.keys(materialGroups).sort();

            sortedMaterials.forEach(stone => {
                const formGroups = materialGroups[stone];
                const sortedForms = Object.keys(formGroups).sort();

                // Durch alle Formen gehen und Zeilen hinzufügen
                sortedForms.forEach(form => {
                    const candidates = sortCandidatesByPrice(formGroups[form]);
                    
                    if (candidates.length === 0) return;
                    
                    // Der Gewinner (günstigstes Angebot für diese Form)
                    const winner = candidates[0];
                    
                    // Zeilen für diese Form hinzufügen
                    candidates.forEach((row, index) => {
                        const rankDisplay = calculateRank(index);
                        const diffStr = calculateDiff(row, winner, index);
                        const info = calculateInfo(row);

                        // Preis Formatierung (Gewinner fett)
                        const priceDisplay = index === 0 
                            ? `**${row.Final_Normalized_Price.toFixed(2)}**`
                            : `${row.Final_Normalized_Price.toFixed(2)}`;
                        
                        // Pipe-Zeichen im Titel ESCAPEN
                        const productTitle = row.Product_Title.replace(/\|/g, '\\|');
                        const dimensions = row.Dimensions || '-';
                        const weight = row.Weight_Display || '-';
                        const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
                        const offeringPrice = row.Offering_Price.toFixed(2);
                        const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
                        const calcDisplay = formatCalcForMarkdown(row);
                        
                        // Drill-Down: ProductType, Stein und Form nur in der ersten Zeile einer neuen Gruppe
                        const isNewProductType = (productType !== lastProductType);
                        const isNewStone = (stone !== lastStone || isNewProductType);
                        const isNewForm = (form !== lastForm || isNewProductType || isNewStone);
                        const showProductType = (index === 0 && isNewProductType) ? productType : '';
                        const showStone = (index === 0 && isNewStone) ? stone : '';
                        const showForm = (index === 0 && isNewForm) ? form : '';
                        
                        // Update lastProductType, lastStone und lastForm NUR nach der ersten Zeile einer neuen Gruppe
                        if (index === 0) {
                            if (isNewProductType) lastProductType = productType;
                            if (isNewStone) lastStone = stone;
                            if (isNewForm) lastForm = form;
                        }
                        
                        md += `| ${showProductType} | ${showStone} | ${showForm} | ${row.Offering_ID} | ${rankDisplay} | ${row.Wholesaler} | ${row.Origin_Country} | ${productTitle} | ${dimensions}${warningIcon} | ${weight}${warningIcon} | ${offeringPrice} | ${offeringPricePerPiece} | ${priceDisplay} | ${calcDisplay} | ${diffStr} | ${info.join(' ')} |\n`;
                    });
                });
            });
        });

        return md;
    }

    /**
     * Generates and saves audit reports from sorted audit data.
     * @param sortedData - Report rows sorted by group and price
     */
    generateReports(sortedData: ReportRow[]): void {
        log.info(`Generating reports from ${sortedData.length} report rows`);

        // Build Markdown reports using builder methods
        const auditMarkdown = this.buildAuditMarkdown(sortedData);
        const bestBuyMarkdown = this.buildBestBuyMarkdown(sortedData);
        const bestBuyByStoneMarkdown = this.buildBestBuyByStoneMarkdown(sortedData);
        const bestBuyByProductTypeMarkdown = this.buildBestBuyByProductTypeMarkdown(sortedData);

        // Build CSV reports using CSV builder
        const bestBuyCsv = exportBestBuyReportToCsv(sortedData);
        const bestBuyByStoneCsv = exportBestBuyByStoneToCsv(sortedData);
        const bestBuyByProductTypeCsv = exportBestBuyByProductTypeToCsv(sortedData);

        log.info('Reports generated, saving files...');

        // Print console summary
        printConsoleSummary(sortedData);

        // Save Markdown report files
        saveReportFile('audit_log.md', auditMarkdown);
        saveReportFile('best_buy_report.md', bestBuyMarkdown);
        saveReportFile('best_buy_report_by_stone.md', bestBuyByStoneMarkdown);
        saveReportFile('best_buy_report_by_product_type.md', bestBuyByProductTypeMarkdown);

        // Save CSV report files
        saveReportFile('best_buy_report.csv', bestBuyCsv);
        saveReportFile('best_buy_report_by_stone.csv', bestBuyByStoneCsv);
        saveReportFile('best_buy_report_by_product_type.csv', bestBuyByProductTypeCsv);

        log.info('Reports saved successfully');
    }
}
