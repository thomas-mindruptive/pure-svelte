/**
 * Report grouping and formatting utilities.
 * 
 * This module provides:
 * - Data grouping by different hierarchies (Group_Key, Stone, ProductType)
 * - Ranking calculations for price comparisons
 * - Formatting functions for Markdown and CSV output
 * 
 * Used by report builders to organize offerings into comparable groups.
 */

import { type ReportRow } from './analyze-config.js';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

/**
 * Result of grouping offerings by their full Group_Key.
 * Groups format: { "Anhänger > Amethyst > Kugel": [row1, row2, ...] }
 */
export interface GroupedData {
    groups: Record<string, ReportRow[]>;
    sortedKeys: string[];
}

/**
 * Result of grouping offerings by material (stone), then by form.
 * Structure: { "Amethyst": { "Kugel": [row1, row2, ...], "Herz": [...] } }
 */
export interface StoneGroupedData {
    stoneGroups: Record<string, Record<string, ReportRow[]>>;
    sortedStones: string[];
}

/**
 * Result of grouping offerings by product type, then material, then form.
 * Structure: { "Anhänger": { "Amethyst": { "Kugel": [...] } } }
 */
export interface ProductTypeGroupedData {
    productTypeGroups: Record<string, Record<string, Record<string, ReportRow[]>>>;
    sortedProductTypes: string[];
}

/**
 * Parsed components of a Group_Key string.
 * Group_Key format: "ProductType > Material > Form"
 */
export interface GroupKeyParts {
    productType: string;
    material: string;
    form: string;
}

// ==========================================
// FILTER FUNCTIONS
// ==========================================

/**
 * Filters out invalid report rows.
 * 
 * REMOVES:
 * - Rows with ERR unit (calculation failed)
 * - Rows with extremely high prices (> 900000) indicating calculation errors
 * 
 * @param data - Array of report rows to filter
 * @returns Filtered array with only valid rows
 */
export function filterValidRows(data: ReportRow[]): ReportRow[] {
    return data.filter(row => row.Unit !== 'ERR' && row.Final_Normalized_Price <= 900000);
}

// ==========================================
// GROUP KEY PARSING
// ==========================================

/**
 * Parses a Group_Key string into its component parts.
 * 
 * @param groupKey - Group key string (format: "ProductType > Material > Form")
 * @returns Object with productType, material, and form
 * 
 * @example
 * extractGroupKeyParts("Anhänger > Amethyst > Kugel")
 * // → { productType: "Anhänger", material: "Amethyst", form: "Kugel" }
 */
export function extractGroupKeyParts(groupKey: string): GroupKeyParts {
    const parts = groupKey.split(' > ');
    return {
        productType: parts.length >= 1 ? parts[0] : '',
        material: parts.length >= 2 ? parts[1] : groupKey, // Fallback to full key
        form: parts.length >= 3 ? parts[2] : ''
    };
}

// ==========================================
// GROUPING FUNCTIONS
// ==========================================

/**
 * Groups offerings by their full Group_Key.
 * Offerings with the same ProductType, Material, AND Form are grouped together.
 * 
 * @param data - Array of report rows to group
 * @returns Object with groups and sorted keys
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
 * Groups offerings by material (stone), then by form.
 * Useful for comparing all offerings of a specific stone type.
 * 
 * @param data - Array of report rows to group
 * @returns Object with nested groups and sorted stone names
 */
