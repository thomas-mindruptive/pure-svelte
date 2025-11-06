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
 * Supported formats:
 * - Single value: "250g", "250", "0.25kg"
 * - Range: "50-80g", "50-80", "0.05-0.08kg"
 * - Approximate: "ca. 100g", "ca 100"
 *
 * @param input - The weight string to parse (e.g., "50-80g")
 * @returns ParseResult with min/max weights in grams
 *
 * @example
 * parseWeightRange("250g")        // { valid: true, data: { min: 250, max: 250, unit: 'g' } }
 * parseWeightRange("50-80g")      // { valid: true, data: { min: 50, max: 80, unit: 'g' } }
 * parseWeightRange("ca. 100g")    // { valid: true, data: { min: 100, max: 100, unit: 'g' } }
 * parseWeightRange("0.25kg")      // { valid: true, data: { min: 250, max: 250, unit: 'kg' } }
 * parseWeightRange("invalid")     // { valid: false, error: "Invalid format..." }
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

  // Detect unit (default: grams)
  const unit: 'g' | 'kg' = trimmed.includes('kg') ? 'kg' : 'g';
  const unitMultiplier = unit === 'kg' ? 1000 : 1; // Convert kg to grams

  // Pattern 1: Single value - "250g", "250", "0.25kg"
  const singleMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(g|kg)?$/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]) * unitMultiplier;
    if (val <= 0) {
      return { valid: false, error: 'Weight must be greater than 0' };
    }
    return {
      valid: true,
      data: { min: val, max: val, unit }
    };
  }

  // Pattern 2: Range - "50-80g", "50-80", "0.05-0.08kg"
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(g|kg)?$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]) * unitMultiplier;
    const max = parseFloat(rangeMatch[2]) * unitMultiplier;

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

  // Pattern 3: Approximate - "ca. 100g", "ca 100", "ca. 0.1kg"
  const approxMatch = trimmed.match(/^ca\.?\s*(\d+(?:\.\d+)?)\s*(g|kg)?$/);
  if (approxMatch) {
    const val = parseFloat(approxMatch[1]) * unitMultiplier;
    if (val <= 0) {
      return { valid: false, error: 'Weight must be greater than 0' };
    }
    return {
      valid: true,
      data: { min: val, max: val, unit }
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
 * Supported formats:
 * - Single value: "3cm", "3"
 * - Range: "1-3cm", "1-3"
 *
 * @param input - The dimension string to parse (e.g., "1-3cm")
 * @returns ParseResult with min/max dimensions
 *
 * @example
 * parseDimensions("3cm")     // { valid: true, data: { min: 3, max: 3, unit: 'cm' } }
 * parseDimensions("1-3cm")   // { valid: true, data: { min: 1, max: 3, unit: 'cm' } }
 * parseDimensions("invalid") // { valid: false, error: "..." }
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

  // Extract unit (cm, mm, m, inch, etc.)
  const unitMatch = trimmed.match(/([a-z]+)$/);
  const unit = unitMatch ? unitMatch[1] : '';

  // Pattern 1: Single value - "3cm", "3"
  const singleMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    if (val <= 0) {
      return { valid: false, error: 'Dimension must be greater than 0' };
    }
    return {
      valid: true,
      data: { min: val, max: val, unit }
    };
  }

  // Pattern 2: Range - "1-3cm", "1-3"
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);

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
    error: 'Invalid dimension format. Use: "3cm" or "1-3cm"'
  };
}
