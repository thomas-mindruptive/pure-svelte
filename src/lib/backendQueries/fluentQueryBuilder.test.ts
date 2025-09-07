// src/lib/backendQueries/fluentQueryBuilder.test.ts

import { describe, it, expect } from 'vitest'
import { Query } from './fluentQueryBuilder'
import type { QueryPayload } from './queryGrammar'
import type { 
  Wholesaler, 
  ProductDefinition, 
  ProductCategory,
  WholesalerItemOffering,
  WholesalerCategory 
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
    it('should build JOIN with grouped conditions', () => {
      const payload = Query.for<ProductDefinition>()
        .from('dbo.product_definitions', 'pd')
        .select(['pd.product_def_id', 'pd.title'])
        .leftJoin('dbo.wholesaler_item_offerings', 'wio')
          .onColumnCondition('pd.product_def_id', '=', 'wio.product_def_id')
          .andGroup(group => group
            .onValueCondition('wio.comment', '=', 'active')
            .orValueCondition('wio.comment', '=', 'pending')
          )
          .andGroup(group => group
            .onValueCondition('wio.price', '>', 0)
            .onValueCondition('wio.currency', '=', 'EUR')
          )
        .build()

      expect(payload.joins).toHaveLength(1)
      const join = payload.joins![0]
      expect(join.type).toBe('LEFT JOIN')
      expect(join.on.conditions).toHaveLength(3) // onColumnCondition + 2 andGroups

      // Erste Bedingung: normale onColumnCondition
      const firstCondition = join.on.conditions[0] as any
      expect(firstCondition.columnA).toBe('pd.product_def_id')
      expect(firstCondition.columnB).toBe('wio.product_def_id')

      // Zweite Bedingung: andGroup mit OR-Bedingungen
      const firstGroup = join.on.conditions[1] as any
      expect(firstGroup.joinCondOp).toBe('AND')
      expect(firstGroup.conditions).toHaveLength(2)
      expect(firstGroup.conditions[1].joinCondOp).toBe('OR') // orValueCondition erstellt eine OR-Gruppe

      // Dritte Bedingung: andGroup mit AND-Bedingungen
      const secondGroup = join.on.conditions[2] as any
      expect(secondGroup.joinCondOp).toBe('AND')
      expect(secondGroup.conditions).toHaveLength(2)
      expect(secondGroup.conditions[0].key).toBe('wio.price')
      expect(secondGroup.conditions[1].key).toBe('wio.currency')
    })

    it('should build JOIN with orValueCondition shorthand', () => {
      const payload = Query.for<WholesalerItemOffering>()
        .from('dbo.wholesaler_item_offerings', 'wio')
        .select(['wio.offering_id'])
        .innerJoin('dbo.wholesalers', 'w')
          .onColumnCondition('wio.wholesaler_id', '=', 'w.wholesaler_id')
          .orValueCondition('w.status', '=', 'active')
          .orValueCondition('w.status', '=', 'premium')
        .build()

      const join = payload.joins![0]
      expect(join.on.conditions).toHaveLength(3) // 1 onColumnCondition + 2 orValueCondition groups
      
      // orValueCondition sollte OR-Gruppen erstellen
      const secondCondition = join.on.conditions[1] as any
      expect(secondCondition.joinCondOp).toBe('OR')
      
      const thirdCondition = join.on.conditions[2] as any
      expect(thirdCondition.joinCondOp).toBe('OR')
    })

    it('should build complex nested JOIN groups', () => {
      const payload = Query.for<ProductDefinition>()
        .from('dbo.product_definitions', 'pd')
        .select(['pd.title'])
        .leftJoin('dbo.wholesaler_item_offerings', 'wio')
          .onColumnCondition('pd.product_def_id', '=', 'wio.product_def_id')
          .orGroup(group => group
            .andGroup(subGroup => subGroup
              .onValueCondition('wio.comment', '=', 'active')
              .onValueCondition('wio.price', '>', 100)
            )
            .andGroup(subGroup => subGroup
              .onValueCondition('wio.comment', '=', 'premium')
              .onValueCondition('wio.price', '>', 50)
            )
          )
        .build()

      const join = payload.joins![0]
      expect(join.on.conditions).toHaveLength(2) // onColumnCondition + orGroup

      // Verschachtelte Struktur prüfen
      const orGroup = join.on.conditions[1] as any
      expect(orGroup.joinCondOp).toBe('OR')
      expect(orGroup.conditions).toHaveLength(2) // 2 andGroups
      
      const firstAndGroup = orGroup.conditions[0]
      expect(firstAndGroup.joinCondOp).toBe('AND')
      expect(firstAndGroup.conditions).toHaveLength(2)
    })

    it('should build supplier categories join (real use case)', () => {
      const payload = Query.for<Wholesaler>()
        .from('dbo.wholesalers', 'w')
        .select(['w.wholesaler_id', 'w.name', 'pc.name', 'wc.comment'])
        .innerJoin('dbo.wholesaler_categories', 'wc')
          .onColumnCondition('w.wholesaler_id', '=', 'wc.wholesaler_id')
        .innerJoin('dbo.product_categories', 'pc')
          .onColumnCondition('wc.category_id', '=', 'pc.category_id')
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
          .onColumnCondition('pd.product_def_id', '=', 'wio.product_def_id')
          .onValueCondition('wio.wholesaler_id', '=', supplierId)
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
          .onColumnCondition('wio.wholesaler_id', '=', 'w.wholesaler_id')
        .innerJoin('dbo.product_categories', 'pc')
          .onColumnCondition('wio.category_id', '=', 'pc.category_id')
        .innerJoin('dbo.product_definitions', 'pd')
          .onColumnCondition('wio.product_def_id', '=', 'pd.product_def_id')
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

    it('should distinguish between column and value conditions explicitly', () => {
      const payload = Query.for<ProductDefinition>()
        .from('dbo.product_definitions', 'pd')
        .select(['pd.title'])
        .leftJoin('dbo.wholesaler_item_offerings', 'wio')
          .onColumnCondition('pd.product_def_id', '=', 'wio.product_def_id') // Column = Column
          .onValueCondition('wio.comment', '=', 'EUR') // Column = Value (sollte nicht als Spalte erkannt werden)
          .onValueCondition('wio.price', '>', 100) // Column = Value
          .onColumnCondition('wio.category_id', '=', 'pd.category_id') // Column = Column
        .build()

      const join = payload.joins![0]
      expect(join.on.conditions).toHaveLength(4)

      // Erste und vierte sollten JoinColCondition sein (columnA, op, columnB)
      const firstCondition = join.on.conditions[0] as any
      expect(firstCondition.columnA).toBe('pd.product_def_id')
      expect(firstCondition.columnB).toBe('wio.product_def_id')
      expect(firstCondition.op).toBe('=')

      const fourthCondition = join.on.conditions[3] as any
      expect(fourthCondition.columnA).toBe('wio.category_id')
      expect(fourthCondition.columnB).toBe('pd.category_id')

      // Zweite und dritte sollten WhereCondition sein (key, whereCondOp, val)
      const secondCondition = join.on.conditions[1] as any
      expect(secondCondition.key).toBe('wio.comment')
      expect(secondCondition.whereCondOp).toBe('=')
      expect(secondCondition.val).toBe('EUR')

      const thirdCondition = join.on.conditions[2] as any
      expect(thirdCondition.key).toBe('wio.price')
      expect(thirdCondition.whereCondOp).toBe('>')
      expect(thirdCondition.val).toBe(100)
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
          .onColumnCondition('pc.category_id', '=', 'wio.category_id')
        .where()
          .and('pc.name', '!=', '')
        .orderBy('pc.name', 'asc')
        .build()

      expect(payload.joins).toHaveLength(1)
      expect(payload.joins![0].type).toBe('LEFT JOIN')
    })
  })
})