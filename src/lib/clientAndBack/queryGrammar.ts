// src/lib/clientAndBack/queryGrammar.ts

import type { AllAliasedColumns, AllQualifiedColumns } from "./queryConfig.types";

/**
 * @file Query Grammar & Core Structures - FINAL
 * @description Defines the building blocks for creating queries. It provides
 * TWO distinct payload types to ensure maximum type safety for different use cases:
 * 1. `QueryPayload<T>`: Strictly generic for type-safe single-entity queries.
 * 2. `JoinQueryPayload`: Flexible for complex, predefined JOINs where safety
 *    is guaranteed by the server-side `queryConfig`.
 */

// --- Enums for SQL Operators ---

export enum LogicalOperator { AND = 'AND', OR = 'OR', NOT = 'NOT' }
export enum ComparisonOperator { EQUALS = '=', NOT_EQUALS = '!=', GT = '>', LT = '<', GTE = '>=', LTE = '<=', IN = 'IN', NOT_IN = 'NOT IN', LIKE = 'LIKE', IS_NULL = 'IS NULL', IS_NOT_NULL = 'IS NOT NULL' }
export enum JoinType { INNER = 'INNER JOIN', LEFT = 'LEFT JOIN', RIGHT = 'RIGHT JOIN', FULL = 'FULL OUTER JOIN' }

// --- Base Interface for Joins ---

export interface JoinClause_old {
	type: JoinType;
	table: string;
	alias?: string;
	on: string;
}

export interface JoinClause {
  type: JoinType;
  table: string;
  alias?: string;
  on: JoinConditionGroup; // dieselbe Struktur wie WHERE-Bedingungen
}

interface JoinCondition {
  columnA: AllQualifiedColumns | AllAliasedColumns;
  op: ComparisonOperator;
  columnB: AllQualifiedColumns | AllAliasedColumns;
}

export interface JoinConditionGroup {
	op: LogicalOperator;
	conditions: (JoinCondition | JoinConditionGroup)[];
}

export interface JoinSortDescriptor {
	key: string; // Flexible `string`
	direction: 'asc' | 'desc';
}

// --- STRUCTURE 1: For Strictly Typed Single-Entity Queries ---

export interface Condition<T> {
	key: keyof T & string; // STRICT: Only allows keys of the provided domain type.
	op: ComparisonOperator;
	val?: unknown | unknown[];
}

export interface ConditionGroup<T> {
	op: LogicalOperator;
	conditions: (Condition<T> | ConditionGroup<T>)[];
}

export interface SortDescriptor<T> {
	key: keyof T & string; // STRICT
	direction: 'asc' | 'desc';
}

/**
 * A strictly generic payload. Using this with `QueryPayload<Wholesaler>` makes it
 * impossible to specify an invalid key like `'color'`, providing compile-time safety.
 */
export interface QueryPayload<T> {
	select: Array<keyof T | AllQualifiedColumns | AllAliasedColumns>; 
	from?: string;
	joins?: JoinClause[];
	where?: ConditionGroup<T>;
	orderBy?: SortDescriptor<T>[];
	limit?: number;
	offset?: number;
}


// --- STRUCTURE 2: For Flexible Predefined JOIN Queries ---

/**
 * A flexible payload for predefined JOIN queries. This is used when the `select`
 * and `where` clauses need to reference aliased or joined columns. The ultimate
 * security guarantee for these strings comes from the server-side validation against `queryConfig.ts`.
 */
export interface JoinQueryPayload {
	from?: string;
	joins?: JoinClause[];
	select: string[];
	where?: JoinConditionGroup;
	orderBy?: JoinSortDescriptor[];
	limit?: number;
	offset?: number;
}