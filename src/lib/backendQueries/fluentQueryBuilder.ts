// src/lib/clientAndBack/queryBuilder.ts

// Types (nur für Typisierung)
import type { 
  QueryPayload, 
  JoinClause, 
  WhereCondition, 
  WhereConditionGroup,
  JoinColCondition,
  JoinConditionGroup
} from './queryGrammar';

// Values (Enums, die zur Laufzeit verwendet werden)
import { 
  JoinType, 
  ComparisonOperator,
  LogicalOperator
} from './queryGrammar';

import type { 
  AllQualifiedColumns, 
  AllAliasedColumns, 
  ValidFromClause 
} from './queryConfig.types';

export class QueryBuilder<T> {
  private payload: Partial<QueryPayload<T>> = {};
  private currentWhere: WhereConditionGroup<T> | null = null;

  private constructor() {}

  static for<T>(): QueryBuilder<T> {
    return new QueryBuilder<T>();
  }

  from(table: ValidFromClause['table'], alias: ValidFromClause['alias']): this {
    this.payload.from = { table, alias } as ValidFromClause;
    return this;
  }

  select(columns: Array<keyof T | AllQualifiedColumns | AllAliasedColumns>): this {
    this.payload.select = columns;
    return this;
  }

  innerJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.createJoin(JoinType.INNER, table, alias);
  }

  leftJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.createJoin(JoinType.LEFT, table, alias);
  }

  rightJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.createJoin(JoinType.RIGHT, table, alias);
  }

  fullJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.createJoin(JoinType.FULL, table, alias);
  }

  private createJoin(type: JoinType | `${JoinType}`, table: string, alias?: string): JoinBuilder<T> {
    const joinClause: JoinClause = {
      type,
      table,
      ...(alias && { alias }),
      on: {
        joinCondOp: LogicalOperator.AND,
        conditions: []
      }
    };

    if (!this.payload.joins) {
      this.payload.joins = [];
    }
    this.payload.joins.push(joinClause);

    return new JoinBuilder(this, joinClause);
  }

  where(): WhereBuilder<T> {
    this.currentWhere = {
      whereCondOp: LogicalOperator.AND,
      conditions: []
    };
    this.payload.where = this.currentWhere;
    return new WhereBuilder(this, this.currentWhere);
  }

  orderBy(key: keyof T & string | AllQualifiedColumns | AllAliasedColumns, direction: 'asc' | 'desc' = 'asc'): this {
    if (!this.payload.orderBy) {
      this.payload.orderBy = [];
    }
    this.payload.orderBy.push({ key, direction });
    return this;
  }

  limit(count: number): this {
    this.payload.limit = count;
    return this;
  }

  offset(count: number): this {
    this.payload.offset = count;
    return this;
  }

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

export class JoinBuilder<T> {
  constructor(
    private queryBuilder: QueryBuilder<T>,
    private joinClause: JoinClause
  ) {}

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

  // Convenience method für einfache OR-Bedingungen
  orColumnCondition(
    columnA: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    columnB: AllQualifiedColumns | AllAliasedColumns
  ): this {
    return this.orGroup(group => group.onColumnCondition(columnA, op, columnB));
  }

  orValueCondition(
    column: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    value: unknown | unknown[]
  ): this {
    return this.orGroup(group => group.onValueCondition(column, op, value));
  }

  // Gruppierte JOIN-Bedingungen
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

  orGroup(builderFn: (group: JoinConditionBuilder) => void): this {
    const subGroup: JoinConditionGroup = {
      joinCondOp: LogicalOperator.OR,
      conditions: []
    };
    const subBuilder = new JoinConditionBuilder(subGroup);
    builderFn(subBuilder);
    this.joinClause.on.conditions.push(subGroup);
    return this;
  }

