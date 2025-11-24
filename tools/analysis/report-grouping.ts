import { type ReportRow } from './analyze-config.js';

// ==========================================
// INTERFACES
// ==========================================

export interface GroupedData {
    groups: Record<string, ReportRow[]>;
    sortedKeys: string[];
}

export interface StoneGroupedData {
    stoneGroups: Record<string, Record<string, ReportRow[]>>;
    sortedStones: string[];
}

export interface ProductTypeGroupedData {
    productTypeGroups: Record<string, Record<string, Record<string, ReportRow[]>>>;
    sortedProductTypes: string[];
}

export interface GroupKeyParts {
    productType: string;
    material: string;
    form: string;
}

// ==========================================
// FILTER FUNCTIONS
// ==========================================

/**
 * Filtert ungültige Zeilen (ERR oder Preise > 900000)
 */
export function filterValidRows(data: ReportRow[]): ReportRow[] {
    return data.filter(row => row.Unit !== 'ERR' && row.Final_Normalized_Price <= 900000);
}

// ==========================================
// GROUP KEY PARSING
// ==========================================

/**
 * Extrahiert ProductType, Material und Form aus Group_Key
 * Group_Key format: "ProductType > Material > Form"
 */
export function extractGroupKeyParts(groupKey: string): GroupKeyParts {
    const parts = groupKey.split(' > ');
    return {
        productType: parts.length >= 1 ? parts[0] : '',
        material: parts.length >= 2 ? parts[1] : groupKey, // Fallback to full key if format unexpected
        form: parts.length >= 3 ? parts[2] : ''
    };
}

// ==========================================
// GROUPING FUNCTIONS
// ==========================================

/**
 * Gruppiert nach Group_Key (ProductType > Material > Form)
 */
export function groupByGroupKey(data: ReportRow[]): GroupedData {
    const groups: Record<string, ReportRow[]> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        if (!groups[row.Group_Key]) {
            groups[row.Group_Key] = [];
        }
        groups[row.Group_Key].push(row);
    });
    
    const sortedKeys = Object.keys(groups).sort();
    
    return { groups, sortedKeys };
}

/**
 * Gruppiert nach Material (Stein), dann nach Form
 */
export function groupByStone(data: ReportRow[]): StoneGroupedData {
    const stoneGroups: Record<string, Record<string, ReportRow[]>> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        const parts = extractGroupKeyParts(row.Group_Key);
        const material = parts.material;
        const form = parts.form;
        
        if (!stoneGroups[material]) {
            stoneGroups[material] = {};
        }
        if (!stoneGroups[material][form]) {
            stoneGroups[material][form] = [];
        }
        stoneGroups[material][form].push(row);
    });
    
    const sortedStones = Object.keys(stoneGroups).sort();
    
    return { stoneGroups, sortedStones };
}

/**
 * Gruppiert nach ProductType, dann nach Material (Stein), dann nach Form
 */
export function groupByProductType(data: ReportRow[]): ProductTypeGroupedData {
    const productTypeGroups: Record<string, Record<string, Record<string, ReportRow[]>>> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        const parts = extractGroupKeyParts(row.Group_Key);
        const productType = parts.productType;
        const material = parts.material;
        const form = parts.form;
        
        if (!productTypeGroups[productType]) {
            productTypeGroups[productType] = {};
        }
        if (!productTypeGroups[productType][material]) {
            productTypeGroups[productType][material] = {};
        }
        if (!productTypeGroups[productType][material][form]) {
            productTypeGroups[productType][material][form] = [];
        }
        productTypeGroups[productType][material][form].push(row);
    });
    
    const sortedProductTypes = Object.keys(productTypeGroups).sort();
    
    return { productTypeGroups, sortedProductTypes };
}

// ==========================================
// CALCULATION FUNCTIONS
// ==========================================

/**
 * Berechnet Rang-Display (🏆 1, 🥈 2, 🥉 3, etc.)
 */
export function calculateRank(index: number): string {
    if (index === 0) return '🏆 1';
    if (index === 1) return '🥈 2';
    if (index === 2) return '🥉 3';
    return `${index + 1}.`;
}

/**
 * Berechnet vs. Winner Prozent-Differenz
 */
export function calculateDiff(row: ReportRow, winner: ReportRow, index: number): string {
    if (index === 0) return '-';
    
    const diffPct = ((row.Final_Normalized_Price - winner.Final_Normalized_Price) / winner.Final_Normalized_Price) * 100;
    const indicator = diffPct > 100 ? '🔺' : '+';
    return `${indicator}${diffPct.toFixed(0)}%`;
}

/**
 * Berechnet Info-Icons (📦 Bulk, ⚖️ Calc.W., 🌍 Country, ⚠️ Warning)
 */
export function calculateInfo(row: ReportRow): string[] {
    const info: string[] = [];
    
    if (row.Calculation_Trace.includes('Bulk')) {
        info.push('📦 Bulk');
    }
    if (row.Calculation_Trace.includes('Regex')) {
        info.push('⚖️ Calc.W.');
    }
    if (!['DE', 'AT', 'NL'].includes(row.Origin_Country) && row.Origin_Country !== 'UNKNOWN') {
        info.push(`🌍 ${row.Origin_Country}`);
    }
    if (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) {
        info.push('⚠️');
    }
    
    return info;
}

/**
 * Sortiert Kandidaten nach Final_Normalized_Price (aufsteigend)
 */
export function sortCandidatesByPrice(candidates: ReportRow[]): ReportRow[] {
    return [...candidates].sort((a, b) => a.Final_Normalized_Price - b.Final_Normalized_Price);
}

/**
 * Formatiert Calc-Anzeige für Markdown (mit HTML Tooltip)
 */
export function formatCalcForMarkdown(row: ReportRow): string {
    const method = row.Calculation_Method;
    const tooltip = row.Calculation_Tooltip;
    
    // Kurze Anzeige basierend auf Method
    const shortLabel = method === 'BULK' ? 'BULK' :
                       method === 'EXACT' ? 'EXACT' :
                       method === 'RANGE' ? 'RANGE' :
                       method === 'CALC' ? 'CALC' :
                       method === 'UNIT' ? 'UNIT' :
                       'ERR';
    
    // HTML abbr Tag für Tooltip
    return `<abbr title="${tooltip.replace(/"/g, '&quot;')}">${shortLabel}</abbr>`;
}

/**
 * Formatiert Calc-Anzeige für CSV (vollständiger Text)
 */
export function formatCalcForCsv(row: ReportRow): string {
    return row.Calculation_Tooltip;
}

