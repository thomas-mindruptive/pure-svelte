// src/lib/backendQueries/fluentQueryBuilder.ts

/**
 * Complete Fluent Query Builder with Type-Safe JOIN Configuration Support
 * 
 * ARCHITECTURE OVERVIEW:
 * =====================
 * This builder implements a fully type-safe, fluent interface for SQL query construction with
 * corrected logical operators and comprehensive security features.
 * 
 * TYPE SAFETY CHAIN:
 * Domain.Entity → BaseTableConfig → aliasedTablesConfig → AllQualifiedColumns → Builder
 * Each step validates the next, creating an unbreakable chain of type safety.
 * 
 * SECURITY MODEL:
 * - Whitelist-only column access (manual configuration = security feature)
 * - No accidental exposure of sensitive columns
 * - Central control over all queryable columns
 * - Compile-time validation of all column references
 * 
 * CORRECTED OR LOGIC:
 * - Sequential .or() calls create flat OR chains (a = 1 OR a = 2 OR a = 3)
 * - .andGroup() and .orGroup() create explicit parentheses for complex logic
 * - No "smart" behavior - the builder follows method calls 1:1
 * 
 * DUAL ENTRY POINTS:
 * - Query.for<T>(): Complete queries with SELECT, FROM, WHERE, etc.
 * - Query.joins(): Standalone JOIN configurations for queryConfig definitions
 */

// Types (only for typing)
import type { 
  QueryPayload, 
  JoinClause, 
  WhereCondition, 
  WhereConditionGroup,
  JoinColCondition,
  JoinConditionGroup
} from './queryGrammar';

// Values (Enums used at runtime)
import { 
  JoinType, 
  type ComparisonOperator,
  LogicalOperator
} from './queryGrammar';

import type { 
  AllQualifiedColumns, 
  AllAliasedColumns, 
  ValidFromClause 
} from './queryConfig.types';

// ================================================================================================
// === BUILDER TYPE DEFINITIONS ===================================================================
// ================================================================================================

/**
 * Union type for all possible parent builders that can create JOINs
 * Uses QueryBuilder<any> to accept any generic QueryBuilder type
 */
type JoinParentBuilder = QueryBuilder<any> | JoinConfigBuilder;

// ================================================================================================
// === CORE QUERY BUILDER ========================================================================
// ================================================================================================

/**
 * Main Query Builder - Entry point for building complete SQL queries
 * 
 * Provides full query functionality including SELECT, FROM, WHERE, JOIN, ORDER BY, LIMIT, and OFFSET clauses.
 * 
 * Type Safety:
 * - Generic <T> ensures WHERE clauses are validated against the entity type
 * - JOIN clauses use AllQualifiedColumns for cross-table references
 * - SELECT clauses accept both entity keys and qualified column names
 */
export class QueryBuilder<T> {
  private payload: Partial<QueryPayload<T>> = {};
  private currentWhere: WhereConditionGroup<T> | null = null;

  private constructor() {}

  /**
   * Creates a new query builder for the specified entity type
   * 
   * Usage:
   * Query.for<Wholesaler>()
   *   .from('dbo.wholesalers', 'w')
   *   .select(['w.name', 'w.status'])
   *   .where()
   *     .and('status', '=', 'active')
   *   .build()
   */
  static for<T>(): QueryBuilder<T> {
    return new QueryBuilder<T>();
  }

  /**
   * Creates a standalone JOIN configuration builder for queryConfig definitions
   * 
   * This is used to create reusable JOIN patterns that can be referenced in queryConfig.
   * The fluent syntax replaces manual JOIN configuration objects.
   * 
   * Usage:
   * joinConfigurations: {
   *   'supplier_categories': Query.joins()
   *     .from('dbo.wholesalers', 'w')
   *     .innerJoin('dbo.wholesaler_categories', 'wc')
   *       .onColumnCondition('w.wholesaler_id', '=', 'wc.wholesaler_id')
   *     .innerJoin('dbo.product_categories', 'pc')
   *       .onColumnCondition('wc.category_id', '=', 'pc.category_id')
   *     .buildJoinConfig()
   * }
   */
  static joins(): JoinConfigBuilder {
    return new JoinConfigBuilder();
  }

  /**
   * Sets the FROM clause with table and alias
   * 
   * The table and alias must match one of the valid ValidFromClause configurations
   * defined in queryConfig.types.ts. This ensures only pre-approved table/alias
   * combinations can be used.
   */
  from(table: ValidFromClause['table'], alias: ValidFromClause['alias']): this {
    this.payload.from = { table, alias } as ValidFromClause;
    return this;
  }

