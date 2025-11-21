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
        const trace = row.Calculation_Trace.replace(/\|/g, '<br>'); 
        // WICHTIG: Pipe-Zeichen im Titel ESCAPEN (nicht ersetzen!), damit Markdown-Tabelle nicht bricht
        // Markdown escapt Pipe-Zeichen mit Backslash: | wird zu \|
        const product = row.Product_Title.replace(/\|/g, '\\|');
        
        md += `| ${row.Row_ID} | **${row.Wholesaler}** (${row.Origin_Country}) | ${product} | **${row.Final_Normalized_Price.toFixed(2)}** ${row.Unit} | <small>${trace}</small> |\n`;
    });

    return md;
}

/**
 * Baut den String für den Best-Buy Report (Gruppiert & Ranked).
 * LOGIK: Iteriert über ALLE Kandidaten einer Gruppe (nicht nur Top 2).
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

    // 2. Header
    let md = `# 🏆 Best Price Report (${now})\n\n`;
    md += `Strategischer Einkaufs-Report nach Use-Case und Material.\n`;
    md += `> **Legende:** 🇨🇳 China-Importe enthalten bereits +25% Kalkulationsaufschlag.\n\n`;

    // 3. Gruppen durchgehen
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