/**
 * @file parseUtils.ts
 * @description Utility functions for parsing and validating user input strings
 *
 * Counterpart to formatUtils.ts:
 * - formatUtils: Formats data for OUTPUT (display to user)
 * - parseUtils: Parses data from INPUT (user input to structured data)
 */

/**
 * Result type for parsing operations
 */
export type ParseResult<T> = {
  valid: true;
  data?: T;
} | {
  valid: false;
  error: string;
};

/**
 * Parsed weight range data
 */
export type WeightRange = {
  min: number;
  max: number;
  unit: 'g' | 'kg';
};

/**
 * Single dimension aspect (for bracket notation)
 */
export interface DimensionAspect {
  unit: string;
  range?: { min: number; max: number };
  values?: number[];
  multiDimRange?: { min: number[]; max: number[] };
}

/**
 * Parsed dimension data structure.
 * Can contain either a range (min/max) or a list of dimensions (values).
 */
export interface ParsedDimensionData {
  unit: string;
  range?: { min: number; max: number };
  values?: number[];
  multiDimRange?: { min: number[]; max: number[] };
  aspects?: DimensionAspect[];
}

/**
 * Parses and validates weight range strings.
 *
 * Supported formats (unit REQUIRED):
 * - Single value: "250g", "0.25kg"
 * - Range: "50-80g", "0.05-0.08kg"
 * - Approximate: "ca. 100g", "ca 100g"
 *
 * @param input - The weight string to parse (e.g., "50-80g")
 * @returns ParseResult with min/max weights in grams
 *
 * @example
 * parseWeightRange("250g")        // { valid: true, data: { min: 250, max: 250, unit: 'g' } }
 * parseWeightRange("50-80g")      // { valid: true, data: { min: 50, max: 80, unit: 'g' } }
 * parseWeightRange("ca. 100g")    // { valid: true, data: { min: 100, max: 100, unit: 'g' } }
 * parseWeightRange("0.25kg")      // { valid: true, data: { min: 250, max: 250, unit: 'kg' } }
 * parseWeightRange("250")         // { valid: false, error: "Invalid format..." } - unit required
 * parseWeightRange("2-3")         // { valid: false, error: "Invalid format..." } - unit required
 */
export function parseWeightRange(input: string | null | undefined): ParseResult<WeightRange> {
  // Null/undefined is valid for optional fields
  if (!input) {
    return { valid: true };
  }

  // Normalize all Unicode whitespace (including non-breaking spaces, tabs, etc.) to regular spaces, then trim
  // This handles pasted text that may contain invisible whitespace characters
  const normalized = input.replace(/[\s\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, ' ').trim();

  if (normalized === '') {
    return { valid: true };
  }

  const trimmed = normalized.toLowerCase();

  // Pattern 1: Single value - "250g", "0.25kg" (unit REQUIRED)
  const singleMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(g|kg)$/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    const unit = singleMatch[2] as 'g' | 'kg';
    const unitMultiplier = unit === 'kg' ? 1000 : 1;
    const valInGrams = val * unitMultiplier;

    if (valInGrams <= 0) {
      return { valid: false, error: `Weight must be greater than 0: "${input}"` };
    }
    return {
      valid: true,
      data: { min: valInGrams, max: valInGrams, unit }
    };
  }

  // Pattern 2: Range - "50-80g", "0.05-0.08kg" (unit REQUIRED)
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(g|kg)$/);
  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[2]);
    const unit = rangeMatch[3] as 'g' | 'kg';
    const unitMultiplier = unit === 'kg' ? 1000 : 1;
    const min = minVal * unitMultiplier;
    const max = maxVal * unitMultiplier;

    if (min <= 0 || max <= 0) {
      return { valid: false, error: `Weight values must be greater than 0: "${input}"` };
    }
    if (min > max) {
      return { valid: false, error: `Minimum weight must be less than or equal to maximum weight: "${input}"` };
    }

    return {
      valid: true,
      data: { min, max, unit }
    };
  }

  // Pattern 3: Approximate - "ca. 100g", "ca 100g", "ca. 0.1kg" (unit REQUIRED)
  const approxMatch = trimmed.match(/^ca\.?\s*(\d+(?:\.\d+)?)\s*(g|kg)$/);
  if (approxMatch) {
    const val = parseFloat(approxMatch[1]);
    const unit = approxMatch[2] as 'g' | 'kg';
    const unitMultiplier = unit === 'kg' ? 1000 : 1;
    const valInGrams = val * unitMultiplier;

    if (valInGrams <= 0) {
      return { valid: false, error: `Weight must be greater than 0: "${input}"` };
    }
    return {
      valid: true,
      data: { min: valInGrams, max: valInGrams, unit }
    };
  }

  return {
    valid: false,
    error: `Invalid weight format: "${input}". Use: "250g", "50-80g", "ca. 100g", or "0.25kg"`
  };
}

