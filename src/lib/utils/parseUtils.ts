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
  valid: boolean;
  data?: T;
  error?: string;
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

  const trimmed = input.trim().toLowerCase();

  if (trimmed === '') {
    return { valid: true };
  }

  // Pattern 1: Single value - "250g", "0.25kg" (unit REQUIRED)
  const singleMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(g|kg)$/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    const unit = singleMatch[2] as 'g' | 'kg';
    const unitMultiplier = unit === 'kg' ? 1000 : 1;
    const valInGrams = val * unitMultiplier;

    if (valInGrams <= 0) {
      return { valid: false, error: 'Weight must be greater than 0' };
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
      return { valid: false, error: 'Weight values must be greater than 0' };
    }
    if (min > max) {
      return { valid: false, error: 'Minimum weight must be less than or equal to maximum weight' };
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
      return { valid: false, error: 'Weight must be greater than 0' };
    }
    return {
      valid: true,
      data: { min: valInGrams, max: valInGrams, unit }
    };
  }

  return {
    valid: false,
    error: 'Invalid weight format. Use: "250g", "50-80g", "ca. 100g", or "0.25kg"'
  };
}

/**
 * Parses and validates dimension strings.
 *
 * Supported formats (unit REQUIRED, only mm/cm/m allowed):
 * - Single value: "3cm", "10mm", "1.5m", "1,5cm", "3 cm"
 * - Range: "1-3cm", "5-10mm", "1,5 - 3 cm"
 * - Accepts comma or dot as decimal separator
 * - Allows optional whitespace around values and units
 *
 * @param input - The dimension string to parse (e.g., "1-3cm" or "1,5 - 3 cm")
 * @returns ParseResult with min/max dimensions
 *
 * @example
 * parseDimensions("3cm")       // { valid: true, data: { min: 3, max: 3, unit: 'cm' } }
 * parseDimensions("1-3cm")     // { valid: true, data: { min: 1, max: 3, unit: 'cm' } }
 * parseDimensions("1,5 - 3 cm") // { valid: true, data: { min: 1.5, max: 3, unit: 'cm' } }
 * parseDimensions("10mm")      // { valid: true, data: { min: 10, max: 10, unit: 'mm' } }
 * parseDimensions("3")         // { valid: false, error: "..." } - unit required
 * parseDimensions("2-3")       // { valid: false, error: "..." } - unit required
 * parseDimensions("3inch")     // { valid: false, error: "..." } - invalid unit
 */
export function parseDimensions(input: string | null | undefined): ParseResult<{ min: number; max: number; unit: string }> {
  // Null/undefined is valid for optional fields
  if (!input) {
    return { valid: true };
  }

  const trimmed = input.trim().toLowerCase();

  if (trimmed === '') {
    return { valid: true };
  }

  // Pattern 1: Single value - "3cm", "10mm", "1.5m", "1,5cm" (unit REQUIRED: mm, cm, m)
  // Accept both comma and dot as decimal separator, optional whitespace
  const singleMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:(cm)|(mm)|(m))$/);
  if (singleMatch) {
    // Normalize comma to dot for parseFloat
    const valStr = singleMatch[1].replace(',', '.');
    const val = parseFloat(valStr);
    // Extract unit from the matching group (2=cm, 3=mm, 4=m)
    const unit = singleMatch[2] || singleMatch[3] || singleMatch[4];

    if (val <= 0) {
      return { valid: false, error: 'Dimension must be greater than 0' };
    }
    return {
      valid: true,
      data: { min: val, max: val, unit }
    };
  }

  // Pattern 2: Range - "1-3cm", "5-10mm", "4-5m", "1,5 - 3 cm" (unit REQUIRED: mm, cm, m)
  // Accept both comma and dot as decimal separator, optional whitespace
  const rangeMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*(?:(cm)|(mm)|(m))$/);

  if (rangeMatch) {
    // Normalize comma to dot for parseFloat
    const minStr = rangeMatch[1].replace(',', '.');
    const maxStr = rangeMatch[2].replace(',', '.');
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    // Extract unit from the matching group (3=cm, 4=mm, 5=m)
    const unit = rangeMatch[3] || rangeMatch[4] || rangeMatch[5];

    if (min <= 0 || max <= 0) {
      return { valid: false, error: 'Dimension values must be greater than 0' };
    }
    if (min > max) {
      return { valid: false, error: 'Minimum dimension must be less than or equal to maximum dimension' };
    }

    return {
      valid: true,
      data: { min, max, unit }
    };
  }

  return {
    valid: false,
    error: 'Invalid dimension format. Use: "3cm", "10mm", "1.5m", or "1-3cm" (unit required: mm, cm, m)'
  };
}