  /**
   * Defines which columns to select in the query result
   * 
   * Accepts three types of column specifications:
   * - Entity keys: 'name', 'status' (validated against type T)
   * - Qualified columns: 'w.name', 'pc.category_name' (validated against AllQualifiedColumns)
   * - Aliased columns: 'w.name AS supplier_name' (validated against AllAliasedColumns)
   * 
   * All column names are validated at compile-time through the type safety chain.
   */
  select(columns: Array<keyof T | AllQualifiedColumns | AllAliasedColumns>): this {
    this.payload.select = columns;
    return this;
  }

  /**
   * Creates an INNER JOIN and returns a JoinBuilder for defining join conditions
   * 
   * INNER JOINs only return rows that have matching values in both tables.
   * The returned JoinBuilder allows you to specify ON conditions using the same
   * corrected OR logic as the main query builder.
   */
  innerJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.INNER, table, alias);
  }

  /**
   * Creates a LEFT JOIN and returns a JoinBuilder for defining join conditions
   * 
   * LEFT JOINs return all rows from the left table, and matched rows from the right table.
   * NULL values are returned for right-side columns when no match is found.
   */
  leftJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.LEFT, table, alias);
  }

  /**
   * Creates a RIGHT JOIN and returns a JoinBuilder for defining join conditions
   * 
   * RIGHT JOINs return all rows from the right table, and matched rows from the left table.
   * NULL values are returned for left-side columns when no match is found.
   */
  rightJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.RIGHT, table, alias);
  }

  /**
   * Creates a FULL OUTER JOIN and returns a JoinBuilder for defining join conditions
   * 
   * FULL OUTER JOINs return all rows from both tables, with NULLs where no match exists.
   */
  fullJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.FULL, table, alias);
  }

  /**
   * Internal helper to create any type of join with consistent structure
   * 
   * Creates a JoinClause with:
   * - Specified join type (INNER, LEFT, RIGHT, FULL)
   * - Target table and optional alias
   * - Empty ON conditions group (defaults to AND, can be changed by OR conditions)
   * 
   * The JoinClause is added to the query payload and a JoinBuilder is returned
   * to allow fluent configuration of the join conditions.
   */
  private createJoin(type: JoinType | `${JoinType}`, table: string, alias?: string): JoinBuilder {
    const joinClause: JoinClause = {
      type,
      table,
      ...(alias && { alias }),
      on: {
        joinCondOp: LogicalOperator.AND, // Default to AND, can be changed by OR conditions
        conditions: []
      }
    };

    if (!this.payload.joins) {
      this.payload.joins = [];
    }
    this.payload.joins.push(joinClause);

    return new JoinBuilder(this as QueryBuilder<any>, joinClause);
  }

  /**
   * Creates a WHERE clause and returns a WhereBuilder for defining conditions
   * 
   * The WHERE clause uses the corrected OR logic:
   * - .and() conditions are added to the same group (default behavior)
   * - .or() conditions change the group operator and create flat OR chains
   * - .andGroup() and .orGroup() create explicit sub-groups with parentheses
   * 
   * Type Safety: WHERE conditions are validated against the entity type T,
   * ensuring only valid entity properties can be used in conditions.
   */
  where(): WhereBuilder<T> {
    this.currentWhere = {
      whereCondOp: LogicalOperator.AND, // Default to AND, can be changed by OR conditions
      conditions: []
    };
    this.payload.where = this.currentWhere;
    return new WhereBuilder(this, this.currentWhere);
  }

  /**
   * Adds an ORDER BY clause to sort the query results
   * 
   * Accepts both entity keys and qualified column names. Multiple ORDER BY
   * clauses can be chained to create multi-column sorting.
   * 
   * @param key - Column to sort by (validated against T or AllQualifiedColumns)
   * @param direction - Sort direction, defaults to 'asc'
   */
  orderBy(key: keyof T & string | AllQualifiedColumns | AllAliasedColumns, direction: 'asc' | 'desc' = 'asc'): this {
    if (!this.payload.orderBy) {
      this.payload.orderBy = [];
    }
    this.payload.orderBy.push({ key, direction });
    return this;
  }

  /**
   * Sets the maximum number of rows to return
   * Used for pagination and result limiting.
   */
  limit(count: number): this {
    this.payload.limit = count;
    return this;
  }

  /**
   * Sets the number of rows to skip before starting to return results
   * Used for pagination in combination with LIMIT.
   */
  offset(count: number): this {
    this.payload.offset = count;
    return this;
  }

  /**
   * Builds and validates the final query payload
   * 
   * Performs validation to ensure required clauses are present:
   * - SELECT clause is mandatory
   * - FROM clause is mandatory
   * 
   * Returns a complete QueryPayload that can be processed by the backend
   * query execution system.
   */
  build(): QueryPayload<T> {
    if (!this.payload.select) {
      throw new Error('SELECT clause is required');
    }
    if (!this.payload.from) {
      throw new Error('FROM clause is required');
    }

    return this.payload as QueryPayload<T>;
  }
}