  // Direkte Übergänge zu anderen Builder
  innerJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.queryBuilder.innerJoin(table, alias);
  }

  leftJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.queryBuilder.leftJoin(table, alias);
  }

  rightJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.queryBuilder.rightJoin(table, alias);
  }

  fullJoin(table: string, alias?: string): JoinBuilder<T> {
    return this.queryBuilder.fullJoin(table, alias);
  }

  where(): WhereBuilder<T> {
    return this.queryBuilder.where();
  }

  orderBy(key: keyof T & string | AllQualifiedColumns | AllAliasedColumns, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    return this.queryBuilder.orderBy(key, direction);
  }

  limit(count: number): QueryBuilder<T> {
    return this.queryBuilder.limit(count);
  }

  offset(count: number): QueryBuilder<T> {
    return this.queryBuilder.offset(count);
  }

  build(): QueryPayload<T> {
    return this.queryBuilder.build();
  }
}

// Builder für JOIN-Bedingungsgruppen
export class JoinConditionBuilder {
  constructor(private joinGroup: JoinConditionGroup) {}

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

  orColumnCondition(
    columnA: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    columnB: AllQualifiedColumns | AllAliasedColumns
  ): this {
    if (this.joinGroup.conditions.length > 0) {
      const newGroup: JoinConditionGroup = {
        joinCondOp: LogicalOperator.OR,
        conditions: [{
          columnA,
          op,
          columnB
        }]
      };
      this.joinGroup.conditions.push(newGroup);
    } else {
      this.joinGroup.joinCondOp = LogicalOperator.OR;
      this.onColumnCondition(columnA, op, columnB);
    }
    return this;
  }

  orValueCondition(
    column: AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    value: unknown | unknown[]
  ): this {
    if (this.joinGroup.conditions.length > 0) {
      const newGroup: JoinConditionGroup = {
        joinCondOp: LogicalOperator.OR,
        conditions: [{
          key: column,
          whereCondOp: op,
          val: value
        }]
      };
      this.joinGroup.conditions.push(newGroup);
    } else {
      this.joinGroup.joinCondOp = LogicalOperator.OR;
      this.onValueCondition(column, op, value);
    }
    return this;
  }

  // Verschachtelte Gruppen auch in JOINs
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

  orGroup(builderFn: (group: JoinConditionBuilder) => void): this {
    const subGroup: JoinConditionGroup = {
      joinCondOp: LogicalOperator.OR,
      conditions: []
    };
    const subBuilder = new JoinConditionBuilder(subGroup);
    builderFn(subBuilder);
    this.joinGroup.conditions.push(subGroup);
    return this;
  }
}

export class WhereBuilder<T> {
  constructor(
    private queryBuilder: QueryBuilder<T>,
    private whereGroup: WhereConditionGroup<T>
  ) {}

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

  or(
    key: keyof T & string | AllQualifiedColumns | AllAliasedColumns,
    op: ComparisonOperator | `${ComparisonOperator}`,
    val?: unknown | unknown[]
  ): this {
    if (this.whereGroup.conditions.length > 0) {
      const newGroup: WhereConditionGroup<T> = {
        whereCondOp: LogicalOperator.OR,
        conditions: [{
          key,
          whereCondOp: op,
          val
        }]
      };
      this.whereGroup.conditions.push(newGroup);
    } else {
      this.whereGroup.whereCondOp = LogicalOperator.OR;
      const condition: WhereCondition<T> = {
        key,
        whereCondOp: op,
        val
      };
      this.whereGroup.conditions.push(condition);
    }
    return this;
  }

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

  orGroup(builderFn: (group: WhereBuilder<T>) => void): this {
    const subGroup: WhereConditionGroup<T> = {
      whereCondOp: LogicalOperator.OR,
      conditions: []
    };
    const subBuilder = new WhereBuilder(this.queryBuilder, subGroup);
    builderFn(subBuilder);
    this.whereGroup.conditions.push(subGroup);
    return this;
  }

  orderBy(key: keyof T & string | AllQualifiedColumns | AllAliasedColumns, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    return this.queryBuilder.orderBy(key, direction);
  }

  limit(count: number): QueryBuilder<T> {
    return this.queryBuilder.limit(count);
  }

  offset(count: number): QueryBuilder<T> {
    return this.queryBuilder.offset(count);
  }

  build(): QueryPayload<T> {
    return this.queryBuilder.build();
  }
}

export const Query = QueryBuilder;

// Re-export für Convenience
export { ComparisonOperator, LogicalOperator, JoinType } from './queryGrammar';