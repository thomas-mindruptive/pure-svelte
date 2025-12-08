# Wholesaler Price Analysis Tool

Comprehensive documentation for the wholesaler price comparison and analysis system.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Pricing Pipeline](#pricing-pipeline)
- [Weight Determination](#weight-determination)
- [Calculation Methods](#calculation-methods)
- [Report Generation](#report-generation)
- [File Structure](#file-structure)

---

## Overview

This tool analyzes wholesaler offerings to find the best prices across different suppliers. It normalizes prices to comparable units (€/kg or €/Stk) by:

1. **Detecting bulk discounts** from comment fields
2. **Applying import markup** for non-EU suppliers (+25%)
3. **Determining pricing strategy** (weight-based vs unit-based)
4. **Calculating normalized prices** for fair comparison
5. **Generating detailed reports** (Markdown + CSV)

### Key Features

✅ **Smart bulk price detection** - Finds discounts in comment text  
✅ **Automatic weight calculation** - From exact data, ranges, packaging, or geometry  
✅ **Import cost adjustment** - 25% markup for non-EU countries  
✅ **Flexible pricing strategies** - Per kg for raw materials, per piece for finished goods  
✅ **Transparent calculations** - Full trace of all steps  

---

## Quick Start

### Run Analysis from Database

```bash
npm run an:ws-price
```


### Output Files

Reports are saved to `tools/analysis/reports/`:

- `report.md` - Main comparison report
- `report_by_stone.md` - Grouped by material
- `report_by_product_type.md` - Grouped by product type
- `*.csv` - CSV versions of all reports

---

## Architecture

### Data Flow

```
┌─────────────────┐
│  Data Sources   │
│  (DB / CSV)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Normalization  │  → NormalizedOffering
│  Adapters       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Pricing Pipeline│  → ReportRow
│  (6 steps)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Report Builder  │  → MD + CSV
│  (Grouping)     │
└─────────────────┘
```

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| **Entry Point** | `analyze-wholesaler-main.ts` | CLI interface, orchestration |
| **Data Adapters** | `analyze-wholesaler.ts` | Normalize data from DB/CSV |
| **Pricing Pipeline** | `pricing-pipeline.ts` | 6-step price transformation |
| **Weight Logic** | `analyze-wholesaler.ts` | Determine weight from various sources |
| **Report Generation** | `report-builder.ts` | Generate MD reports |
| **CSV Export** | `csv-report-builder.ts` | Generate CSV reports |
| **Grouping & Ranking** | `report-grouping.ts` | Group, sort, rank offerings |

---

## Pricing Pipeline

The pricing pipeline transforms raw offering data into comparable normalized prices through **6 discrete steps**:

### Pipeline Steps

```typescript
┌──────────────────────────────────────────────────────────┐
│  INPUT: NormalizedOffering + listPrice                   │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP A: detectBestPrice()                              │
│  → Find bulk discounts in comment field                │
│  → Result: price (list or bulk)                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP B: calculateLandedCost()                          │
│  → Apply +25% markup for non-EU countries              │
│  → Result: effectivePrice                              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP C: determinePricingStrategy()                     │
│  → Choose WEIGHT (€/kg) or UNIT (€/Stk)                │
│  → Result: strategy                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP D: calculateNormalizedPrice()                     │
│  → Calculate comparable price (divide by weight)        │
│  → Result: normalizedPrice + unit                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP E: extractMetadata()                              │
│  → Extract dimensions, package weight, warnings         │
│  → Result: metadata                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP F: buildReportRow()                               │
│  → Assemble final ReportRow with all fields            │
│  → Result: Complete ReportRow                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  OUTPUT: ReportRow (ready for reporting)                │
└─────────────────────────────────────────────────────────┘
```

### Step A: Bulk Price Detection

**Purpose**: Find better prices hidden in comment text

**How it works**:
1. Search comment for price patterns using regex: `/[\$€]?\s?(\d+[\.,]?\d{0,2})/g`
2. Validate each match:
   - Must be **< list price** (otherwise not a discount)
   - Must be **> 10% of list price** (filters false positives like "2mm")
3. Return lowest valid price found

**Example**:
```
List price: 4.50€
Comment: "ab 50 Stück: 3.20 EUR"
→ Bulk price: 3.20€ (29% discount)
```

**Helper Functions**:
- `extractPricesFromComment()` - Extract all price-like patterns
- `findLowestValidPrice()` - Find lowest valid price
- `extractCommentExcerpt()` - Get context around price

### Step B: Landed Cost Calculation

**Purpose**: Account for import costs from non-EU suppliers

**Business Logic**:
- **EU suppliers**: No markup (free trade)
- **Non-EU suppliers**: +25% markup for:
  - Import duties and taxes
  - Shipping costs
  - Customs clearance
  - Currency conversion fees

**Formula**:
```typescript
if (isEU) {
    effectivePrice = price
} else {
    effectivePrice = price × 1.25  // +25%
}
```

**Example**:
```
Price: 100€
Origin: China (non-EU)
→ Effective price: 125€
```

### Step C: Pricing Strategy Determination

**Purpose**: Decide between weight-based (€/kg) or unit-based (€/Stk) pricing

**Decision Logic** (priority order):

1. **Preset WEIGHT**: Product type configured for weight pricing
   - Example: "Rohsteine" (raw stones)
   - → Always use €/kg

2. **Preset UNIT**: Product type configured for unit pricing
   - Example: "Anhänger" (pendants)
   - → Always use €/Stk

3. **AUTO**: No preset, check weight availability
   - Weight available → €/kg
   - No weight → €/Stk

**Configuration**: See `STRATEGY_MAP` in `analyze-config.ts`

### Step D: Normalized Price Calculation

**Purpose**: Calculate the final comparable price

**Weight Strategy** (€/kg):
```typescript
normalizedPrice = effectivePrice / weightKg
```

**Unit Strategy** (€/Stk):
```typescript
normalizedPrice = effectivePrice  // no division
```

**Example**:
```
Effective price: 10.00€
Weight: 0.05kg (50g)
→ Normalized price: 200.00 €/kg
```

### Step E: Metadata Extraction

**Purpose**: Extract dimensions, package weight, and warnings

**Extracted Data**:
- **Dimensions**: From `offeringDimensions` or `offeringPackaging`
- **Package Weight**: From `offeringPackaging` or `offeringPackageWeight`
- **Warnings**: Data quality issues (conflicts, suspicious values)

**Purpose**: Context for buyers (doesn't affect price calculations)

### Step F: Report Row Assembly

**Purpose**: Combine all pipeline results into final `ReportRow`

**Output Fields**:
- Identification (Product_Type, Material_Name, Form_Name, Wholesaler)
- Raw inputs (prices, weights)
- Calculated values (bulk price, weight, markup)
- Metadata (dimensions, package weight)
- Final result (normalized price, unit)
- Debug trace

---

## Weight Determination

Weight is determined using a **priority cascade** - the first available method wins.

### Priority Order

```
1. BULK     → Packaging weight (most reliable for bulk orders)
2. EXACT    → offeringWeightGrams field (direct measurement)
3. RANGE    → Weight range average (supplier estimate)
4. CALC     → Geometric calculation (computed estimate)
```

### Method Details

#### 1. BULK - Bulk Packaging Weight

**Source**: `offeringPackaging` or `offeringPackageWeight`

**Examples**:
- "bulk 1 kg" → 1.0 kg
- "5kg" → 5.0 kg
- "Pkg: 10 kg" → 10.0 kg

**When used**: Bulk orders where packaging weight is specified

#### 2. EXACT - Explicit Weight Field

**Source**: `offeringWeightGrams`

**Example**:
- offeringWeightGrams = 50 → 0.050 kg

**When used**: Individual items with exact weight measurements

#### 3. RANGE - Weight Range Average

**Source**: `offeringWeightRange`

**Examples**:
- "50-100g" → 75g (average)
- "30 - 50 g" → 40g (average)

**When used**: Items with variable weight (natural products)

#### 4. CALC - Geometric Calculation

**Sources**: 
- `offeringDimensions` (e.g., "20x30x15 mm")
- Form factor (sphere ≈ 0.52, cube = 1.0)
- Material density (e.g., Amethyst = 2.65 g/cm³)

**Formula**:
```typescript
// 1. Parse dimensions
dimensions = "20x30x15 mm" → L=20, W=30, H=15

// 2. Calculate bounding box volume
volume = L × W × H = 20 × 30 × 15 = 9000 mm³ = 9 cm³

// 3. Apply form factor
// Sphere: formFactor ≈ 0.52 (sphere volume / bounding box volume)
// Cube: formFactor = 1.0
realVolume = volume × formFactor

// 4. Calculate weight
weight = realVolume × density
// Example: 9 × 0.52 × 2.65 = 12.4g
```

**When used**: No other weight data available, but dimensions exist

**Lookup Tables**:
- Form factors: `material-densities.ts` → `FORM_FACTORS`
- Material densities: `material-densities.ts` → `MATERIAL_DENSITIES`

---

## Calculation Methods

Summary of all calculation methods used in the system.

### Price Calculations

| Calculation | Formula | Example |
|-------------|---------|---------|
| **Bulk Discount** | Find lowest price in comment | "ab 50: 3.20€" → 3.20€ |
| **Import Markup** | price × 1.25 (non-EU) | 100€ → 125€ |
| **Normalized Price (WEIGHT)** | effectivePrice / weightKg | 10€ / 0.05kg = 200 €/kg |
| **Normalized Price (UNIT)** | effectivePrice | 10€ = 10 €/Stk |

### Weight Calculations

| Method | Formula | Example |
|--------|---------|---------|
| **BULK** | Parse from packaging | "5 kg" → 5.0 kg |
| **EXACT** | weightGrams / 1000 | 50g → 0.050 kg |
| **RANGE** | (min + max) / 2 / 1000 | "50-100g" → 0.075 kg |
| **CALC** | volume × formFactor × density | 9cm³ × 0.52 × 2.65 = 12.4g |

### Geometric Weight Calculation (Detailed)

**Step 1: Parse Dimensions**
```typescript
"20x30x15 mm" → { L: 20, W: 30, H: 15, unit: "mm" }
```

**Step 2: Calculate Volume**
```typescript
volume_mm³ = 20 × 30 × 15 = 9000 mm³
volume_cm³ = 9000 / 1000 = 9 cm³
```

**Step 3: Lookup Form Factor**
```typescript
// Examples from FORM_FACTORS
"Kugel" (sphere) → 0.5236  // π/6 ≈ 0.52
"Würfel" (cube) → 1.0      // fills box completely
"Pyramide" → 0.333         // 1/3 of box
"Herz" (heart) → 0.65      // estimated
```

**Step 4: Lookup Material Density**
```typescript
// Examples from MATERIAL_DENSITIES (g/cm³)
"Amethyst" → 2.65
"Bergkristall" → 2.65
"Rosenquarz" → 2.65
"Obsidian" → 2.35
"Jade" → 3.00
```

**Step 5: Calculate Weight**
```typescript
weight_g = volume_cm³ × formFactor × density_g/cm³
weight_g = 9 × 0.5236 × 2.65 = 12.48g
weight_kg = 12.48 / 1000 = 0.01248 kg
```

---

## Report Generation

### Report Types

1. **Best Buy Report** (`report.md`)
   - All offerings sorted by normalized price
   - Includes all fields, full transparency

2. **Report by Stone** (`report_by_stone.md`)
   - Grouped by material (e.g., Amethyst, Bergkristall)
   - Shows best offers per material

3. **Report by Product Type** (`report_by_product_type.md`)
   - Grouped by Product Type > Material > Form
   - Hierarchical drill-down structure

### Report Fields

| Field | Description |
|-------|-------------|
| **Rang** | Rank within group (1 = best price) |
| **±** | Price difference vs. best offer in group |
| **ℹ️** | Price difference vs. best offer across all groups |
| **Wholesaler** | Supplier name |
| **Herkunft** | Origin country (affects import markup) |
| **Produkt** | Product title (truncated) |
| **Gewicht** | Weight display (e.g., "50g", "1.25kg") |
| **Einheit** | Unit (€/kg or €/Stk) with calculation tooltip |
| **Preis (Norm.)** | Final normalized price for comparison |

### Grouping & Ranking

**Grouping**:
```typescript
// By Product Type > Material > Form
"Anhänger > Amethyst > Kugel"
"Anhänger > Amethyst > Herz"
"Handstein > Bergkristall > Oval"
```

**Ranking** (within each group):
```typescript
1. Sort by Final_Normalized_Price (ascending)
2. Assign rank 1, 2, 3, ...
3. Calculate price differences:
   - ± vs. best in group (Rang 1)
   - ℹ️ vs. best across all groups
```

---

## File Structure

```
tools/analysis/
├── README-Analysis.md              ← This file
│
├── analyze-wholesaler-main.ts      ← Entry point (CLI)
├── analyze-wholesaler.ts           ← Core logic, data adapters
├── pricing-pipeline.ts             ← 6-step pricing transformation
│
├── analyze-config.ts               ← Constants, interfaces, config
├── geometry-utils.ts               ← Dimension parsing, volume calc
├── material-densities.ts           ← Form factors, material densities
├── parser-utils.ts                 ← Text parsing utilities
├── parse-csv.ts                    ← CSV file parsing
│
├── report-builder.ts               ← Markdown report generation
├── csv-report-builder.ts           ← CSV report generation
├── report-grouping.ts              ← Grouping, ranking, formatting
├── output.ts                       ← File saving, console output
│
└── reports/                        ← Generated reports (output)
    ├── report.md
    ├── report_by_stone.md
    ├── report_by_product_type.md
    └── *.csv
```

### Module Dependencies

```
analyze-wholesaler-main.ts
    └── analyze-wholesaler.ts
        ├── pricing-pipeline.ts
        │   ├── analyze-config.ts
        │   └── parser-utils.ts
        ├── geometry-utils.ts
        │   └── material-densities.ts
        ├── report-builder.ts
        │   ├── report-grouping.ts
        │   └── csv-report-builder.ts
        └── output.ts
```

---

## Data Structures

### NormalizedOffering

Unified data structure used throughout the pipeline:

```typescript
interface NormalizedOffering {
    wholesalerName: string;
    wholesalerId: number;
    wholesalerCountry: string | null;      // Used for import markup
    productTypeName: string;
    finalMaterialName: string | null;
    finalFormName: string | null;
    offeringTitle: string;
    offeringPrice: number;                  // List price
    offeringPricePerPiece: number | null;
    offeringWeightGrams: number | null;     // Exact weight
    offeringComment: string | null;         // May contain bulk pricing
    offeringPackaging: string | null;       // e.g., "10 kg"
    offeringDimensions: string | null;      // e.g., "20x30x15 mm"
    offeringWeightRange: string | null;     // e.g., "50-100g"
    offeringPackageWeight: string | null;
    offeringId: number;
}
```

### ReportRow

Final output structure for reports:

```typescript
interface ReportRow {
    // Identification
    Row_ID: string;
    Offering_ID: number;
    Product_Type: string;                   // e.g., "Anhänger"
    Material_Name: string;                  // e.g., "Amethyst"
    Form_Name: string;                      // e.g., "Kugel"
    Wholesaler: string;
    Origin_Country: string;
    Product_Title: string;

    // Raw inputs
    Raw_Price_List: number;
    Offering_Price: number;
    Offering_Price_Per_Piece: number | null;
    Raw_Weight_Input: string;

    // Calculated values
    Detected_Bulk_Price: number;
    Detected_Weight_Kg: number | null;
    Applied_Markup_Pct: number;

    // Metadata
    Dimensions: string | null;
    Dimensions_Source: string;
    Dimensions_Warning: string | null;
    Weight_Display: string;                 // e.g., "50g", "1.25kg"
    Weight_Source: string;                  // EXACT, CALC, RANGE, BULK
    Weight_Warning: string | null;
    Package_Weight: string | null;
    Package_Weight_Warning: string | null;

    // Final result
    Final_Normalized_Price: number;         // Comparable price
    Unit: '€/kg' | '€/Stk' | 'ERR';
    Calculation_Method: string;
    Calculation_Tooltip: string;
    Calculation_Trace: string;              // Debug trace
}
```

---

## Configuration

### Strategy Map

Define pricing strategy per product type in `analyze-config.ts`:

```typescript
export const STRATEGY_MAP: Record<string, 'WEIGHT' | 'UNIT' | 'AUTO'> = {
    'Rohsteine': 'WEIGHT',      // Always €/kg
    'Trommelsteine': 'WEIGHT',
    'Anhänger': 'AUTO',         // Decide based on weight availability
    'Handstein': 'AUTO',
    'Schmuck': 'UNIT',          // Always €/Stk
};
```

### Import Markup

Configure import costs in `analyze-config.ts`:

```typescript
export const IMPORT_MARKUP = 1.25;  // 25% markup for non-EU

export const EU_ZONE = new Set([
    'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PL', 
    'CZ', 'HU', 'RO', 'BG', 'GR', 'PT', 'SE', 'FI',
    // ... all EU countries
]);
```

### Material Densities

Add new materials/forms in `material-densities.ts`:

```typescript
export const MATERIAL_DENSITIES: Record<string, number> = {
    'Amethyst': 2.65,
    'Bergkristall': 2.65,
    'Rosenquarz': 2.65,
    // ... add more materials
};

export const FORM_FACTORS: Record<string, number> = {
    'Kugel': 0.5236,    // π/6 for sphere
    'Würfel': 1.0,      // cube fills box
    'Herz': 0.65,       // estimated
    // ... add more forms
};
```

---

## Example Walkthrough

Let's trace a complete example through the pipeline:

### Input Data
```typescript
{
    wholesalerName: "Crystal Imports GmbH",
    wholesalerCountry: "DE",
    productTypeName: "Anhänger",
    finalMaterialName: "Amethyst",
    finalFormName: "Kugel",
    offeringTitle: "Amethyst Kugel Anhänger poliert",
    offeringPrice: 4.50,
    offeringWeightGrams: 50,
    offeringComment: "ab 50 Stück: 3.20 EUR pro Stück",
    offeringDimensions: "20mm Ø",
    offeringId: 12345
}
```

### Pipeline Execution

**STEP A: detectBestPrice()**
```
Input: offeringComment = "ab 50 Stück: 3.20 EUR pro Stück", listPrice = 4.50
Process:
  - Extract prices: [50, 3.20]
  - Validate: 50 > 4.50 (invalid), 3.20 < 4.50 && 3.20 > 0.45 (valid)
  - Find lowest: 3.20
Output: { price: 3.20, source: 'Bulk (Comment)' }
```

**STEP B: calculateLandedCost()**
```
Input: price = 3.20, country = "DE"
Process:
  - Check EU: DE is in EU_ZONE
  - No markup needed
Output: { effectivePrice: 3.20, markupPct: 0, country: "DE", isEu: true }
```

**STEP C: determinePricingStrategy()**
```
Input: productTypeName = "Anhänger"
Process:
  - Check STRATEGY_MAP["Anhänger"] = 'AUTO'
  - Check weight availability: offeringWeightGrams = 50 (available)
  - Strategy: WEIGHT
Output: { strategy: 'WEIGHT' }
```

**STEP D: calculateNormalizedPrice()**
```
Input: effectivePrice = 3.20, strategy = 'WEIGHT'
Process:
  - Determine weight:
    - Check BULK: no packaging
    - Check EXACT: offeringWeightGrams = 50g → 0.050 kg ✓
  - Calculate: 3.20 / 0.050 = 64.00
Output: { normalizedPrice: 64.00, unit: '€/kg', weightKg: 0.050, calcMethod: 'EXACT' }
```

**STEP E: extractMetadata()**
```
Input: offering
Process:
  - Extract dimensions: "20mm Ø" → "20mm Ø"
  - No package weight
Output: { dimensions: "20mm Ø", dimensionsSource: "Field", ... }
```

**STEP F: buildReportRow()**
```
Assembles all results into final ReportRow:
{
    Product_Type: "Anhänger",
    Material_Name: "Amethyst",
    Form_Name: "Kugel",
    Wholesaler: "Crystal Imports GmbH",
    Origin_Country: "DE",
    Detected_Bulk_Price: 3.20,
    Detected_Weight_Kg: 0.050,
    Applied_Markup_Pct: 0,
    Weight_Display: "50g",
    Final_Normalized_Price: 64.00,
    Unit: "€/kg",
    Calculation_Method: "EXACT",
    ...
}
```

### Final Result

**Report Display**:
```
| Rang | Wholesaler | Gewicht | Einheit | Preis (Norm.) |
|------|------------|---------|---------|---------------|
| 1    | Crystal Imports GmbH | 50g | <abbr title="...">€/kg</abbr> | 64.00 |
```

**Interpretation**:
- Best bulk price found: 3.20€ (was 4.50€)
- Weight: 50g (from exact field)
- Normalized: 64.00 €/kg
- Origin: Germany (no import markup)

---

## Debugging

### Enable Trace Logging

Each pipeline step adds trace entries. They're included in the `Calculation_Trace` field:

```
💰 Bulk Found: 3.20 (was 4.50) | 💬 Comment: "...ab 50 Stück: 3.20 EUR..." | 🌍 Origin: DE (EU - no markup) | ⚖️ Weight Strat: EXACT (0.050kg)
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **999999 €/kg** | WEIGHT strategy but no weight data | Add weight data or change to UNIT strategy |
| **Suspiciously high price** | False bulk price detected | Check comment field for numbers like "2mm" |
| **Wrong weight** | Incorrect form factor or density | Update `FORM_FACTORS` or `MATERIAL_DENSITIES` |
| **Missing import markup** | Country not recognized | Add country to `EU_ZONE` if applicable |

### Validation

Check for data quality issues in reports:

- **Dimensions_Warning**: Suspicious or missing dimensions
- **Package_Weight_Warning**: Conflicting package weights
- **Weight_Warning**: Currently unused (reserved)

---

## Future Enhancements

Potential improvements:

- [ ] Machine learning for form factor estimation
- [ ] Automatic currency conversion
- [ ] Historical price tracking
- [ ] Supplier reliability scoring
- [ ] API integration for live data
- [ ] Web UI for interactive reports

---