// ================================================================================================
// === JOIN CONFIGURATION BUILDER ================================================================
// ================================================================================================

/**
 * JOIN Configuration Builder - Standalone builder for queryConfig join definitions
 * 
 * This builder creates reusable JOIN configurations that can be used in queryConfig.
 * It provides JOIN functionality but not full query capabilities (no WHERE, SELECT, etc.).
 * 
 * The builder replaces manual JOIN configuration objects with a fluent, type-safe API
 * that shares the same JOIN logic as the main QueryBuilder.
 * 
 * Purpose: Create predefined JOIN patterns that can be reused across multiple queries
 * through the queryConfig system, reducing code duplication and improving maintainability.
 */
export class JoinConfigBuilder {
  private fromClause: ValidFromClause | null = null;
  private joins: JoinClause[] = [];

  constructor() {}

  /**
   * Sets the FROM clause for this JOIN configuration
   * 
   * The FROM clause defines the primary table that other tables will be joined to.
   * This is required for JOIN configurations as it establishes the base of the join chain.
   */
  from(table: ValidFromClause['table'], alias: ValidFromClause['alias']): this {
    this.fromClause = { table, alias } as ValidFromClause;
    return this;
  }

  /**
   * Creates an INNER JOIN and returns a JoinBuilder for defining join conditions
   * Uses the same logic as QueryBuilder to avoid code duplication.
   */
  innerJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.INNER, table, alias);
  }

  /**
   * Creates a LEFT JOIN and returns a JoinBuilder for defining join conditions
   * Uses the same logic as QueryBuilder to avoid code duplication.
   */
  leftJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.LEFT, table, alias);
  }

  /**
   * Creates a RIGHT JOIN and returns a JoinBuilder for defining join conditions
   * Uses the same logic as QueryBuilder to avoid code duplication.
   */
  rightJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.RIGHT, table, alias);
  }

  /**
   * Creates a FULL OUTER JOIN and returns a JoinBuilder for defining join conditions
   * Uses the same logic as QueryBuilder to avoid code duplication.
   */
  fullJoin(table: string, alias?: string): JoinBuilder {
    return this.createJoin(JoinType.FULL, table, alias);
  }

  /**
   * Internal helper to create any type of join with consistent structure
   * 
   * This method mirrors the logic in QueryBuilder.createJoin() to ensure
   * identical JOIN behavior between full queries and JOIN configurations.
   * The shared logic eliminates code duplication and ensures consistency.
   */
  private createJoin(type: JoinType | `${JoinType}`, table: string, alias?: string): JoinBuilder {
    const joinClause: JoinClause = {
      type,
      table,
      ...(alias && { alias }),
      on: {
        joinCondOp: LogicalOperator.AND, // Default to AND, can be changed by OR conditions
        conditions: []
      }
    };

    this.joins.push(joinClause);
    return new JoinBuilder(this, joinClause);
  }

  /**
   * Builds and returns the JOIN configuration object for use in queryConfig
   * 
   * Validates that required components are present:
   * - FROM clause must be specified
   * - At least one JOIN must be defined
   * 
   * Returns an object that matches the structure expected by queryConfig.joinConfigurations,
   * allowing the fluent builder output to be used directly in configuration objects.
   * 
   * @returns Object with 'from' and 'joins' properties matching queryConfig structure
   */
  buildJoinConfig(): { from: ValidFromClause; joins: JoinClause[] } {
    if (!this.fromClause) {
      throw new Error('FROM clause is required for JOIN configuration');
    }
    if (this.joins.length === 0) {
      throw new Error('At least one JOIN is required for JOIN configuration');
    }

    return {
      from: this.fromClause,
      joins: [...this.joins] // Return a copy to prevent mutations
    };
  }
}

// ================================================================================================
// === SHARED JOIN BUILDER =======================================================================
// ================================================================================================

