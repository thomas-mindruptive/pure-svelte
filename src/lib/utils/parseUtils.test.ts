import { describe, it, expect } from 'vitest';
import { parseDimensions, parseWeightRange } from './parseUtils';

describe('parseDimensions', () => {
  describe('Empty/null/undefined inputs', () => {
    it('should accept null', () => {
      const result = parseDimensions(null);
      expect(result.valid).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should accept undefined', () => {
      const result = parseDimensions(undefined);
      expect(result.valid).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should accept empty string', () => {
      const result = parseDimensions('');
      expect(result.valid).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should accept whitespace-only string', () => {
      const result = parseDimensions('   ');
      expect(result.valid).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe('Single value format', () => {
    it('should parse "3cm"', () => {
      const result = parseDimensions('3cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [3],
        unit: 'cm',
      });
    });

    it('should parse "10mm"', () => {
      const result = parseDimensions('10mm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [10],
        unit: 'mm',
      });
    });

    it('should parse "1.5m"', () => {
      const result = parseDimensions('1.5m');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [1.5],
        unit: 'm',
      });
    });

    it('should parse "1,5cm" (comma as decimal separator)', () => {
      const result = parseDimensions('1,5cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [1.5],
        unit: 'cm',
      });
    });

    it('should handle whitespace "3 cm"', () => {
      const result = parseDimensions('3 cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [3],
        unit: 'cm',
      });
    });
  });

  describe('Range format', () => {
    it('should parse "1-3cm"', () => {
      const result = parseDimensions('1-3cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        range: { min: 1, max: 3 },
        unit: 'cm',
      });
    });

    it('should parse "5-10mm"', () => {
      const result = parseDimensions('5-10mm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        range: { min: 5, max: 10 },
        unit: 'mm',
      });
    });

    it('should parse "1,5 – 3 cm" (en-dash, comma, spaces)', () => {
      const result = parseDimensions('1,5 – 3 cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        range: { min: 1.5, max: 3 },
        unit: 'cm',
      });
    });

    it('should parse "0.5-2.5m"', () => {
      const result = parseDimensions('0.5-2.5m');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        range: { min: 0.5, max: 2.5 },
        unit: 'm',
      });
    });
  });

  describe('Multi-dimensional format', () => {
    it('should parse "10x5cm"', () => {
      const result = parseDimensions('10x5cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [10, 5],
        unit: 'cm',
      });
    });

    it('should parse "10 x 5 x 3 mm" (with spaces)', () => {
      const result = parseDimensions('10 x 5 x 3 mm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [10, 5, 3],
        unit: 'mm',
      });
    });

    it('should parse "2x3x4cm"', () => {
      const result = parseDimensions('2x3x4cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [2, 3, 4],
        unit: 'cm',
      });
    });

    it('should parse "1.5x2.5cm" (decimal values)', () => {
      const result = parseDimensions('1.5x2.5cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [1.5, 2.5],
        unit: 'cm',
      });
    });
  });

  describe('Range of multi-dimensional format (NEW)', () => {
    it('should parse "2x3cm - 4x5cm"', () => {
      const result = parseDimensions('2x3cm - 4x5cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        multiDimRange: {
          min: [2, 3],
          max: [4, 5],
        },
        unit: 'cm',
      });
    });

    it('should parse "2x3x5mm - 3x4x6mm"', () => {
      const result = parseDimensions('2x3x5mm - 3x4x6mm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        multiDimRange: {
          min: [2, 3, 5],
          max: [3, 4, 6],
        },
        unit: 'mm',
      });
    });

    it('should parse "1.5x2.5cm - 3.5x4.5cm" (decimal values)', () => {
      const result = parseDimensions('1.5x2.5cm - 3.5x4.5cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        multiDimRange: {
          min: [1.5, 2.5],
          max: [3.5, 4.5],
        },
        unit: 'cm',
      });
    });

    it('should parse "10x5 mm – 15x8 mm" (en-dash, spaces)', () => {
      const result = parseDimensions('10x5 mm – 15x8 mm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        multiDimRange: {
          min: [10, 5],
          max: [15, 8],
        },
        unit: 'mm',
      });
    });

    it('should reject mismatched dimensions "2x3cm - 4x5x6cm"', () => {
      const result = parseDimensions('2x3cm - 4x5x6cm');
      expect(result.valid).toBe(false);
      // Pattern doesn't match, falls through to generic error
      expect(result.error).toBeDefined();
    });

    it('should reject invalid range "5x6cm - 2x3cm" (min > max)', () => {
      const result = parseDimensions('5x6cm - 2x3cm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum must be less than or equal to maximum');
    });
  });

  describe('Bracket notation - 1 aspect (NEW)', () => {
    it('should parse "[25cm]" (single value)', () => {
      const result = parseDimensions('[25cm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { values: [25], unit: 'cm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[25-40cm]" (range)', () => {
      const result = parseDimensions('[25-40cm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { range: { min: 25, max: 40 }, unit: 'cm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[3x5mm]" (multi-dimensional)', () => {
      const result = parseDimensions('[3x5mm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { values: [3, 5], unit: 'mm' },
        ],
        unit: 'mm',
      });
    });

    it('should parse "[2x3cm - 4x5cm]" (range of multi-dimensional)', () => {
      const result = parseDimensions('[2x3cm - 4x5cm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { multiDimRange: { min: [2, 3], max: [4, 5] }, unit: 'cm' },
        ],
        unit: 'cm',
      });
    });
  });

  describe('Bracket notation - 2 aspects (NEW)', () => {
    it('should parse "[25-40cm][2-3cm]"', () => {
      const result = parseDimensions('[25-40cm][2-3cm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { range: { min: 25, max: 40 }, unit: 'cm' },
          { range: { min: 2, max: 3 }, unit: 'cm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[15cm][3x5mm]"', () => {
      const result = parseDimensions('[15cm][3x5mm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { values: [15], unit: 'cm' },
          { values: [3, 5], unit: 'mm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[40cm][8mm]"', () => {
      const result = parseDimensions('[40cm][8mm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { values: [40], unit: 'cm' },
          { values: [8], unit: 'mm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[2x3cm - 4x5cm][1-2mm]"', () => {
      const result = parseDimensions('[2x3cm - 4x5cm][1-2mm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { multiDimRange: { min: [2, 3], max: [4, 5] }, unit: 'cm' },
          { range: { min: 1, max: 2 }, unit: 'mm' },
        ],
        unit: 'cm',
      });
    });
  });

  describe('Bracket notation - 3 aspects (NEW)', () => {
    it('should parse "[15cm][3x5mm][1-2mm]"', () => {
      const result = parseDimensions('[15cm][3x5mm][1-2mm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { values: [15], unit: 'cm' },
          { values: [3, 5], unit: 'mm' },
          { range: { min: 1, max: 2 }, unit: 'mm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[8-12cm][2-5mm][0.5cm]"', () => {
      const result = parseDimensions('[8-12cm][2-5mm][0.5cm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { range: { min: 8, max: 12 }, unit: 'cm' },
          { range: { min: 2, max: 5 }, unit: 'mm' },
          { values: [0.5], unit: 'cm' },
        ],
        unit: 'cm',
      });
    });

    it('should parse "[1cm][2x3mm][4x5mm - 6x7mm]"', () => {
      const result = parseDimensions('[1cm][2x3mm][4x5mm - 6x7mm]');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        aspects: [
          { values: [1], unit: 'cm' },
          { values: [2, 3], unit: 'mm' },
          { multiDimRange: { min: [4, 5], max: [6, 7] }, unit: 'mm' },
        ],
        unit: 'cm',
      });
    });
  });

  describe('Error cases', () => {
    it('should reject missing unit "3"', () => {
      const result = parseDimensions('3');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });

    it('should reject invalid unit "3inch"', () => {
      const result = parseDimensions('3inch');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });

    it('should reject comma-separated "40cm, 8mm"', () => {
      const result = parseDimensions('40cm, 8mm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });

    it('should reject invalid range "5-3cm" (min > max)', () => {
      const result = parseDimensions('5-3cm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum dimension must be less than or equal to maximum');
    });

    it('should reject zero value "0cm"', () => {
      const result = parseDimensions('0cm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should reject negative value "-5cm"', () => {
      const result = parseDimensions('-5cm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });

    it('should reject empty brackets "[]"', () => {
      const result = parseDimensions('[]');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });

    it('should reject more than 3 brackets "[1cm][2cm][3cm][4cm]"', () => {
      const result = parseDimensions('[1cm][2cm][3cm][4cm]');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });

    it('should reject invalid bracket content "[abc]"', () => {
      const result = parseDimensions('[abc]');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid bracket content');
    });

    it('should reject unclosed bracket "[3cm"', () => {
      const result = parseDimensions('[3cm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid dimension format');
    });
  });

  describe('Edge cases', () => {
    it('should parse "3x3cm" (was previously invalid)', () => {
      const result = parseDimensions('3x3cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [3, 3],
        unit: 'cm',
      });
    });

    it('should handle case insensitivity "3CM"', () => {
      const result = parseDimensions('3CM');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [3],
        unit: 'cm',
      });
    });

    it('should trim whitespace "  3cm  "', () => {
      const result = parseDimensions('  3cm  ');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [3],
        unit: 'cm',
      });
    });

    it('should parse very small decimal "0.01mm"', () => {
      const result = parseDimensions('0.01mm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [0.01],
        unit: 'mm',
      });
    });

    it('should parse large value "9999cm"', () => {
      const result = parseDimensions('9999cm');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        values: [9999],
        unit: 'cm',
      });
    });
  });
});

describe('parseWeightRange', () => {
  describe('Basic functionality', () => {
    it('should parse "250g"', () => {
      const result = parseWeightRange('250g');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        min: 250,
        max: 250,
        unit: 'g',
      });
    });

    it('should parse "50-80g"', () => {
      const result = parseWeightRange('50-80g');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        min: 50,
        max: 80,
        unit: 'g',
      });
    });

    it('should parse "0.25kg" (converts to grams)', () => {
      const result = parseWeightRange('0.25kg');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        min: 250,
        max: 250,
        unit: 'kg',
      });
    });

    it('should parse "ca. 100g"', () => {
      const result = parseWeightRange('ca. 100g');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        min: 100,
        max: 100,
        unit: 'g',
      });
    });

    it('should accept null', () => {
      const result = parseWeightRange(null);
      expect(result.valid).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });
});