export function groupByStone(data: ReportRow[]): StoneGroupedData {
    const stoneGroups: Record<string, Record<string, ReportRow[]>> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        const parts = extractGroupKeyParts(row.Group_Key);
        const material = parts.material;
        const form = parts.form;
        
        // Initialize nested structure if needed
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
 * Groups offerings by product type, then material, then form.
 * Useful for comparing all offerings in a product category.
 * 
 * @param data - Array of report rows to group
 * @returns Object with triple-nested groups and sorted product types
 */
export function groupByProductType(data: ReportRow[]): ProductTypeGroupedData {
    const productTypeGroups: Record<string, Record<string, Record<string, ReportRow[]>>> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        const parts = extractGroupKeyParts(row.Group_Key);
        const productType = parts.productType;
        const material = parts.material;
        const form = parts.form;
        
        // Initialize nested structures if needed
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
// RANKING & COMPARISON FUNCTIONS
// ==========================================

/**
 * Calculates the rank display string based on position.
 * 
 * @param index - Zero-based position in sorted list
 * @returns Formatted rank string with emoji
 * 
 * @example
 * calculateRank(0) // → "🏆 1"
 * calculateRank(1) // → "🥈 2"
 * calculateRank(2) // → "🥉 3"
 * calculateRank(5) // → "6."
 */
export function calculateRank(index: number): string {
    if (index === 0) return '🏆 1';
    if (index === 1) return '🥈 2';
    if (index === 2) return '🥉 3';
    return `${index + 1}.`;
}

/**
 * Calculates the percentage difference from the winner (lowest price).
 * 
 * @param row - Current row being compared
 * @param winner - The lowest-priced row in the group
 * @param index - Position in sorted list (0 = winner)
 * @returns Formatted difference string
 * 
 * @example
 * calculateDiff(row, winner, 0)  // → "-" (is the winner)
 * calculateDiff(row, winner, 1)  // → "+25%" (25% more expensive)
 * calculateDiff(row, winner, 5)  // → "🔺250%" (very expensive, >100% markup)
 */
export function calculateDiff(row: ReportRow, winner: ReportRow, index: number): string {
    if (index === 0) return '-';  // Winner shows no difference
    
    const diffPct = ((row.Final_Normalized_Price - winner.Final_Normalized_Price) / winner.Final_Normalized_Price) * 100;
    // Use 🔺 for >100% difference to draw attention
    const indicator = diffPct > 100 ? '🔺' : '+';
    return `${indicator}${diffPct.toFixed(0)}%`;
}

/**
 * Calculates info icons based on row data characteristics.
 * 
 * ICONS:
 * - 📦 Bulk: Price was found in bulk/volume discount
 * - ⚖️ Calc.W.: Weight was calculated from dimensions
 * - 🌍 XX: Origin country (if not DE/AT/NL)
 * - ⚠️: Data quality warning present
 * 
 * @param row - Report row to analyze
 * @returns Array of info icon strings
 */
export function calculateInfo(row: ReportRow): string[] {
    const info: string[] = [];
    
    // Check for bulk pricing
    if (row.Calculation_Trace.includes('Bulk')) {
        info.push('📦 Bulk');
    }
    // Check for regex-based weight extraction
    if (row.Calculation_Trace.includes('Regex')) {
        info.push('⚖️ Calc.W.');
    }
    // Show origin country if not local/EU
    if (!['DE', 'AT', 'NL'].includes(row.Origin_Country) && row.Origin_Country !== 'UNKNOWN') {
        info.push(`🌍 ${row.Origin_Country}`);
    }
    // Show warning icon if any data quality issues
    if (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) {
        info.push('⚠️');
    }
    
    return info;
}

/**
 * Sorts candidate offerings by normalized price (lowest first).
 * Creates a new array without modifying the original.
 * 
 * @param candidates - Array of offerings to sort
 * @returns New sorted array
 */
export function sortCandidatesByPrice(candidates: ReportRow[]): ReportRow[] {
    return [...candidates].sort((a, b) => a.Final_Normalized_Price - b.Final_Normalized_Price);
}

// ==========================================
// FORMATTING FUNCTIONS
// ==========================================

/**
 * Formats the unit column for Markdown output with HTML tooltip.
 * Shows "€/kg" or "€/Stk" as visible text, with full calculation
 * details available on hover via the <abbr> element.
 * 
 * @param row - Report row containing unit and calculation tooltip
 * @returns HTML abbr element string
 * 
 * @example
 * formatUnitForMarkdown(row)
 * // → '<abbr title="Strategie: WEIGHT. Quelle: 229g...">€/kg</abbr>'
 */
export function formatUnitForMarkdown(row: ReportRow): string {
    const tooltip = row.Calculation_Tooltip;
    
    // Display actual unit instead of internal method code
    const unitLabel = row.Unit === '€/kg' ? '€/kg' :
                      row.Unit === '€/Stk' ? '€/Stk' :
                      'ERR';
    
    // Wrap in abbr tag for hover tooltip
    return `<abbr title="${tooltip.replace(/"/g, '&quot;')}">${unitLabel}</abbr>`;
}

/**
 * Formats the unit column for CSV output.
 * Simple text format without HTML.
 * 
 * @param row - Report row containing unit info
 * @returns Unit string for CSV
 */
export function formatUnitForCsv(row: ReportRow): string {
    return row.Unit === '€/kg' ? '€/kg' :
           row.Unit === '€/Stk' ? '€/Stk' :
           'ERR';
}

/**
 * Formats the effective weight for display in reports.
 * Shows weight in appropriate unit (g for small, kg for large).
 * Returns "-" for unit-based pricing (no weight used).
 * 
 * @param row - Report row containing weight data
 * @returns Formatted weight string (e.g., "229g", "1.25kg", "-")
 */
export function formatWeightForMarkdown(row: ReportRow): string {
    // No weight display for unit-based pricing
    if (row.Unit === '€/Stk' || row.Detected_Weight_Kg === null) {
        return '-';
    }
    
    const weightKg = row.Detected_Weight_Kg;
    
    // Use grams for weights under 1kg for better readability
    if (weightKg < 1) {
        const grams = Math.round(weightKg * 1000);
        return `${grams}g`;
    } else {
        return `${weightKg.toFixed(2)}kg`;
    }
}
