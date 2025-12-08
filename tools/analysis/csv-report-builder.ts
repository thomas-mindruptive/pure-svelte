import { type ReportRow } from './analyze-config.js';
import {
    groupBy_ProductType_Material_Form_Key,
    groupBy_Material_Form,
    groupBy_ProductType_Material_Form,
    calculateRank,
    calculateDiff,
    calculateInfo,
    sortCandidatesByPrice,
    sortCandidatesByWeight,
    formatUnitForCsv,
    formatWeightForMarkdown
} from './report-grouping.js';

// ==========================================
// CSV HELPER FUNCTIONS
// ==========================================

/**
 * Escaped CSV-Werte (Anführungszeichen, Kommas, Newlines)
 */
function escapeCsvValue(value: string | number | null): string {
    if (value === null || value === undefined) {
        return '';
    }
    
    const str = String(value);
    
    // Wenn der Wert Kommas, Anführungszeichen oder Newlines enthält, muss er in Anführungszeichen gesetzt werden
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        // Anführungszeichen im Wert verdoppeln
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

/**
 * Formatiert eine CSV-Zeile
 */
function formatCsvRow(values: (string | number | null)[]): string {
    return values.map(escapeCsvValue).join(',');
}

// ==========================================
// CSV EXPORT FUNCTIONS
// ==========================================

/**
 * Exports report as CSV.
 * Groups offerings by Group_Key (ProductType > Material > Form).
 * 
 * @param data - Array of report rows to export
 * @param sortLeaves - Optional callback to sort leaf nodes (defaults to price sorting)
 * @returns CSV formatted string
 */
export function exportBestBuyReportToCsv(
    data: ReportRow[], 
    sortLeaves: (candidates: ReportRow[]) => ReportRow[] = sortCandidatesByPrice
): string {
    const { groups, sortedKeys } = groupBy_ProductType_Material_Form_Key(data);
    
    // Header row - "Einheit" shows €/kg or €/Stk, "Gewicht" shows effective weight
    const headers = [
        'Rang',
        'Offering ID',
        'Händler',
        'Herkunft',
        'Produkt',
        'Größe',
        'Price',
        'Price/Piece',
        'Preis (Norm.)',
        'Gewicht',
        'Einheit',
        'vs. Winner',
        'Info'
    ];
    
    let csv = formatCsvRow(headers) + '\n';
    
    // Process each group
    sortedKeys.forEach(key => {
        const candidates = sortLeaves(groups[key]);
        
        if (candidates.length === 0) return;
        
        const winner = candidates[0];
        
        // Add rows for this group
        candidates.forEach((row, index) => {
            const rankDisplay = calculateRank(index);
            const diffStr = calculateDiff(row, winner, index);
            const info = calculateInfo(row);
            
            const productTitle = row.Product_Title;
            const dimensions = row.Dimensions || '-';
            const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
            const offeringPrice = row.Offering_Price.toFixed(2);
            const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
            const priceDisplay = row.Final_Normalized_Price.toFixed(2);
            
            // New columns: Gewicht shows effective weight, Einheit shows €/kg or €/Stk
            const weightDisplay = formatWeightForMarkdown(row);
            const unitDisplay = formatUnitForCsv(row);
            
            const rowValues = [
                rankDisplay,
                row.Offering_ID,
                row.Wholesaler,
                row.Origin_Country,
                productTitle,
                dimensions + warningIcon,
                offeringPrice,
                offeringPricePerPiece,
                priceDisplay,
                weightDisplay,
                unitDisplay,
                diffStr,
                info.join(' ')
            ];
            
            csv += formatCsvRow(rowValues) + '\n';
        });
        
        // Empty line between groups for readability
        csv += '\n';
    });
    
    return csv;
}

/**
 * Exports report_by_stone as CSV.
 * Groups offerings by Material (Stone) > Form in drill-down style.
 * 
 * @param data - Array of report rows to export
 * @param sortLeaves - Optional callback to sort leaf nodes (defaults to price sorting)
 * @returns CSV formatted string
 */
export function exportBestBuyByStoneToCsv(
    data: ReportRow[], 
    sortLeaves: (candidates: ReportRow[]) => ReportRow[] = sortCandidatesByPrice
): string {
    const { stoneGroups, sortedStones } = groupBy_Material_Form(data);
    
    // Header row - "Einheit" shows €/kg or €/Stk, "Gewicht" shows effective weight
    const headers = [
        'Stein',
        'Produkttyp',
        'Form',
        'Offering ID',
        'Rang',
        'Händler',
        'Herkunft',
        'Produkt',
        'Größe',
        'Price',
        'Price/Piece',
        'Preis (Norm.)',
        'Gewicht',
        'Einheit',
        'vs. Winner',
        'Info'
    ];
    
    let csv = formatCsvRow(headers) + '\n';
    
    // Track previous values for drill-down display
    let lastStone = '';
    let lastProductType = '';
    let lastForm = '';
    
    sortedStones.forEach(stone => {
        const formGroups = stoneGroups[stone];
        const sortedForms = Object.keys(formGroups).sort();
        
        sortedForms.forEach(form => {
            const candidates = sortLeaves(formGroups[form]);
            
            if (candidates.length === 0) return;
            
            const winner = candidates[0];
            
            candidates.forEach((row, index) => {
                const rankDisplay = calculateRank(index);
                const diffStr = calculateDiff(row, winner, index);
                // Use direct field instead of parsing Group_Key
                const productType = row.Product_Type;
                const info = calculateInfo(row);
                
                const productTitle = row.Product_Title;
                const dimensions = row.Dimensions || '-';
                const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
                const offeringPrice = row.Offering_Price.toFixed(2);
                const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
                const priceDisplay = row.Final_Normalized_Price.toFixed(2);
                
                // New columns: Gewicht shows effective weight, Einheit shows €/kg or €/Stk
                const weightDisplay = formatWeightForMarkdown(row);
                const unitDisplay = formatUnitForCsv(row);
                
                // Drill-down: only show stone/productType/form on first row of new group
                const isNewStone = (stone !== lastStone);
                const isNewProductType = (productType !== lastProductType || isNewStone);
                const isNewForm = (form !== lastForm || isNewStone);
                const showStone = (index === 0 && isNewStone) ? stone : '';
                const showProductType = (index === 0 && isNewProductType) ? productType : '';
                const showForm = (index === 0 && isNewForm) ? form : '';
                
                // Update tracking variables only after first row of new group
                if (index === 0) {
                    if (isNewStone) lastStone = stone;
                    if (isNewProductType) lastProductType = productType;
                    if (isNewForm) lastForm = form;
                }
                
                const rowValues = [
                    showStone,
                    showProductType,
                    showForm,
                    row.Offering_ID,
                    rankDisplay,
                    row.Wholesaler,
                    row.Origin_Country,
                    productTitle,
                    dimensions + warningIcon,
                    offeringPrice,
                    offeringPricePerPiece,
                    priceDisplay,
                    weightDisplay,
                    unitDisplay,
                    diffStr,
                    info.join(' ')
                ];
                
                csv += formatCsvRow(rowValues) + '\n';
            });
        });
    });
    
    return csv;
}

/**
 * Exports report_by_product_type as CSV.
 * Groups offerings by ProductType > Material (Stone) > Form in drill-down style.
 * 
 * @param data - Array of report rows to export
 * @param sortLeaves - Optional callback to sort leaf nodes (defaults to price sorting)
 * @returns CSV string with all product type grouped offerings
 */
export function exportBestBuyByProductTypeToCsv(
    data: ReportRow[], 
    sortLeaves: (candidates: ReportRow[]) => ReportRow[] = sortCandidatesByPrice
): string {
    const { productTypeGroups, sortedProductTypes } = groupBy_ProductType_Material_Form(data);
    
    // Header row - "Einheit" shows €/kg or €/Stk, "Gewicht" shows effective weight
    const headers = [
        'Produkttyp',
        'Stein',
        'Form',
        'Offering ID',
        'Rang',
        'Händler',
        'Herkunft',
        'Produkt',
        'Größe',
        'Gewicht',
        'Price',
        'Price/Piece',
        'Preis (Norm.)',
        'Einheit',
        'vs. Winner',
        'Info'
    ];
    
    let csv = formatCsvRow(headers) + '\n';
    
    // Track last values for drill-down display (only show on first row of new group)
    let lastProductType = '';
    let lastStone = '';
    let lastForm = '';
    
    sortedProductTypes.forEach(productType => {
        const materialGroups = productTypeGroups[productType];
        const sortedMaterials = Object.keys(materialGroups).sort();
        
        sortedMaterials.forEach(stone => {
            const formGroups = materialGroups[stone];
            const sortedForms = Object.keys(formGroups).sort();
            
            sortedForms.forEach(form => {
                const candidates = sortLeaves(formGroups[form]);
                
                if (candidates.length === 0) return;
                
                // Winner is the lowest priced offering in this group
                const winner = candidates[0];
                
                candidates.forEach((row, index) => {
                    const rankDisplay = calculateRank(index);
                    const diffStr = calculateDiff(row, winner, index);
                    const info = calculateInfo(row);
                    
                    const productTitle = row.Product_Title;
                    const dimensions = row.Dimensions || '-';
                    const weight = row.Weight_Display || '-';
                    const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
                    const offeringPrice = row.Offering_Price.toFixed(2);
                    const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
                    const priceDisplay = row.Final_Normalized_Price.toFixed(2);
                    
                    // New columns: Gewicht shows effective weight, Einheit shows €/kg or €/Stk
                    const unitDisplay = formatUnitForCsv(row);
                    
                    // Drill-down logic: show ProductType, Stone, Form only on first row of new group
                    const isNewProductType = (productType !== lastProductType);
                    const isNewStone = (stone !== lastStone || isNewProductType);
                    const isNewForm = (form !== lastForm || isNewProductType || isNewStone);
                    const showProductType = (index === 0 && isNewProductType) ? productType : '';
                    const showStone = (index === 0 && isNewStone) ? stone : '';
                    const showForm = (index === 0 && isNewForm) ? form : '';
                    
                    // Update tracking variables only after first row of new group
                    if (index === 0) {
                        if (isNewProductType) lastProductType = productType;
                        if (isNewStone) lastStone = stone;
                        if (isNewForm) lastForm = form;
                    }
                    
                    const rowValues = [
                        showProductType,
                        showStone,
                        showForm,
                        row.Offering_ID,
                        rankDisplay,
                        row.Wholesaler,
                        row.Origin_Country,
                        productTitle,
                        dimensions + warningIcon,
                        weight + warningIcon,
                        offeringPrice,
                        offeringPricePerPiece,
                        priceDisplay,
                        unitDisplay,
                        diffStr,
                        info.join(' ')
                    ];
                    
                    csv += formatCsvRow(rowValues) + '\n';
                });
            });
        });
    });
    
    return csv;
}

