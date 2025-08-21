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

// --- Building blocks for the WHERE clause (your structure, slightly renamed) ---
export interface Condition {
  key: string;            // The column name, e.g., 'name' or 'region'
  op: ComparisonOperator;
  val?: any | any[];      // Value or array of values for 'IN'. Optional for IS NULL/IS NOT NULL.
}

export interface ConditionGroup {
  op: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

// --- Building blocks for the ORDER BY clause ---
export interface SortDescriptor {
  key: string;
  direction: 'asc' | 'desc';
}

// --- The Top-Level Object: The Complete Query Payload ---
export interface QueryPayload {
  select: string[];             // The columns we want to fetch, e.g., ['wholesaler_id', 'name']
  from: string;                 // The base table to query from, e.g., 'dbo.wholesalers'
  where?: ConditionGroup;       // The (optional) WHERE clause
  orderBy?: SortDescriptor[];   // The (optional) sorting
  limit?: number;               // For pagination: How many rows?
  offset?: number;              // For pagination: How many rows to skip?
}