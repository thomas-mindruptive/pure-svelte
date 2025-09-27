// src/lib/clientAndBack/queryGrammar.ts

import {
  type AllAliasedColumns,
  type AllQualifiedColumns,
  type ValidFromClause,
  type DbTableNames,
  type AliasKeys,
} from "./tableRegistry";

/**
 * @file Query Grammar & Core Structures - FINAL
 * @description Defines the building blocks for creating queries. It provides
 * TWO distinct payload types to ensure maximum type safety for different use cases:
 * 1. `QueryPayload<T>`: Strictly generic for type-safe single-entity queries.
 * 2. `JoinQueryPayload`: Flexible for complex, predefined JOINs where safety
 *    is guaranteed by the server-side `queryConfig`.
 */

// --- Enums for SQL Operators ---

export enum LogicalOperator {
  AND = "AND",
  OR = "OR",
  NOT = "NOT",
}
export enum ComparisonOperator {
  EQUALS = "=",
  NOT_EQUALS = "!=",
  GT = ">",
  LT = "<",
  GTE = ">=",
  LTE = "<=",
  IN = "IN",
  NOT_IN = "NOT IN",
  LIKE = "LIKE",
  IS_NULL = "IS NULL",
  IS_NOT_NULL = "IS NOT NULL",
}
export enum JoinType {
  INNER = "INNER JOIN",
  LEFT = "LEFT JOIN",
  RIGHT = "RIGHT JOIN",
  FULL = "FULL OUTER JOIN",
}

// --- Base Interface for Joins ---

export interface JoinClause {
  type: JoinType | `${JoinType}`;
  table: DbTableNames;
  alias: AliasKeys;
  on: JoinConditionGroup; // dieselbe Struktur wie WHERE-Bedingungen
}

// E.g. on columnA = columnB
export interface JoinColCondition {
  columnA: AllQualifiedColumns | AllAliasedColumns;
  op: ComparisonOperator | `${ComparisonOperator}`;
  columnB: AllQualifiedColumns | AllAliasedColumns;
}

// E.g. on columnA = columnB AND columnA = "hugo" where columnA = ...
export interface JoinConditionGroup {
  joinCondOp: LogicalOperator | `${LogicalOperator}`;
  conditions: (JoinColCondition | JoinConditionGroup | WhereCondition<unknown> | WhereConditionGroup<unknown>)[];
}

export interface JoinSortDescriptor {
  key: string; // Flexible `string`
  direction: "asc" | "desc";
}

// --- STRUCTURE 1: For Strictly Typed Single-Entity Queries ---

export interface WhereCondition<T> {
  key: (keyof T & string) | AllQualifiedColumns | AllAliasedColumns;
  whereCondOp: ComparisonOperator | `${ComparisonOperator}`;
  val?: unknown | unknown[];
}

export interface WhereConditionGroup<T> {
  whereCondOp: LogicalOperator | `${LogicalOperator}`;
  conditions: (WhereCondition<T> | WhereConditionGroup<T>)[]; // TODO LATER: | InlineWhereCondition<T> | InlineWhereConditionGroup<T>)[];
}

export type InlineWhereCondition<T> = [
  key: (keyof T & string) | AllQualifiedColumns | AllAliasedColumns,
  ComparisonOperator | `${ComparisonOperator}`,
  unknown | unknown[],
];

export type InlineWhereConditionGroup<T> = [
  InlineWhereCondition<T>,
  LogicalOperator | `${LogicalOperator}`,
  InlineWhereCondition<T> | InlineWhereConditionGroup<T>,
];

export function isConditionGroup<T>(
  item: WhereCondition<T> | WhereConditionGroup<T> | JoinColCondition | JoinConditionGroup,
): item is WhereConditionGroup<T> | JoinConditionGroup {
  return "conditions" in item;
}

export function isWhereCondition(
  item: JoinColCondition | JoinConditionGroup | WhereCondition<unknown> | WhereConditionGroup<unknown>,
): item is WhereCondition<unknown> {
  return "key" in item && "whereCondOp" in item;
}

export function isWhereConditionGroup<T>(
  item: JoinColCondition | JoinConditionGroup | WhereCondition<T> | WhereConditionGroup<T>,
): item is WhereConditionGroup<T> {
  return "conditions" in item && "whereCondOp" in item;
}

export function isJoinConditionGroup(item: JoinColCondition | JoinConditionGroup): item is JoinConditionGroup {
  return "joinCondOp" in item && "conditions" in item;
}

export function isJoinColCondition(
  item: JoinColCondition | JoinConditionGroup | WhereCondition<unknown> | WhereConditionGroup<unknown>,
): item is JoinColCondition {
  return "columnA" in item && "columnB" in item && "op" in item;
}

export interface SortDescriptor<T> {
  key: (keyof T & string) | AllQualifiedColumns | AllAliasedColumns;
  direction: "asc" | "desc";
}

export interface FromClause {
  table: string;
  alias: string;
}

/**
 * A strictly generic payload. Using this with `QueryPayload<Wholesaler>` makes it
 * impossible to specify an invalid key like `'color'`, providing compile-time safety.
 */
export interface QueryPayload<T> {
  select: Array<keyof T | AllQualifiedColumns | AllAliasedColumns>;
  from?: ValidFromClause;
  joins?: JoinClause[];
  where?: WhereCondition<T> | WhereConditionGroup<T>; // TODO LATER: | InlineWhereCondition<T> | InlineWhereConditionGroup<T>;
  orderBy?: SortDescriptor<T>[];
  limit?: number;
  offset?: number;
}
