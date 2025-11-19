import { type AuditRow } from './analyze-config.js';

/**
 * Baut den String für den detaillierten Audit-Log (Flat Table).
 */
export function buildAuditMarkdown(data: AuditRow[]): string {
    const now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    
    let md = `# 🕵️ Data Audit Log\n`;
    md += `Generiert: ${now} | Einträge: ${data.length}\n\n`;
    md += `| ID | Händler (Land) | Produkt | Norm. Preis | Trace |\n`;
    md += `|---|---|---|---|---|\n`;
    
    data.forEach(row => {
        // Pipes im Trace ersetzen, damit die Markdown-Tabelle nicht bricht
        const trace = row.Calculation_Trace.replace(/\|/g, '<br>'); 
        const product = row.Product_Title.replace(/\|/g, '-');
        
        md += `| ${row.Row_ID} | **${row.Wholesaler}** (${row.Origin_Country}) | ${product} | **${row.Final_Normalized_Price.toFixed(2)}** ${row.Unit} | <small>${trace}</small> |\n`;
    });

    return md;
}

/**
 * Baut den String für den Best-Buy Report (Gruppiert & Ranked).
 */
export function buildBestBuyMarkdown(data: AuditRow[]): string {
    const now = new Date().toISOString().split('T')[0];

    // 1. Gruppieren
    const groups: Record<string, AuditRow[]> = {};
    data.forEach(row => {
        // Fehler und irrelevante Preise filtern
        if (row.Unit === 'ERR' || row.Final_Normalized_Price > 900000) return;
        
        if (!groups[row.Group_Key]) groups[row.Group_Key] = [];
        groups[row.Group_Key].push(row);
    });

    // 2. Markdown Header
    let md = `# 🏆 Best Price Report (${now})\n\n`;
    md += `Strategischer Einkaufs-Report nach Use-Case und Material.\n`;
    md += `> **Legende:** 🇨🇳 China-Importe enthalten bereits +25% Kalkulationsaufschlag (Zoll/Versand).\n\n`;

    // 3. Gruppen durchgehen
    const sortedKeys = Object.keys(groups).sort();

    sortedKeys.forEach(key => {
        const candidates = groups[key];
        
        // Sortieren: Billigster zuerst
        candidates.sort((a, b) => a.Final_Normalized_Price - b.Final_Normalized_Price);
        
        if (candidates.length === 0) return;
        const winner = candidates[0];

        // Section Header
        md += `### 📂 ${key}\n`;
        md += `*Vergleichsbasis: ${winner.Unit}*\n\n`;

        // Tabelle Header
        md += `| Rang | Händler | Herkunft | Produkt | Preis (Norm.) | vs. Winner | Info |\n`;
        md += `|:---:|---|:---:|---|---|---|---|\n`;

        // Zeilen generieren
        candidates.forEach((row, index) => {
            const rank = index === 0 ? '🏆 1' : `${index + 1}`;
            
            // Diff berechnen
            let diffStr = '-';
            if (index > 0) {
                const diffPct = ((row.Final_Normalized_Price - winner.Final_Normalized_Price) / winner.Final_Normalized_Price) * 100;
                diffStr = `+${diffPct.toFixed(0)}%`;
            }

            // Icons für Info-Spalte
            let info = '';
            if (row.Calculation_Trace.includes('Bulk')) info += '📦 Bulk ';
            if (row.Calculation_Trace.includes('Regex')) info += '⚖️ Calc.Weight ';
            if (row.Origin_Country !== 'DE' && !['AT','NL'].includes(row.Origin_Country)) info += `🌍 ${row.Origin_Country}`;

            // Preis fett für Winner
            const priceDisplay = index === 0 
                ? `**${row.Final_Normalized_Price.toFixed(2)} ${row.Unit}**`
                : `${row.Final_Normalized_Price.toFixed(2)} ${row.Unit}`;
            
            md += `| ${rank} | ${row.Wholesaler} | ${row.Origin_Country} | ${row.Product_Title} | ${priceDisplay} | ${diffStr} | ${info} |\n`;
        });

        md += `\n---\n`;
    });

    return md;
}