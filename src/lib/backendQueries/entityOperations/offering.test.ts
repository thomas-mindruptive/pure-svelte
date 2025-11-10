// File: src/lib/backendQueries/entityOperations/offering.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { loadOfferingsFromViewWithLinks } from './offering';
import type { Transaction } from 'mssql';

describe('loadOfferingsFromViewWithLinks', () => {
  let transaction: Transaction;

  beforeAll(async () => {
    const pool = await db;
    transaction = pool.transaction();
    await transaction.begin();
  });

  afterAll(async () => {
    if (transaction) {
      await transaction.rollback();
    }
  });

  it('should load offerings from view with links', async () => {
    // Call the function
    const offerings = await loadOfferingsFromViewWithLinks(transaction);

    // Assertions
    expect(offerings).toBeDefined();
    expect(Array.isArray(offerings)).toBe(true);

    // Log the results for inspection
    console.log(`[TEST] Loaded ${offerings.length} offerings`);

    if (offerings.length > 0) {
      const firstOffering = offerings[0];

      // Check that view columns exist
      expect(firstOffering).toHaveProperty('wioId');
      expect(firstOffering).toHaveProperty('wioTitle');
      expect(firstOffering).toHaveProperty('wsName');
      expect(firstOffering).toHaveProperty('ptName');
      expect(firstOffering).toHaveProperty('catName');
      expect(firstOffering).toHaveProperty('pdefTitle');

      // Check that links property exists
      expect(firstOffering).toHaveProperty('links');
      expect(Array.isArray(firstOffering.links)).toBe(true);

      console.log('[TEST] First offering sample:', {
        wioId: firstOffering.wioId,
        wioTitle: firstOffering.wioTitle,
        wsName: firstOffering.wsName,
        ptName: firstOffering.ptName,
        linksCount: firstOffering.links?.length || 0,
        firstLink: firstOffering.links?.[0] || null
      });

      // If there are links, check their structure
      if (firstOffering.links && firstOffering.links.length > 0) {
        const firstLink = firstOffering.links[0];
        expect(firstLink).toHaveProperty('link_id');
        expect(firstLink).toHaveProperty('offering_id');
        expect(firstLink).toHaveProperty('url');

        console.log('[TEST] First link structure:', firstLink);
      } else {
        console.log('[TEST] First offering has no links');
      }
    } else {
      console.warn('[TEST] No offerings returned from view');
    }
  });

  it('should load offerings with WHERE filter', async () => {
    // Test with a simple WHERE condition to limit results
    const whereCondition = {
      key: 'wioId',
      whereCondOp: '<' as const,
      val: 100
    };

    const offerings = await loadOfferingsFromViewWithLinks(
      transaction,
      whereCondition,
      undefined,
      10 // limit to 10
    );

    expect(offerings).toBeDefined();
    expect(Array.isArray(offerings)).toBe(true);
    expect(offerings.length).toBeLessThanOrEqual(10);

    console.log(`[TEST] Loaded ${offerings.length} offerings with WHERE filter`);

    // Verify all returned offerings have wioId < 100
    offerings.forEach(offering => {
      expect(offering.wioId).toBeLessThan(100);
    });
  });

  it('should load offerings with ORDER BY', async () => {
    const sortDescriptors = [
      { key: 'wioTitle', direction: 'asc' as const }
    ];

    const offerings = await loadOfferingsFromViewWithLinks(
      transaction,
      undefined,
      sortDescriptors,
      5 // limit to 5 for easier verification
    );

    expect(offerings).toBeDefined();
    expect(Array.isArray(offerings)).toBe(true);

    if (offerings.length > 1) {
      // Verify sorting by comparing consecutive titles
      for (let i = 0; i < offerings.length - 1; i++) {
        const current = offerings[i].wioTitle || '';
        const next = offerings[i + 1].wioTitle || '';
        expect(current.localeCompare(next)).toBeLessThanOrEqual(0);
      }
      console.log('[TEST] Verified ascending order by wioTitle');
    }
  });

  it('should handle LIMIT and OFFSET', async () => {
    const limit = 3;
    const offset = 2;

    const offerings = await loadOfferingsFromViewWithLinks(
      transaction,
      undefined,
      undefined,
      limit,
      offset
    );

    expect(offerings).toBeDefined();
    expect(Array.isArray(offerings)).toBe(true);
    expect(offerings.length).toBeLessThanOrEqual(limit);

    console.log(`[TEST] Loaded ${offerings.length} offerings with LIMIT ${limit} OFFSET ${offset}`);
  });
});
