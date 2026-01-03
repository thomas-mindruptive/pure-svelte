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
export interface MaterialFormGroupedData {
    stoneGroups: Record<string, Record<string, ReportRow[]>>;
    sortedStones: string[];
}

/**
 * Result of grouping offerings by product type, then material, then form.
 * Structure: { "Anhänger": { "Amethyst": { "Kugel": [...] } } }
 */
export interface ProductTypeMaterialFormGroupedData {
    productTypeGroups: Record<string, Record<string, Record<string, ReportRow[]>>>;
    sortedProductTypes: string[];
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Builds a composite group key from individual components.
 * Format: "ProductType > Material > Form"
 * 
 * @param row - Report row with Product_Type, Material_Name, Form_Name
 * @returns Composite group key string
 */
export function build_ProductType_Material_Form_Key(row: ReportRow): string {
    return `${row.Product_Type} > ${row.Material_Name} > ${row.Form_Name}`;
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

// ==========================================
// GROUPING FUNCTIONS
// ==========================================

/**
 * Groups offerings by their composite group key.
 * Offerings with the same ProductType, Material, AND Form are grouped together.
 * 
 * @param data - Array of report rows to group
 * @returns Object with groups and sorted keys
 */
export function groupBy_ProductType_Material_Form_Key(data: ReportRow[]): GroupedData {
    const groups: Record<string, ReportRow[]> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        const groupKey = build_ProductType_Material_Form_Key(row);
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(row);
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
export function groupBy_Material_Form(data: ReportRow[]): MaterialFormGroupedData {
    const stoneGroups: Record<string, Record<string, ReportRow[]>> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        // Use direct fields instead of parsing Group_Key
        const material = row.Material_Name;
        const form = row.Form_Name;
        
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
export function groupBy_ProductType_Material_Form(data: ReportRow[]): ProductTypeMaterialFormGroupedData {
    const productTypeGroups: Record<string, Record<string, Record<string, ReportRow[]>>> = {};
    const validRows = filterValidRows(data);
    
    validRows.forEach(row => {
        // Use direct fields instead of parsing Group_Key
        const productType = row.Product_Type;
        const material = row.Material_Name;
        const form = row.Form_Name;
        
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

/**
 * Sorts report rows by per-piece weight (ascending: smallest to largest).
 * 
 * Uses Weight_Per_Piece_Grams instead of total weight for accurate size-based sorting.
 * This ensures bulk offerings (e.g., "2.5kg bulk, 4-7cm") sort by individual item size
 * rather than total package weight.
 * 
 * Items without per-piece weight are sorted to the end.
 * 
 * @param candidates - Array of report rows to sort
 * @returns Sorted array (does not mutate original)
 */
export function sortCandidatesByWeight(candidates: ReportRow[]): ReportRow[] {
    return [...candidates].sort((a, b) => {
        // Sort by per-piece weight in grams (null/undefined = Infinity = end of list)
        const weightA = a.Weight_Per_Piece_Grams ?? Infinity;
        const weightB = b.Weight_Per_Piece_Grams ?? Infinity;
        
        // Sort ascending: smallest to largest
        return weightA - weightB;
    });
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
    // Weight is already formatted in buildReportRow as Weight_Display
    // Just return it directly instead of re-formatting
    return row.Weight_Display || '-';
}
