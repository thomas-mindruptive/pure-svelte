/**
 * Configuration file for the wholesaler price analysis tool.
 * 
 * This module defines:
 * - File paths for input (CSV) and output (reports)
 * - Import markup for non-EU countries
 * - EU customs zone countries (no markup applied)
 * - Pricing strategy mapping by product type
 * - Type definitions for raw offerings and report rows
 */

import type { LoadOfferingsOptions } from '$lib/backendQueries/entityOperations/offering';
import * as path from 'path';

// ==========================================
// 1. FILE PATHS & CONSTANTS
// ==========================================

/** Path to the CSV file containing offering data for analysis */
export const CSV_FILENAME = 'C:/dev/pure/pureenergy-schema/data-exports/complete-offerings-bom!.csv';

/** Directory where generated reports will be saved */
export const OUTPUT_DIR = 'C:/dev/pure/pureenergy-schema/reports'; 

/**
 * Import markup multiplier for non-EU countries.
 * Accounts for customs duties, shipping costs, and currency risk.
 * 1.25 = 25% markup on base price
 */
export const IMPORT_MARKUP = 1.25; 

/**
 * ISO country codes for EU customs union members.
 * Offerings from these countries do NOT receive import markup.
 * Includes all EU member states as of 2024.
 */
export const EU_ZONE = new Set([
    'DE', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

/**
 * Filter options for loading offerings from the database.
 * - excludedWholesalerIds: Internal suppliers to exclude (e.g., 99 = pureEnergy)
 * - allowedWholesalerRelevances: Only include suppliers with these relevance levels
 */
export const analysisOptions: LoadOfferingsOptions = {
    excludedWholesalerIds: [99],
    allowedWholesalerRelevances: ['high', 'medium', 'highest']
}

/**
 * Pricing strategy mapping by product type.
 * Determines how prices are normalized for comparison:
 * - WEIGHT: Compare by €/kg (best for raw materials, bulk stones)
 * - UNIT: Compare by €/piece (best for jewelry, individual items)
 * - AUTO: Use WEIGHT if weight data available, otherwise UNIT
 */
export const STRATEGY_MAP: Record<string, 'WEIGHT' | 'UNIT' | 'AUTO'> = {
    'Wasserenergetisierer': 'WEIGHT',  // Water energizers - sold by weight
    'Handstein': 'WEIGHT',              // Palm stones - sold by weight
    'Stand/Tischstein': 'AUTO',         // Display stones - varies
    'Halskette': 'UNIT',                // Necklaces - sold per piece
    'Anhänger': 'UNIT',                 // Pendants - sold per piece
    'Pendel': 'UNIT',                   // Pendulums - sold per piece
    'Massagestab/Griffel': 'UNIT',      // Massage wands - sold per piece
    'Ständer': 'UNIT',                  // Stands - sold per piece
    'Halbedelstein': 'AUTO'             // Semi-precious stones - varies
};

// ==========================================
// 2. TYPE DEFINITIONS
// ==========================================

/**
 * Raw offering data structure matching CSV export columns.
 * All fields are strings as they come directly from CSV parsing.
 * Numeric conversion happens during normalization.
 */
export interface RawOffering {
    wholesalerName: string;
    wholesalerId: string;
    wholesalerRelevance: string;
    wholesalerCountry: string;      // Important for customs/import markup
    productTypeName: string;        // Important for pricing strategy selection
    finalMaterialName: string;
    finalFormName: string;
    offeringTitle: string;
    offeringPrice: string;
    offeringPricePerPiece: string;
    offeringWeightGrams: string;
    offeringComment: string;
    offeringSize: string;
    offeringPackaging: string;
    offeringDimensions?: string;
    offeringWeightRange?: string;
    offeringPackageWeight?: string;
    offeringBulkPrices?: string;
    offeringId?: string;
    // Additional fields are optional - not critical for price calculation
    [key: string]: string | undefined; 
}

/**
 * Processed report row containing all calculated values for comparison.
 * This is the output of the transformation pipeline and input for report generation.
 */
export interface ReportRow {
    // === IDENTIFICATION ===
    Row_ID: string;                 // Sequential row number for reference
    Offering_ID: number;            // Database offering ID for direct lookup
    Product_Type: string;           // Product type (e.g., "Anhänger", "Handstein")
    Material_Name: string;          // Material name (e.g., "Amethyst", "Bergkristall")
    Form_Name: string;              // Form name (e.g., "Kugel", "Herz")
    Wholesaler: string;             // Supplier name
    Origin_Country: string;         // ISO country code (e.g., "DE", "CN")
    Product_Title: string;          // Product title (truncated to 50 chars)

    // === RAW INPUT VALUES ===
    Raw_Price_List: number;         // Original list price from supplier
    Offering_Price: number;         // Original offering.price from CSV/DB
    Offering_Price_Per_Piece: number | null;  // Original price per piece if available
    Raw_Weight_Input: string;       // Raw weight value as string

    // === DETECTED/CALCULATED VALUES ===
    Detected_Bulk_Price: number;    // Best price found (may be bulk price from comments)
    Detected_Weight_Kg: number | null;  // Effective weight in kg (from field, range, or calculation)
    Applied_Markup_Pct: number;     // Applied markup percentage (0 for EU, 25 for non-EU)
    
    // === DIMENSIONS & WEIGHT DISPLAY ===
    Dimensions: string | null;      // Parsed dimensions (e.g., "20x50cm", "10-30cm")
    Dimensions_Source: string;      // Source: "Field", "Regex (Title)", "None"
    Dimensions_Warning: string | null;  // Warning if dimensions only found in title
    Weight_Display: string | null;  // Formatted weight display (e.g., "0.25kg", "50-80g")
    Weight_Source: string;          // Source: "Weight Range Field", "Weight Grams Field", etc.
    Weight_Warning: string | null;  // Warning if weight only found in title
    Package_Weight: string | null;  // Package weight if specified (e.g., "1kg")
    Package_Weight_Warning: string | null;  // Warning if package weight mismatch

    // === FINAL CALCULATION RESULT ===
    Final_Normalized_Price: number; // Normalized price for comparison (€/kg or €/Stk)
    Unit: '€/kg' | '€/Stk' | 'ERR'; // Unit of the normalized price

    // === CALCULATION METADATA ===
    Calculation_Method: 'BULK' | 'EXACT' | 'RANGE' | 'CALC' | 'UNIT' | 'ERR';  // How weight was determined
    Calculation_Tooltip: string;    // Human-readable calculation explanation
    Calculation_Trace: string;      // Detailed trace of all calculation steps
}