/**
 * Join Builder - Handles JOIN conditions for both QueryBuilder and JoinConfigBuilder
 * 
 * Uses runtime type checking to provide safe method chaining back to either QueryBuilder 
 * (full queries) or JoinConfigBuilder (JOIN configurations).
 * 
 * CORRECTED OR LOGIC IMPLEMENTATION:
 * ==================================
 * The builder implements SQL-standard OR behavior:
 * 
 * Example 1 - Flat OR Chain:
 * .onColumnCondition('a', '=', 'b')
 * .orValueCondition('status', '=', 'active')
 * .orValueCondition('status', '=', 'premium')
 * Result: a = b OR status = 'active' OR status = 'premium'
 * 
 * Example 2 - Explicit Grouping:
 * .onColumnCondition('a', '=', 'b')
 * .andGroup(group => group
 *   .onValueCondition('status', '=', 'active')
 *   .orValueCondition('status', '=', 'premium')
 * )
 * Result: a = b AND (status = 'active' OR status = 'premium')
 * 
 * The key insight: OR methods change the GROUP operator, not individual conditions.
 * This creates flat OR chains without unnecessary nesting.
 */
export class JoinBuilder {
  constructor(
    private parentBuilder: JoinParentBuilder,
    private joinClause: JoinClause
  ) {}

  /**
   * Adds a column-to-column join condition (e.g., table1.id = table2.id)
   * 
   * This is the most common type of join condition, linking primary keys to foreign keys
   * or establishing relationships between tables. Both column references are validated
   * against AllQualifiedColumns to ensure they exist in the schema configuration.
   * 
   * Default behavior: Condition is added with AND logic (unless changed by OR methods)
   */
  onColumnCondition(
    columnA: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    columnB: AllQualifiedColumns | AllAliasedColumns
  ): this {
    const joinColCondition: JoinColCondition = {
      columnA,
      op,
      columnB
    };
    this.joinClause.on.conditions.push(joinColCondition);
    return this;
  }

  /**
   * Adds a column-to-value join condition (e.g., table.status = 'active')
   * 
   * Used for filtering within join conditions, such as only joining to active records
   * or records matching specific criteria. The column is validated against AllQualifiedColumns
   * while the value can be any type (primitive, array, etc.).
   * 
   * Default behavior: Condition is added with AND logic (unless changed by OR methods)
   */
  onValueCondition(
    column: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    value: unknown | unknown[]
  ): this {
    const whereCondition: WhereCondition<unknown> = {
      key: column,
      whereCondOp: op,
      val: value
    };
    this.joinClause.on.conditions.push(whereCondition);
    return this;
  }

  /**
   * CORRECTED LOGIC: Creates flat OR chain for value conditions
   * 
   * This method implements the corrected OR behavior by:
   * 1. Changing the main join group operator to OR
   * 2. Adding the condition directly to the main group (not a sub-group)
   * 
   * This creates flat OR chains like: condition1 OR condition2 OR condition3
   * Instead of nested AND groups: condition1 AND (condition2) AND (condition3)
   * 
   * Example Usage:
   * .onColumnCondition('a', '=', 'b')        // Main condition
   * .orValueCondition('status', '=', 'active') // Changes group to OR, adds condition
   * .orValueCondition('status', '=', 'premium') // Continues OR chain
   * 
   * SQL Result: a = b OR status = 'active' OR status = 'premium'
   */
  orValueCondition(
    column: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    value: unknown | unknown[]
  ): this {
    // Change the main group operator to OR for flat OR chains
    this.joinClause.on.joinCondOp = LogicalOperator.OR;
    
    // Add the condition directly to the main group (not a sub-group)
    const whereCondition: WhereCondition<unknown> = {
      key: column,
      whereCondOp: op,
      val: value
    };
    this.joinClause.on.conditions.push(whereCondition);
    return this;
  }

  /**
   * CORRECTED LOGIC: Creates flat OR chain for column conditions
   * 
   * Similar to orValueCondition but for column-to-column comparisons.
   * Changes the main join group to OR and adds the column condition directly.
   * 
   * This allows mixing column conditions and value conditions in the same OR chain:
   * .onColumnCondition('a', '=', 'b')
   * .orValueCondition('status', '=', 'active')
   * .orColumnCondition('c', '=', 'd')
   * 
   * Result: a = b OR status = 'active' OR c = d
   */
  orColumnCondition(
    columnA: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    columnB: AllQualifiedColumns | AllAliasedColumns
  ): this {
    // Change the main group operator to OR for flat OR chains
    this.joinClause.on.joinCondOp = LogicalOperator.OR;
    
    // Add the condition directly to the main group (not a sub-group)
    const joinColCondition: JoinColCondition = {
      columnA,
      op,
      columnB
    };
    this.joinClause.on.conditions.push(joinColCondition);
    return this;
  }

