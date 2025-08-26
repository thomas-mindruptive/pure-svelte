
// --- Operators ---
export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT'
}

export enum ComparisonOperator {
  EQUALS = '=',
  NOT_EQUALS = '!=',
  GT = '>',
  LT = '<',
  GTE = '>=',
  LTE = '<=',
  IN = 'IN',
  NOT_IN = 'NOT IN',
  LIKE = 'LIKE',
  IS_NULL = 'IS NULL',
  IS_NOT_NULL = 'IS NOT NULL'
}

// NEU: JOIN-Support
export enum JoinType {
  INNER = 'INNER JOIN',
  LEFT = 'LEFT JOIN', 
  RIGHT = 'RIGHT JOIN',
  FULL = 'FULL OUTER JOIN'
}

export interface Condition<T = Record<string, unknown>> {
	key: keyof T | (string & {}); // Allow keys of T or any string for joins/aliases
	op: ComparisonOperator;
	val?: unknown | unknown[];
}

export interface ConditionGroup<T = Record<string, unknown>> {
	op: LogicalOperator;
	conditions: (Condition<T> | ConditionGroup<T>)[];
}

export interface SortDescriptor<T = Record<string, unknown>> {
	key: keyof T | (string & {});
	direction: 'asc' | 'desc';
}

export interface JoinClause {
  type: JoinType;
  table: string;          // e.g., 'dbo.product_categories'
  alias?: string;         // e.g., 'pc'
  on: string;             // e.g., 'wc.category_id = pc.category_id'
}

/**
 * A generic QueryPayload. When used with a domain type (e.g., QueryPayload<Wholesaler>),
 * it provides compile-time checking for `select`, `where`, and `orderBy` keys.
 */
export interface QueryPayload<T = Record<string, unknown>> {
	select: (keyof T | (string & {}))[]; // Allow keys of T or any string for aliases
	from?: string;
	joins?: JoinClause[];
	where?: ConditionGroup<T>;
	orderBy?: SortDescriptor<T>[];
	limit?: number;
	offset?: number;
}



