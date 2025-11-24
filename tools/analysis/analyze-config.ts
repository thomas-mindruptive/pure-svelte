import * as path from 'path';

// ==========================================
// 1. PFADE & KONSTANTEN
// ==========================================

// Input
export const CSV_FILENAME = 'C:/dev/pure/pureenergy-schema/data-exports/complete-offerings-bom!.csv';

// Output
export const OUTPUT_DIR = 'C:/dev/pure/pureenergy-schema/reports'; 

// Kalkulation
export const IMPORT_MARKUP = 1.25; 

// ISO-Codes der EU-Zollunion (Kein Markup)
export const EU_ZONE = new Set([
    'DE', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

// Strategie-Mapping: Welcher Use-Case erzwingt welche Berechnung?
export const STRATEGY_MAP: Record<string, 'WEIGHT' | 'UNIT' | 'AUTO'> = {
    'Wasserenergetisierer': 'WEIGHT',
    'Handstein': 'WEIGHT',          
    'Stand/Tischstein': 'AUTO',     
    'Halskette': 'UNIT',
    'Anhänger': 'UNIT',
    'Pendel': 'UNIT',
    'Massagestab/Griffel': 'UNIT',
    'Ständer': 'UNIT',
    'Halbedelstein': 'AUTO'         
};

// ==========================================
// 2. TYPEN & INTERFACES
// ==========================================

// Entspricht exakt den Spalten deiner CSV
export interface RawOffering {
    wholesalerName: string;
    wholesalerId: string;
    wholesalerCountry: string; // Wichtig für Zoll
    productTypeName: string;   // Wichtig für Strategie
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
    offeringId?: string;
    // Weitere Felder sind optional, da für Preisberechnung nicht kritisch
    [key: string]: string | undefined; 
}

// Das Ergebnis einer einzelnen analysierten Zeile
export interface AuditRow {
    Row_ID: string;
    Offering_ID: number;     // Offering ID für direkte Referenz
    Group_Key: string;      // UseCase > Material > Form
    Wholesaler: string;
    Origin_Country: string;
    Product_Title: string;

    // Eingabewerte
    Raw_Price_List: number;
    Offering_Price: number; // Original offering.price from CSV/DB
    Offering_Price_Per_Piece: number | null; // Original offering.price_per_piece from CSV/DB
    Raw_Weight_Input: string;

    // Erkannte / Berechnete Werte
    Detected_Bulk_Price: number;
    Detected_Weight_Kg: number | null;
    Applied_Markup_Pct: number; // z.B. 0 oder 25
    
    // Größe und Gewicht
    Dimensions: string | null;      // z.B. "20x50cm", "10-30cm", null
    Dimensions_Source: string;      // "Field", "Regex (Title)", "None"
    Dimensions_Warning: string | null; // Warnung wenn nur im Titel gefunden
    Weight_Display: string | null;  // z.B. "0.25kg", "50-80g", null
    Weight_Source: string;          // "Weight Range Field", "Weight Grams Field", "Regex (Title/Pack)", "None"
    Weight_Warning: string | null;  // Warnung wenn nur im Titel gefunden
    Package_Weight: string | null;  // z.B. "1kg", "500g", null
    Package_Weight_Warning: string | null; // Warnung bei Mismatch oder fehlendem Feld
    
    // Ergebnis
    Final_Normalized_Price: number;
    Unit: '€/kg' | '€/Stk' | 'ERR';
    
    // Berechnungsmethode für Tooltips
    Calculation_Method: 'BULK' | 'EXACT' | 'RANGE' | 'CALC' | 'UNIT' | 'ERR';
    Calculation_Tooltip: string;

    // Der Trace String (für Tooltips/Debugging)
    Calculation_Trace: string; 
}