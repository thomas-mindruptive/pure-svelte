import { type ReportRow } from './analyze-config.js';
import {
    groupByGroupKey,
    groupByStone,
    groupByProductType,
    calculateRank,
    calculateDiff,
    calculateInfo,
    extractGroupKeyParts,
    sortCandidatesByPrice,
    formatCalcForCsv
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
 * Exportiert best_buy_report als CSV
 * Gruppiert nach Group_Key (ProductType > Material > Form)
 */
export function exportBestBuyReportToCsv(data: ReportRow[]): string {
    const { groups, sortedKeys } = groupByGroupKey(data);
    
    // Header
    const headers = [
        'Rang',
        'Offering ID',
        'Händler',
        'Herkunft',
        'Produkt',
        'Größe',
        'Gewicht',
        'Price',
        'Price/Piece',
        'Preis (Norm.)',
        'Calc',
        'vs. Winner',
        'Info'
    ];
    
    let csv = formatCsvRow(headers) + '\n';
    
    // Gruppen durchgehen
    sortedKeys.forEach(key => {
        const candidates = sortCandidatesByPrice(groups[key]);
        
        if (candidates.length === 0) return;
        
        const winner = candidates[0];
        
        // Zeilen für diese Gruppe
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
            const calcDisplay = formatCalcForCsv(row);
            
            const rowValues = [
                rankDisplay,
                row.Offering_ID,
                row.Wholesaler,
                row.Origin_Country,
                productTitle,
                dimensions + warningIcon,
                weight + warningIcon,
                offeringPrice,
                offeringPricePerPiece,
                priceDisplay,
                calcDisplay,
                diffStr,
                info.join(' ')
            ];
            
            csv += formatCsvRow(rowValues) + '\n';
        });
        
        // Leere Zeile zwischen Gruppen
        csv += '\n';
    });
    
    return csv;
}

/**
 * Exportiert best_buy_report_by_stone als CSV
 * Gruppiert nach Material (Stein) > Form, Drill-Down-Stil
 */
export function exportBestBuyByStoneToCsv(data: ReportRow[]): string {
    const { stoneGroups, sortedStones } = groupByStone(data);
    
    // Header
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
        'Gewicht',
        'Price',
        'Price/Piece',
        'Preis (Norm.)',
        'Calc',
        'vs. Winner',
        'Info'
    ];
    
    let csv = formatCsvRow(headers) + '\n';
    
    let lastStone = '';
    let lastProductType = '';
    let lastForm = '';
    
    sortedStones.forEach(stone => {
        const formGroups = stoneGroups[stone];
        const sortedForms = Object.keys(formGroups).sort();
        
        sortedForms.forEach(form => {
            const candidates = sortCandidatesByPrice(formGroups[form]);
            
            if (candidates.length === 0) return;
            
            const winner = candidates[0];
            
            candidates.forEach((row, index) => {
                const rankDisplay = calculateRank(index);
                const diffStr = calculateDiff(row, winner, index);
                const parts = extractGroupKeyParts(row.Group_Key);
                const productType = parts.productType;
                const info = calculateInfo(row);
                
                const productTitle = row.Product_Title;
                const dimensions = row.Dimensions || '-';
                const weight = row.Weight_Display || '-';
                const warningIcon = (row.Dimensions_Warning || row.Weight_Warning || row.Package_Weight_Warning) ? ' ⚠️' : '';
                const offeringPrice = row.Offering_Price.toFixed(2);
                const offeringPricePerPiece = row.Offering_Price_Per_Piece !== null ? row.Offering_Price_Per_Piece.toFixed(2) : '-';
                const priceDisplay = row.Final_Normalized_Price.toFixed(2);
                const calcDisplay = formatCalcForCsv(row);
                
                // Drill-Down: Stein, Produkttyp und Form nur in der ersten Zeile einer neuen Gruppe
                const isNewStone = (stone !== lastStone);
                const isNewProductType = (productType !== lastProductType || isNewStone);
                const isNewForm = (form !== lastForm || isNewStone);
                const showStone = (index === 0 && isNewStone) ? stone : '';
                const showProductType = (index === 0 && isNewProductType) ? productType : '';
                const showForm = (index === 0 && isNewForm) ? form : '';
                
                // Update lastStone, lastProductType und lastForm NUR nach der ersten Zeile einer neuen Gruppe
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
                    weight + warningIcon,
                    offeringPrice,
                    offeringPricePerPiece,
                    priceDisplay,
                    calcDisplay,
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
 * Exportiert best_buy_report_by_product_type als CSV
 * Gruppiert nach ProductType > Material (Stein) > Form, Drill-Down-Stil
 */
export function exportBestBuyByProductTypeToCsv(data: ReportRow[]): string {
    const { productTypeGroups, sortedProductTypes } = groupByProductType(data);
    
    // Header
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
        'Calc',
        'vs. Winner',
        'Info'
    ];
    
    let csv = formatCsvRow(headers) + '\n';
    
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
                const candidates = sortCandidatesByPrice(formGroups[form]);
                
                if (candidates.length === 0) return;
                
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
                    const calcDisplay = formatCalcForCsv(row);
                    
                    // Drill-Down: ProductType, Stein und Form nur in der ersten Zeile einer neuen Gruppe
                    const isNewProductType = (productType !== lastProductType);
                    const isNewStone = (stone !== lastStone || isNewProductType);
                    const isNewForm = (form !== lastForm || isNewProductType || isNewStone);
                    const showProductType = (index === 0 && isNewProductType) ? productType : '';
                    const showStone = (index === 0 && isNewStone) ? stone : '';
                    const showForm = (index === 0 && isNewForm) ? form : '';
                    
                    // Update lastProductType, lastStone und lastForm NUR nach der ersten Zeile einer neuen Gruppe
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
                        calcDisplay,
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

