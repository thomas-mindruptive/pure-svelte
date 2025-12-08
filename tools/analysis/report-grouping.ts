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
 * Formats the unit column for Markdown output (with HTML tooltip).
 * Shows "€/kg" or "€/Stk" as the visible label, with full calculation
 * details available on hover via the <abbr> tooltip.
 * 
 * @param row - The report row containing unit and calculation info
 * @returns HTML abbr element with unit label and tooltip
 */
export function formatUnitForMarkdown(row: ReportRow): string {
    const tooltip = row.Calculation_Tooltip;
    
    // Display the actual unit (€/kg or €/Stk) instead of method code
    const unitLabel = row.Unit === '€/kg' ? '€/kg' :
                      row.Unit === '€/Stk' ? '€/Stk' :
                      'ERR';
    
    // HTML abbr tag preserves tooltip on hover
    return `<abbr title="${tooltip.replace(/"/g, '&quot;')}">${unitLabel}</abbr>`;
}

/**
 * Formats the unit column for CSV output.
 * Returns the unit label (€/kg or €/Stk) for the CSV cell.
 * 
 * @param row - The report row containing unit info
 * @returns Unit string for CSV
 */
export function formatUnitForCsv(row: ReportRow): string {
    return row.Unit === '€/kg' ? '€/kg' :
           row.Unit === '€/Stk' ? '€/Stk' :
           'ERR';
}

/**
 * Formats the effective weight for display in reports.
 * Shows the calculated/measured weight in a human-readable format.
 * Returns "-" for UNIT strategy (no weight-based pricing).
 * 
 * @param row - The report row containing weight data
 * @returns Formatted weight string (e.g., "229g", "1.2kg", "-")
 */
export function formatWeightForMarkdown(row: ReportRow): string {
    // No weight display for unit-based pricing
    if (row.Unit === '€/Stk' || row.Detected_Weight_Kg === null) {
        return '-';
    }
    
    const weightKg = row.Detected_Weight_Kg;
    
    // Display in grams for weights under 1kg, otherwise in kg
    if (weightKg < 1) {
        const grams = Math.round(weightKg * 1000);
        return `${grams}g`;
    } else {
        return `${weightKg.toFixed(2)}kg`;
    }
}