  /**
   * Creates an explicit AND sub-group with parentheses
   * 
   * Use this when you need to group multiple conditions with AND logic within
   * a larger context. The sub-group is added as a single condition to the main group.
   * 
   * Example:
   * .onColumnCondition('a', '=', 'b')         // Main condition
   * .andGroup(group => group                  // Creates: AND (sub-group)
   *   .onValueCondition('status', '=', 'active')
   *   .orValueCondition('status', '=', 'premium')
   * )
   * 
   * SQL Result: a = b AND (status = 'active' OR status = 'premium')
   * 
   * The sub-group internally can use OR logic (as shown), but it's connected
   * to the main group with AND logic.
   */
  andGroup(builderFn: (group: JoinConditionBuilder) => void): this {
    const subGroup: JoinConditionGroup = {
      joinCondOp: LogicalOperator.AND,
      conditions: []
    };
    const subBuilder = new JoinConditionBuilder(subGroup);
    builderFn(subBuilder);
    this.joinClause.on.conditions.push(subGroup);
    return this;
  }

  /**
   * Creates an explicit OR sub-group with parentheses
   * 
   * Use this when you need to group multiple conditions with internal logic within
   * a larger OR context. This method:
   * 1. Changes the main group operator to OR
   * 2. Creates a sub-group (which defaults to AND internally)
   * 3. Adds the sub-group to the main group
   * 
   * Example:
   * .onColumnCondition('a', '=', 'b')         // Main condition  
   * .orGroup(group => group                   // Creates: OR (sub-group)
   *   .onValueCondition('x', '=', '1')
   *   .onValueCondition('y', '=', '2')
   * )
   * 
   * SQL Result: a = b OR (x = 1 AND y = 2)
   */
  orGroup(builderFn: (group: JoinConditionBuilder) => void): this {
    // This OR group becomes part of a larger OR chain
    this.joinClause.on.joinCondOp = LogicalOperator.OR;
    
    const subGroup: JoinConditionGroup = {
      joinCondOp: LogicalOperator.AND, // Interior of the group defaults to AND
      conditions: []
    };
    const subBuilder = new JoinConditionBuilder(subGroup);
    builderFn(subBuilder);
    this.joinClause.on.conditions.push(subGroup);
    return this;
  }

  // ==============================================================================================
  // === TYPE-SAFE METHOD CHAINING ===============================================================
  // ==============================================================================================

  /**
   * The following methods provide safe chaining back to the parent builder.
   * Using runtime type checking, we can safely call methods on the parent
   * without unsafe casting. TypeScript's structural typing ensures method availability.
   */

  /**
   * Chain to another INNER JOIN
   * Available on both QueryBuilder and JoinConfigBuilder
   */
  innerJoin(table: string, alias?: string): JoinBuilder {
    return this.parentBuilder.innerJoin(table, alias);
  }

  /**
   * Chain to another LEFT JOIN
   * Available on both QueryBuilder and JoinConfigBuilder
   */
  leftJoin(table: string, alias?: string): JoinBuilder {
    return this.parentBuilder.leftJoin(table, alias);
  }

  /**
   * Chain to another RIGHT JOIN  
   * Available on both QueryBuilder and JoinConfigBuilder
   */
  rightJoin(table: string, alias?: string): JoinBuilder {
    return this.parentBuilder.rightJoin(table, alias);
  }

  /**
   * Chain to another FULL JOIN
   * Available on both QueryBuilder and JoinConfigBuilder
   */
  fullJoin(table: string, alias?: string): JoinBuilder {
    return this.parentBuilder.fullJoin(table, alias);
  }

  /**
   * Chain to WHERE clause
   * Only available when parent is QueryBuilder
   * Uses type guard to ensure method exists before calling
   */
  where(): WhereBuilder<any> {
    if (this.isQueryBuilder(this.parentBuilder)) {
      return this.parentBuilder.where();
    }
    throw new Error('WHERE clause is not available in JOIN configuration builder. Use Query.for<T>() for complete queries.');
  }