/**
 * Helper function to parse a single dimension aspect (without brackets).
 * Supports: single value, range, multi-dimensional, and range of multi-dimensional.
 */
function parseSingleAspect(input: string): ParseResult<DimensionAspect> {
  const trimmed = input.trim().toLowerCase();

  // Pattern 1: Range of Multi-dimensional - "2x3cm - 4x5cm", "2x3x5mm - 3x4x6mm"
  const multiDimRangeMatch = trimmed.match(/^((?:\d+(?:[.,]\d+)?\s*x\s*)+\d+(?:[.,]\d+)?)\s*(cm|mm|m)\s*[-–—]\s*((?:\d+(?:[.,]\d+)?\s*x\s*)+\d+(?:[.,]\d+)?)\s*(cm|mm|m)$/);
  if (multiDimRangeMatch) {
    const unit1 = multiDimRangeMatch[2];
    const unit2 = multiDimRangeMatch[4];

    // Validate: both units must be the same
    if (unit1 !== unit2) {
      return { valid: false, error: `Both multi-dimensional ranges must use the same unit: "${input}"` };
    }

    const unit = unit1;

    // Parse min values (e.g., "2x3x5" -> [2, 3, 5])
    const minValues = multiDimRangeMatch[1]
      .split('x')
      .map(s => parseFloat(s.trim().replace(',', '.')));

    // Parse max values (e.g., "3x4x6" -> [3, 4, 6])
    const maxValues = multiDimRangeMatch[3]
      .split('x')
      .map(s => parseFloat(s.trim().replace(',', '.')));

    // Validate: same number of dimensions
    if (minValues.length !== maxValues.length) {
      return { valid: false, error: `Multi-dimensional range must have same number of dimensions: "${input}"` };
    }

    // Validate: all positive numbers
    if (minValues.some(v => isNaN(v) || v <= 0) || maxValues.some(v => isNaN(v) || v <= 0)) {
      return { valid: false, error: `All dimension values must be valid numbers greater than 0: "${input}"` };
    }

    // Validate: min <= max for each dimension
    for (let i = 0; i < minValues.length; i++) {
      if (minValues[i] > maxValues[i]) {
        return { valid: false, error: `Minimum must be less than or equal to maximum for each dimension: "${input}"` };
      }
    }

    return {
      valid: true,
      data: { multiDimRange: { min: minValues, max: maxValues }, unit }
    };
  }

  // Pattern 2: Multi-dimensional - "10x5cm", "10 x 5 x 3 mm"
  const multiDimMatch = trimmed.match(/^((?:\d+(?:[.,]\d+)?\s*x\s*)+\d+(?:[.,]\d+)?)\s*(cm|mm|m)$/);
  if (multiDimMatch) {
    const unit = multiDimMatch[2];
    const values = multiDimMatch[1]
      .split('x')
      .map(s => parseFloat(s.trim().replace(',', '.')));

    if (values.some(v => isNaN(v) || v <= 0)) {
      return { valid: false, error: `All dimension values must be valid numbers greater than 0: "${input}"` };
    }

    return {
      valid: true,
      data: { values, unit }
    };
  }

  // Pattern 3: Range - "1-3cm", "1,5 – 5 mm" (supports -, –, and —)
  const rangeMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)$/);
  if (rangeMatch) {
    const minStr = rangeMatch[1].replace(',', '.');
    const maxStr = rangeMatch[2].replace(',', '.');
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    const unit = rangeMatch[3];

    if (min <= 0 || max <= 0) {
      return { valid: false, error: `Dimension values must be greater than 0: "${input}"` };
    }
    if (min > max) {
      return { valid: false, error: `Minimum dimension must be less than or equal to maximum dimension: "${input}"` };
    }

    return {
      valid: true,
      data: { range: { min, max }, unit }
    };
  }

  // Pattern 4: Single value - "3cm", "1.5m"
  const singleMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(cm|mm|m)$/);
  if (singleMatch) {
    const valStr = singleMatch[1].replace(',', '.');
    const val = parseFloat(valStr);
    const unit = singleMatch[2];

    if (val <= 0) {
      return { valid: false, error: `Dimension must be greater than 0: "${input}"` };
    }
    return {
      valid: true,
      data: { values: [val], unit }
    };
  }

  return {
    valid: false,
    error: `Invalid dimension format: "${input}". Use: "10cm", "5-10mm", "10 x 5 x 3 m", or "2x3cm - 4x5cm" (unit required: mm, cm, m)`
  };
}

