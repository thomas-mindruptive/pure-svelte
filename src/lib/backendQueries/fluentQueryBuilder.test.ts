// src/lib/backendQueries/fluentQueryBuilder.test.ts

import { describe, it, expect } from 'vitest'
import { Query } from './fluentQueryBuilder'

import type { 
  Wholesaler, 
  ProductDefinition, 
  ProductCategory,
  WholesalerItemOffering,
} from '../domain/domainTypes'

describe('FluentQueryBuilder with Real Domain Types', () => {
  
  describe('Simple Queries', () => {
    it('should build wholesaler query with string operators', () => {
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['wholesaler_id', 'name', 'region', 'status'])
        .where()
          .and('status', '=', 'active')
          .and('region', '=', 'EU')
        .orderBy('name', 'asc')
        .limit(50)
        .build()

      expect(payload.from).toEqual({ table: 'dbo.wholesalers', alias: 'w' })
      expect(payload.select).toEqual(['wholesaler_id', 'name', 'region', 'status'])
      expect(payload.limit).toBe(50)
      
      const whereGroup = payload.where as any
      expect(whereGroup.whereCondOp).toBe('AND')
      expect(whereGroup.conditions).toHaveLength(2)
      expect(whereGroup.conditions[0].key).toBe('status')
      expect(whereGroup.conditions[0].whereCondOp).toBe('=')
      expect(whereGroup.conditions[0].val).toBe('active')
    })

    it('should build product category query', () => {
      const payload = Query.for<ProductCategory>()
        .from('dbo.product_categories', 'pc')
        .select(['category_id', 'name', 'description'])
        .where()
          .and('name', 'LIKE', '%electronics%')
        .build()

      expect(payload.from).toEqual({ table: 'dbo.product_categories', alias: 'pc' })
      expect(payload.select).toEqual(['category_id', 'name', 'description'])
    })
  })

  describe('JOIN Queries', () => {
    it('should build supplier categories join (real use case)', () => {
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['w.wholesaler_id', 'w.name', 'pc.name', 'wc.comment'])
        .innerJoin('dbo.wholesaler_categories', 'wc')
          .onCondition('w.wholesaler_id', '=', 'wc.wholesaler_id')
        .innerJoin('dbo.product_categories', 'pc')
          .onCondition('wc.category_id', '=', 'pc.category_id')
        .where()
          .and('w.status', '=', 'active')
        .orderBy('w.name', 'asc')
        .build()

      expect(payload.joins).toHaveLength(2)
      expect(payload.joins![0].type).toBe('INNER JOIN')
      expect(payload.joins![0].table).toBe('dbo.wholesaler_categories')
      expect(payload.joins![0].alias).toBe('wc')
      expect(payload.joins![1].table).toBe('dbo.product_categories')
    })

    it('should build anti-join query (products without offerings)', () => {
      const supplierId = 123
      const categoryId = 456

      const payload = Query.for<ProductDefinition>()
        .from('dbo.product_definitions', 'pd')
        .select(['pd.product_def_id', 'pd.title', 'pd.description', 'pd.category_id'])
        .leftJoin('dbo.wholesaler_item_offerings', 'wio')
          .onCondition('pd.product_def_id', '=', 'wio.product_def_id')
          .onCondition('wio.wholesaler_id', '=', supplierId)
        .where()
          .and('wio.offering_id', 'IS NULL')
          .and('pd.category_id', '=', categoryId)
        .orderBy('pd.title', 'asc')
        .build()

      expect(payload.joins).toHaveLength(1)
      expect(payload.joins![0].type).toBe('LEFT JOIN')
      expect(payload.joins![0].on.conditions).toHaveLength(2)
      
      // Erste JOIN-Bedingung: Column = Column
      const firstJoinCondition = payload.joins![0].on.conditions[0] as any
      expect(firstJoinCondition.columnA).toBe('pd.product_def_id')
      expect(firstJoinCondition.op).toBe('=')
      expect(firstJoinCondition.columnB).toBe('wio.product_def_id')
      
      // Zweite JOIN-Bedingung: Column = Value
      const secondJoinCondition = payload.joins![0].on.conditions[1] as any
      expect(secondJoinCondition.key).toBe('wio.wholesaler_id')
      expect(secondJoinCondition.whereCondOp).toBe('=')
      expect(secondJoinCondition.val).toBe(supplierId)

      // WHERE-Bedingungen
      const whereGroup = payload.where as any
      expect(whereGroup.conditions).toHaveLength(2)
      expect(whereGroup.conditions[0].whereCondOp).toBe('IS NULL')
      expect(whereGroup.conditions[1].val).toBe(categoryId)
    })

    it('should build offerings with multiple joins', () => {
      const payload = Query.for<WholesalerItemOffering>()
        .from('dbo.wholesaler_item_offerings', 'wio')
        .select(['wio.offering_id', 'wio.price', 'w.name', 'pc.name', 'pd.title'])
        .innerJoin('dbo.wholesalers', 'w')
          .onCondition('wio.wholesaler_id', '=', 'w.wholesaler_id')
        .innerJoin('dbo.product_categories', 'pc')
          .onCondition('wio.category_id', '=', 'pc.category_id')
        .innerJoin('dbo.product_definitions', 'pd')
          .onCondition('wio.product_def_id', '=', 'pd.product_def_id')
        .where()
          .and('wio.price', '>', 0)
          .and('w.status', '=', 'active')
        .orderBy('wio.price', 'desc')
        .build()

      expect(payload.joins).toHaveLength(3)
      expect(payload.joins![0].table).toBe('dbo.wholesalers')
      expect(payload.joins![1].table).toBe('dbo.product_categories')
      expect(payload.joins![2].table).toBe('dbo.product_definitions')
    })
  })

  describe('Complex WHERE Conditions', () => {
    it('should build query with grouped conditions', () => {
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['wholesaler_id', 'name', 'region'])
        .where()
          .and('status', '=', 'active')
          .andGroup(group => group
            .and('region', '=', 'EU')
            .or('region', '=', 'US')
          )
          .and('created_at', '>', '2023-01-01')
        .build()

      const whereGroup = payload.where as any
      expect(whereGroup.conditions).toHaveLength(3)
      expect(whereGroup.conditions[1].whereCondOp).toBe('AND') // Nested group
      expect(whereGroup.conditions[1].conditions).toHaveLength(2)
    })

    it('should build query with OR groups', () => {
      const payload = Query.for<ProductDefinition>()
        .from('dbo.product_definitions', 'pd')
        .select(['product_def_id', 'title'])
        .where()
          .and('category_id', '=', 1)
          .orGroup(group => group
            .and('title', 'LIKE', '%laptop%')
            .and('title', 'LIKE', '%computer%')
          )
        .build()

      const whereGroup = payload.where as any
      expect(whereGroup.conditions).toHaveLength(2)
      expect(whereGroup.conditions[1].whereCondOp).toBe('OR')
    })
  })

  describe('Type Safety', () => {
    it('should only allow valid columns for Wholesaler', () => {
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['wholesaler_id', 'name', 'status']) // Diese sollten alle gültig sein
        .where()
          .and('status', '=', 'active') // Gültige Spalte
          .and('region', 'IN', ['EU', 'US']) // Gültige Spalte
        .build()

      expect(payload.select).toContain('wholesaler_id')
      expect(payload.select).toContain('name')
      expect(payload.select).toContain('status')
    })

    it('should allow qualified column names', () => {
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['w.wholesaler_id', 'w.name'])
        .where()
          .and('w.status', '=', 'active')
        .build()

      expect(payload.select).toEqual(['w.wholesaler_id', 'w.name'])
    })
  })

  describe('Error Handling', () => {
    it('should throw error when SELECT is missing', () => {
      expect(() => {
        Query.for<Wholesaler>()
          .from('dbo.wholesalers', 'w')
          .build()
      }).toThrow('SELECT clause is required')
    })

    it('should throw error when FROM is missing', () => {
      expect(() => {
        Query.for<Wholesaler>()
          .select(['name'])
          .build()
      }).toThrow('FROM clause is required')
    })
  })

  describe('Real-world Query Examples', () => {
    it('should build supplier search query', () => {
      const searchTerm = 'electronics'
      
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['w.wholesaler_id', 'w.name', 'w.region', 'w.website'])
        .where()
          .and('w.status', '=', 'active')
          .andGroup(group => group
            .and('w.name', 'LIKE', `%${searchTerm}%`)
            .or('w.b2b_notes', 'LIKE', `%${searchTerm}%`)
          )
        .orderBy('w.name', 'asc')
        .limit(20)
        .build()

      expect(payload.limit).toBe(20)
      const whereGroup = payload.where as any
      expect(whereGroup.conditions[1].conditions[0].val).toContain(searchTerm)
    })

    it('should build category offerings count query', () => {
      const payload = Query.for<ProductCategory>()
        .from('dbo.product_categories', 'pc')
        .select(['pc.category_id', 'pc.name', 'pc.description'])
        .leftJoin('dbo.wholesaler_item_offerings', 'wio')
          .onCondition('pc.category_id', '=', 'wio.category_id')
        .where()
          .and('pc.name', '!=', '')
        .orderBy('pc.name', 'asc')
        .build()

      expect(payload.joins).toHaveLength(1)
      expect(payload.joins![0].type).toBe('LEFT JOIN')
    })
  })
})