  /**
   * Chain to ORDER BY clause
   * Only available when parent is QueryBuilder
   * Uses type guard to ensure method exists before calling
   */
  orderBy(key: AllQualifiedColumns | AllAliasedColumns, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<any> {
    if (this.isQueryBuilder(this.parentBuilder)) {
      return this.parentBuilder.orderBy(key, direction);
    }
    throw new Error('ORDER BY clause is not available in JOIN configuration builder. Use Query.for<T>() for complete queries.');
  }

  /**
   * Chain to LIMIT clause
   * Only available when parent is QueryBuilder
   */
  limit(count: number): QueryBuilder<any> {
    if (this.isQueryBuilder(this.parentBuilder)) {
      return this.parentBuilder.limit(count);
    }
    throw new Error('LIMIT clause is not available in JOIN configuration builder. Use Query.for<T>() for complete queries.');
  }

  /**
   * Chain to OFFSET clause
   * Only available when parent is QueryBuilder
   */
  offset(count: number): QueryBuilder<any> {
    if (this.isQueryBuilder(this.parentBuilder)) {
      return this.parentBuilder.offset(count);
    }
    throw new Error('OFFSET clause is not available in JOIN configuration builder. Use Query.for<T>() for complete queries.');
  }

  /**
   * Build complete query
   * Only available when parent is QueryBuilder
   */
  build(): QueryPayload<any> {
    if (this.isQueryBuilder(this.parentBuilder)) {
      return this.parentBuilder.build();
    }
    throw new Error('build() is not available in JOIN configuration builder. Use buildJoinConfig() instead.');
  }

  /**
   * Build JOIN configuration
   * Only available when parent is JoinConfigBuilder
   */
  buildJoinConfig(): { from: ValidFromClause; joins: JoinClause[] } {
    if (this.isJoinConfigBuilder(this.parentBuilder)) {
      return this.parentBuilder.buildJoinConfig();
    }
    throw new Error('buildJoinConfig() is not available on QueryBuilder. Use build() instead.');
  }

  // ==============================================================================================
  // === TYPE GUARDS ==============================================================================
  // ==============================================================================================

  /**
   * Type guard to check if parent builder is a QueryBuilder
   * This enables safe method calls without casting
   */
  private isQueryBuilder(parent: JoinParentBuilder): parent is QueryBuilder<any> {
    return parent instanceof QueryBuilder;
  }

  /**
   * Type guard to check if parent builder is a JoinConfigBuilder
   * This enables safe method calls without casting
   */
  private isJoinConfigBuilder(parent: JoinParentBuilder): parent is JoinConfigBuilder {
    return parent instanceof JoinConfigBuilder;
  }
}

// ================================================================================================
// === JOIN CONDITION BUILDER ====================================================================
// ================================================================================================

/**
 * Join Condition Builder - Handles conditions within JOIN sub-groups
 * 
 * This builder is used inside andGroup() and orGroup() calls on JoinBuilder.
 * It provides the same join condition functionality as JoinBuilder but operates
 * within a sub-group context.
 * 
 * CORRECTED OR LOGIC IN SUB-GROUPS:
 * The builder follows the same corrected OR logic as the main JoinBuilder:
 * - OR methods change the sub-group's operator from AND to OR
 * - Conditions are added directly to the sub-group (no further nesting)
 * - This creates flat OR chains within the sub-group
 * 
 * Example:
 * .andGroup(group => group
 *   .onValueCondition('status', '=', 'active')     // First condition (AND by default)
 *   .orValueCondition('status', '=', 'premium')    // Changes group to OR, adds condition
 *   .orValueCondition('status', '=', 'trial')      // Continues OR chain
 * )
 * 
 * Sub-group result: (status = 'active' OR status = 'premium' OR status = 'trial')
 */
export class JoinConditionBuilder {
  constructor(private joinGroup: JoinConditionGroup) {}

  /**
   * Adds a column-to-column condition within the sub-group
   * Same functionality as JoinBuilder.onColumnCondition but scoped to this sub-group
   */
  onColumnCondition(
    columnA: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    columnB: AllQualifiedColumns | AllAliasedColumns
  ): this {
    const joinColCondition: JoinColCondition = {
      columnA,
      op,
      columnB
    };
    this.joinGroup.conditions.push(joinColCondition);
    return this;
  }

  /**
   * Adds a column-to-value condition within the sub-group
   * Same functionality as JoinBuilder.onValueCondition but scoped to this sub-group
   */
  onValueCondition(
    column: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    value: unknown | unknown[]
  ): this {
    const whereCondition: WhereCondition<unknown> = {
      key: column,
      whereCondOp: op,
      val: value
    };
    this.joinGroup.conditions.push(whereCondition);
    return this;
  }

  /**
   * CORRECTED LOGIC: Creates flat OR chain within the sub-group
   * 
   * Changes the sub-group's operator to OR and adds the condition directly.
   * This ensures that OR conditions within sub-groups create flat chains
   * rather than nested structures.
   */
  orValueCondition(
    column: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    value: unknown | unknown[]
  ): this {
    // Change this sub-group's operator to OR
    this.joinGroup.joinCondOp = LogicalOperator.OR;
    
    // Add condition directly to this sub-group
    const whereCondition: WhereCondition<unknown> = {
      key: column,
      whereCondOp: op,
      val: value
    };
    this.joinGroup.conditions.push(whereCondition);
    return this;
  }

