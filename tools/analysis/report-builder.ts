import { type AuditRow } from './analyze-config.js';
import { saveReportFile, printConsoleSummary } from './output.js';
import { log } from '$lib/utils/logger.js';

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
    buildAuditMarkdown(data: AuditRow[]): string {
        const now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        
        let md = `# 🕵️ Data Audit Log\n`;
        md += `Generiert: ${now} | Einträge: ${data.length}\n\n`;
        md += `| ID | Händler (Land) | Produkt | Norm. Preis | Trace |\n`;
        md += `|---|---|---|---|---|\n`;
        
        data.forEach(row => {
            const trace = row.Calculation_Trace.replace(/\|/g, '<br>'); 
            // WICHTIG: Pipe-Zeichen im Titel ESCAPEN (nicht ersetzen!), damit Markdown-Tabelle nicht bricht
            // Markdown escapt Pipe-Zeichen mit Backslash: | wird zu \|
            const product = row.Product_Title.replace(/\|/g, '\\|');
            
            md += `| ${row.Row_ID} | **${row.Wholesaler}** (${row.Origin_Country}) | ${product} | **${row.Final_Normalized_Price.toFixed(2)}** ${row.Unit} | <small>${trace}</small> |\n`;
        });

        return md;
    }

    /**
     * Builds the best-buy report markdown (grouped & ranked).
     * Includes legend section at the top.
     * @param data - Array of audit rows
     * @returns Markdown string for best-buy report
     */
    buildBestBuyMarkdown(data: AuditRow[]): string {
        const now = new Date().toISOString().split('T')[0];

        // 1. Gruppieren
        const groups: Record<string, AuditRow[]> = {};
        data.forEach(row => {
            // Fehler und irrelevante Preise filtern
            if (row.Unit === 'ERR' || row.Final_Normalized_Price > 900000) return;
            
            if (!groups[row.Group_Key]) groups[row.Group_Key] = [];
            groups[row.Group_Key].push(row);
        });

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
        const sortedKeys = Object.keys(groups).sort();

        sortedKeys.forEach(key => {
            const candidates = groups[key];
            
            // Sortieren: Billigster zuerst
            candidates.sort((a, b) => a.Final_Normalized_Price - b.Final_Normalized_Price);
            
            if (candidates.length === 0) return;
            
            // Der Gewinner (Referenz für Preisvergleich)
            const winner = candidates[0];

            // Section Header
            md += `### 📂 ${key}\n`;
            md += `*Vergleichsbasis: ${winner.Unit}*\n\n`;

            // Tabelle Header
            md += `| Rang | Händler | Herkunft | Produkt | Preis (Norm.) | vs. Winner | Info |\n`;
            md += `|:---:|---|:---:|---|---|---|---|\n`;

            // --- SCHLEIFE ÜBER ALLE ANGEBOTE ---
            candidates.forEach((row, index) => {
                let rankDisplay = `${index + 1}.`;
                if (index === 0) rankDisplay = '🏆 1';
                else if (index === 1) rankDisplay = '🥈 2';
                else if (index === 2) rankDisplay = '🥉 3';
                
                // Diff berechnen
                let diffStr = '-';
                if (index > 0) {
                    const diffPct = ((row.Final_Normalized_Price - winner.Final_Normalized_Price) / winner.Final_Normalized_Price) * 100;
                    const indicator = diffPct > 100 ? '🔺' : '+'; 
                    diffStr = `${indicator}${diffPct.toFixed(0)}%`;
                }

                // Info-Spalte Icons
                let info = [];
                if (row.Calculation_Trace.includes('Bulk')) info.push('📦 Bulk');
                if (row.Calculation_Trace.includes('Regex')) info.push('⚖️ Calc.W.');
                if (!['DE', 'AT', 'NL'].includes(row.Origin_Country) && row.Origin_Country !== 'UNKNOWN') {
                    info.push(`🌍 ${row.Origin_Country}`);
                }

                // Preis Formatierung (Gewinner fett)
                const priceDisplay = index === 0 
                    ? `**${row.Final_Normalized_Price.toFixed(2)}**`
                    : `${row.Final_Normalized_Price.toFixed(2)}`;
                
                // WICHTIG: Pipe-Zeichen im Titel ESCAPEN (nicht ersetzen!), damit Markdown-Tabelle nicht bricht
                // WARUM: Pipe-Zeichen (|) in Produkttiteln (z.B. "Bergkristall Wand| Doppelender")
                //        würden die Markdown-Tabelle zerbrechen, da | als Spaltentrenner verwendet wird
                // LÖSUNG: Escapen mit Backslash - | wird zu \| (wird in Markdown als normales Zeichen angezeigt)
                const productTitle = row.Product_Title.replace(/\|/g, '\\|');
                
                md += `| ${rankDisplay} | ${row.Wholesaler} | ${row.Origin_Country} | ${productTitle} | ${priceDisplay} | ${diffStr} | ${info.join(' ')} |\n`;
            });

            md += `\n---\n`;
        });

        return md;
    }

    /**
     * Generates and saves audit reports from sorted audit data.
     * @param sortedData - Audit rows sorted by group and price
     */
    generateReports(sortedData: AuditRow[]): void {
        log.info(`Generating reports from ${sortedData.length} audit rows`);

        // Build reports using builder methods
        const auditMarkdown = this.buildAuditMarkdown(sortedData);
        const bestBuyMarkdown = this.buildBestBuyMarkdown(sortedData);

        log.info('Reports generated, saving files...');

        // Print console summary
        printConsoleSummary(sortedData);

        // Save report files
        saveReportFile('audit_log.md', auditMarkdown);
        saveReportFile('best_buy_report.md', bestBuyMarkdown);

        log.info('Reports saved successfully');
    }
}
