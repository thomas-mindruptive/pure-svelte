// src/lib/backendQueries/tableRegistry.test.ts

/**
 * @file Tests für Table Registry System - Phase 1
 * @description Validiert dass die neue Alias-basierte Type-Generation korrekt funktioniert
 */

import { describe, it, expect } from 'vitest';
import {
  TableRegistry,
  AliasedTableRegistry,
  getTableConfigByAlias,
  validateSelectColumns,
  type ValidFromClause
} from './tableRegistry';

describe('Table Registry - Phase 1: Alias-basierte Types', () => {

  it('should create AliasedTableRegistry correctly', () => {
    // Test dass alle Aliases richtig gemappt sind
    expect(AliasedTableRegistry.w).toBe(TableRegistry.wholesalers);
    expect(AliasedTableRegistry.pc).toBe(TableRegistry.categories);
    expect(AliasedTableRegistry.pd).toBe(TableRegistry.product_definitions);
    expect(AliasedTableRegistry.wio).toBe(TableRegistry.offerings);

    // Test dass Table-Namen korrekt sind
    expect(AliasedTableRegistry.w.tableName).toBe('wholesalers');
    expect(AliasedTableRegistry.pc.tableName).toBe('product_categories');
  });

  it('should resolve table config by alias', () => {
    const wholesalerConfig = getTableConfigByAlias('w');
    expect(wholesalerConfig?.tableName).toBe('wholesalers');
    expect(wholesalerConfig?.alias).toBe('w');
    expect(wholesalerConfig?.dbSchema).toBe('dbo');

    const categoryConfig = getTableConfigByAlias('pc');
    expect(categoryConfig?.tableName).toBe('product_categories');
    expect(categoryConfig?.alias).toBe('pc');
  });

  it('should validate select columns correctly based on JOIN presence', () => {
    // Valid qualified columns in JOIN queries sollten keine Fehler werfen
    expect(() => {
      validateSelectColumns([
        'w.wholesaler_id',
        'w.name',
        'pc.category_id',
        'pc.name AS category_name'
      ], true); // hasJoins = true
    }).not.toThrow();

    // Valid unqualified columns in single-table queries sollten keine Fehler werfen
    expect(() => {
      validateSelectColumns([
        'wholesaler_id',
        'name',
        'status'
      ], false); // hasJoins = false
    }).not.toThrow();

    // Invalid qualified columns sollten Fehler werfen
    expect(() => {
      validateSelectColumns(['w.invalid_column'], true);
    }).toThrow(/Column 'invalid_column' not found in schema for alias 'w'/);

    // Unqualified columns in JOIN queries sollten Fehler werfen
    expect(() => {
      validateSelectColumns(['wholesaler_id'], true);
    }).toThrow(/Unqualified column 'wholesaler_id' found in JOIN query/);
  });

  it('should handle aggregate functions and wildcards', () => {
    // Aggregate functions und wildcards sollten keine Validierung triggern
    expect(() => {
      validateSelectColumns([
        'w.*',
        'COUNT(w.wholesaler_id)',
        'SUM(wio.price)',
        'w.name AS supplier_name'
      ], true); // hasJoins = true
    }).not.toThrow();
  });

  // Type-Tests (diese werden zur Compile-Zeit geprüft)
  it('should generate correct ValidFromClause types', () => {
    // Test dass ValidFromClause korrekte Struktur hat
    const validFrom: ValidFromClause = {
      table: 'dbo.wholesalers',
      alias: 'w'
    };

    expect(validFrom.table).toBe('dbo.wholesalers');
    expect(validFrom.alias).toBe('w');
  });

  it('should generate correct AliasToEntityMap types', () => {
    // Test dass AliasToEntityMap die richtigen Entity-Types mappt
    // Zur Laufzeit können wir die Schema-Keys prüfen
    const wholesalerKeys = AliasedTableRegistry.w.schema.keyof().options;
    expect(wholesalerKeys).toContain('wholesaler_id');
    expect(wholesalerKeys).toContain('name');

    const categoryKeys = AliasedTableRegistry.pc.schema.keyof().options;
    expect(categoryKeys).toContain('category_id');
    expect(categoryKeys).toContain('name');
  });

});