  /**
   * CORRECTED LOGIC: Creates flat OR chain for column conditions within sub-group
   * Same as orValueCondition but for column-to-column comparisons
   */
  orColumnCondition(
    columnA: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    columnB: AllQualifiedColumns | AllAliasedColumns
  ): this {
    // Change this sub-group's operator to OR
    this.joinGroup.joinCondOp = LogicalOperator.OR;
    
    // Add condition directly to this sub-group
    const joinColCondition: JoinColCondition = {
      columnA,
      op,
      columnB
    };
    this.joinGroup.conditions.push(joinColCondition);
    return this;
  }

  /**
   * Creates nested AND sub-groups within this sub-group
   * 
   * Allows for complex nested logic structures:
   * .andGroup(outerGroup => outerGroup
   *   .onValueCondition('a', '=', '1')
   *   .andGroup(innerGroup => innerGroup
   *     .onValueCondition('b', '=', '2')
   *     .orValueCondition('b', '=', '3')
   *   )
   * )
   * 
   * Result: (a = 1 AND (b = 2 OR b = 3))
   */
  andGroup(builderFn: (group: JoinConditionBuilder) => void): this {
    const subGroup: JoinConditionGroup = {
      joinCondOp: LogicalOperator.AND,
      conditions: []
    };
    const subBuilder = new JoinConditionBuilder(subGroup);
    builderFn(subBuilder);
    this.joinGroup.conditions.push(subGroup);
    return this;
  }

  /**
   * Creates nested OR sub-groups within this sub-group
   * 
   * Changes the parent sub-group to OR and adds a nested group.
   * The nested group defaults to AND internally but can be changed by OR methods.
   */
  orGroup(builderFn: (group: JoinConditionBuilder) => void): this {
    // If we add an OR group, the parent group becomes OR
    this.joinGroup.joinCondOp = LogicalOperator.OR;
    
    const subGroup: JoinConditionGroup = {
      joinCondOp: LogicalOperator.AND, // Interior defaults to AND
      conditions: []
    };
    const subBuilder = new JoinConditionBuilder(subGroup);
    builderFn(subBuilder);
    this.joinGroup.conditions.push(subGroup);
    return this;
  }
}

// ================================================================================================
// === WHERE BUILDER =============================================================================
// ================================================================================================

/**
 * Where Builder - Handles WHERE clause conditions with corrected OR logic
 * 
 * Provides the same corrected OR behavior as the JOIN builders but for WHERE clauses.
 * The key difference is that WHERE conditions are type-safe against the entity type T,
 * while JOIN conditions use AllQualifiedColumns for cross-table references.
 * 
 * CORRECTED OR LOGIC IN WHERE CLAUSES:
 * ====================================
 * Example 1 - Flat OR Chain:
 * .and('status', '=', 'active')       // First condition (AND by default)
 * .or('status', '=', 'pending')       // Changes group to OR, adds condition
 * .or('status', '=', 'review')        // Continues OR chain
 * 
 * SQL Result: status = 'active' OR status = 'pending' OR status = 'review'
 * 
 * Example 2 - Explicit Grouping:
 * .and('category', '=', 'electronics')
 * .andGroup(group => group
 *   .and('price', '>', 100)
 *   .or('price', '<', 50)
 * )
 * 
 * SQL Result: category = 'electronics' AND (price > 100 OR price < 50)
 * 
 * TYPE SAFETY:
 * All WHERE conditions are validated against the entity type T, ensuring only
 * valid entity properties can be used in conditions. This catches typos and
 * invalid column references at compile time.
 */
export class WhereBuilder<T> {
  constructor(
    private queryBuilder: QueryBuilder<T>,
    private whereGroup: WhereConditionGroup<T>
  ) {}

  /**
   * Adds an AND condition to the WHERE clause
   * 
   * This is the default behavior - conditions are AND-ed together unless changed by OR methods.
   * The key is validated against the entity type T, ensuring type safety for WHERE conditions.
   * 
   * @param key - Entity property or qualified column name (type-safe)
   * @param op - Comparison operator (=, !=, >, <, etc.)
   * @param val - Value to compare against (optional for operators like IS NULL)
   */
  and(
    key: keyof T & string | AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    val?: unknown | unknown[]
  ): this {
    const condition: WhereCondition<T> = {
      key,
      whereCondOp: op,
      val
    };
    this.whereGroup.conditions.push(condition);
    return this;
  }

