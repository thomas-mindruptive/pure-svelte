
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

// --- Building blocks for the WHERE clause ---
export interface Condition {
  key: string;            // Can include alias, e.g., 'w.region'
  op: ComparisonOperator;
  val?: unknown | unknown[];
}

export interface ConditionGroup {
  op: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

// NEU: JOIN-Definition
export interface JoinClause {
  type: JoinType;
  table: string;          // e.g., 'dbo.product_categories'
  alias?: string;         // e.g., 'pc'
  on: string;             // e.g., 'wc.category_id = pc.category_id'
}

// --- ORDER BY ---
export interface SortDescriptor {
  key: string;            // Can include alias, e.g., 'pc.name'
  direction: 'asc' | 'desc';
}

export interface QueryPayload {
  select: string[];             // e.g., ['w.name', 'pc.name AS category_name']
  from?: string;                 // e.g., 'dbo.wholesalers w' or virtual view name
  joins?: JoinClause[];         // NEU: Optional JOIN clauses
  where?: ConditionGroup;
  orderBy?: SortDescriptor[];
  limit?: number;
  offset?: number;
}