/**
 * Parses and validates dimension strings.
 *
 * Supported formats (unit REQUIRED, only mm/cm/m allowed):
 * - Single value: "3cm", "10mm", "1.5m", "1,5cm"
 * - Range: "1-3cm", "5-10mm", "1,5 – 3 cm" (supports -, –, and —)
 * - Multi-dimensional: "10x5cm", "10 x 5 x 3 mm"
 * - Range of multi-dimensional: "2x3cm - 4x5cm", "2x3x5mm - 3x4x6mm"
 * - Bracket notation (1-3 aspects): "[25-40cm][2-3cm]", "[15cm][3x5mm]"
 * - Accepts comma or dot as decimal separator
 * - Allows optional whitespace around values and units
 *
 * @param input - The dimension string to parse (e.g., "1-3cm", "10 x 5 cm", "[25-40cm][2-3cm]")
 * @returns ParseResult with structured dimension data
 *
 * @example
 * parseDimensions("3cm")                 // { valid: true, data: { values: [3], unit: 'cm' } }
 * parseDimensions("1-3cm")               // { valid: true, data: { range: { min: 1, max: 3 }, unit: 'cm' } }
 * parseDimensions("10 x 5 cm")           // { valid: true, data: { values: [10, 5], unit: 'cm' } }
 * parseDimensions("2x3cm - 4x5cm")       // { valid: true, data: { multiDimRange: { min: [2,3], max: [4,5] }, unit: 'cm' } }
 * parseDimensions("[25-40cm][2-3cm]")    // { valid: true, data: { aspects: [...], unit: 'cm' } }
 * parseDimensions("3")                   // { valid: false, error: "..." } - unit required
 * parseDimensions("3inch")               // { valid: false, error: "..." } - invalid unit
 */
export function parseDimensions(input: string | null | undefined): ParseResult<ParsedDimensionData> {
  // Null/undefined or empty strings are valid for optional fields
  if (!input || input.trim() === '') {
    return { valid: true };
  }

  const trimmed = input.trim();

  // Check for bracket notation: "[...]" or "[...][...]" or "[...][...][...]"
  const bracketMatch = trimmed.match(/^(\[[^\]]+\])(\[[^\]]+\])?(\[[^\]]+\])?$/);
  if (bracketMatch) {
    const aspects: DimensionAspect[] = [];
    const bracketContents: string[] = [];

    // Extract bracket contents
    for (let i = 1; i <= 3; i++) {
      if (bracketMatch[i]) {
        // Remove brackets
        const content = bracketMatch[i].slice(1, -1);
        bracketContents.push(content);
      }
    }

    // Parse each bracket content
    for (const content of bracketContents) {
      const result = parseSingleAspect(content);
      if (!result.valid) {
        return { valid: false, error: `Invalid bracket content: ${result.error}` };
      }
      aspects.push(result.data!);
    }

    // Use the first aspect's unit as the primary unit
    // (different units per aspect are allowed for multi-component products)
    const firstUnit = aspects[0].unit;

    return {
      valid: true,
      data: { aspects, unit: firstUnit }
    };
  }

  // No brackets - parse as single aspect
  const result = parseSingleAspect(trimmed);
  if (!result.valid) {
    return result;
  }

  // Convert single aspect to ParsedDimensionData format
  const { unit, range, values, multiDimRange } = result.data!;
  const data: ParsedDimensionData = { unit };
  if (range !== undefined) data.range = range;
  if (values !== undefined) data.values = values;
  if (multiDimRange !== undefined) data.multiDimRange = multiDimRange;

  return {
    valid: true,
    data
  };
}