  /**
   * CORRECTED LOGIC: Creates flat OR chain in WHERE clause
   * 
   * Changes the main WHERE group operator to OR and adds the condition directly.
   * This creates flat OR chains without unnecessary sub-group nesting.
   * 
   * The first .or() call changes the entire WHERE clause to use OR logic,
   * so all subsequent conditions (both .and() and .or()) become part of the OR chain.
   * 
   * For mixed AND/OR logic, use explicit groups with .andGroup() and .orGroup().
   */
  or(
    key: keyof T & string | AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    val?: unknown | unknown[]
  ): this {
    // Change the main WHERE group operator to OR
    this.whereGroup.whereCondOp = LogicalOperator.OR;
    
    // Add the condition directly to the main group
    const condition: WhereCondition<T> = {
      key,
      whereCondOp: op,
      val
    };
    this.whereGroup.conditions.push(condition);
    return this;
  }

  /**
   * Creates an explicit AND sub-group within the WHERE clause
   * 
   * Use this when you need to group multiple conditions with AND logic within
   * a larger WHERE context. The sub-group is treated as a single condition
   * in the main WHERE clause.
   * 
   * Example:
   * .and('category', '=', 'electronics')         // Main condition
   * .andGroup(group => group                      // Creates: AND (sub-group)
   *   .and('price', '>', 100)
   *   .or('price', '<', 50)                       // OR within the sub-group
   * )
   * 
   * SQL Result: category = 'electronics' AND (price > 100 OR price < 50)
   */
  andGroup(builderFn: (group: WhereBuilder<T>) => void): this {
    const subGroup: WhereConditionGroup<T> = {
      whereCondOp: LogicalOperator.AND,
      conditions: []
    };
    const subBuilder = new WhereBuilder(this.queryBuilder, subGroup);
    builderFn(subBuilder);
    this.whereGroup.conditions.push(subGroup);
    return this;
  }

  /**
   * Creates an explicit OR sub-group within the WHERE clause
   * 
   * Changes the main WHERE group to OR and creates a sub-group (which defaults to AND internally).
   * This is useful for complex conditions where you need OR at the top level but AND within groups.
   * 
   * Example:
   * .and('status', '=', 'active')                // Main condition
   * .orGroup(group => group                       // Creates: OR (sub-group)  
   *   .and('brand', '=', 'Sony')
   *   .and('price', '<', 200)
   * )
   * 
   * SQL Result: status = 'active' OR (brand = 'Sony' AND price < 200)
   */
  orGroup(builderFn: (group: WhereBuilder<T>) => void): this {
    // Adding an OR group makes the main group OR
    this.whereGroup.whereCondOp = LogicalOperator.OR;
    
    const subGroup: WhereConditionGroup<T> = {
      whereCondOp: LogicalOperator.AND, // Interior defaults to AND
      conditions: []
    };
    const subBuilder = new WhereBuilder(this.queryBuilder, subGroup);
    builderFn(subBuilder);
    this.whereGroup.conditions.push(subGroup);
    return this;
  }

  // ==============================================================================================
  // === FLUENT CHAIN TRANSITIONS =================================================================
  // ==============================================================================================

  /**
   * The following methods allow fluent chaining from WHERE clauses to other query parts.
   * They return the original QueryBuilder to continue building the complete query.
   */

  /**
   * Chain to ORDER BY clause after defining WHERE conditions
   */
  orderBy(key: keyof T & string | AllQualifiedColumns | AllAliasedColumns, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    return this.queryBuilder.orderBy(key, direction);
  }

  /**
   * Chain to LIMIT clause after defining WHERE conditions
   */
  limit(count: number): QueryBuilder<T> {
    return this.queryBuilder.limit(count);
  }

  /**
   * Chain to OFFSET clause after defining WHERE conditions
   */
  offset(count: number): QueryBuilder<T> {
    return this.queryBuilder.offset(count);
  }

  /**
   * Build the complete query after defining WHERE conditions
   */
  build(): QueryPayload<T> {
    return this.queryBuilder.build();
  }
}

// ================================================================================================
// === EXPORTS ====================================================================================
// ================================================================================================

/**
 * Main entry point for the fluent query builder
 * 
 * Provides two static methods:
 * - Query.for<T>(): Create complete queries with SELECT, FROM, WHERE, JOIN, etc.
 * - Query.joins(): Create standalone JOIN configurations for queryConfig
 */
export const Query = QueryBuilder;

// Re-export enums and types for convenience
export { ComparisonOperator, LogicalOperator, JoinType } from './queryGrammar';