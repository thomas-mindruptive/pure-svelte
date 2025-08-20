import { db } from '$lib/server/db';
import { type QueryPayload, type ConditionGroup, type Condition, LogicalOperator } from '../../routes/api/query/queryGrammar'; // Correctly import types


// SECURITY: Define whitelists for tables and columns to prevent injection.
const ALLOWED_TABLES: { [key: string]: string[] } = {
  'dbo.wholesalers': ['wholesaler_id', 'name', 'region', 'status', 'dropship', 'created_at', 'website'],
  'dbo.product_categories': ['category_id', 'name', 'description']
  // Add other tables and their queryable columns here
};

/**
 * Recursively parses a ConditionGroup or Condition into a parameterized SQL string.
 * This is a private helper function for executeGenericQuery.
 * @param item - The Condition or ConditionGroup to parse.
 * @param sqlRequest - The mssql request object to add parameters to.
 * @param allowedColumns - A whitelist of columns allowed for this query.
 * @param paramIndex - A reference object to track the current parameter index, preventing name collisions.
 * @returns A parameterized SQL string snippet.
 * @throws An error if an invalid column or operator is used.
 */
function parseWhere(
  item: ConditionGroup | Condition,
  sqlRequest: import('mssql').Request,
  allowedColumns: string[],
  paramIndex: { i: number }
): string {
  // Base case: If the item is a simple condition, parse it.
  if (!('conditions' in item)) {
    const condition = item as Condition;
    if (!allowedColumns.includes(condition.key)) {
      throw new Error(`Filtering by column '${condition.key}' is not allowed.`);
    }

    if (condition.op === 'IS NULL' || condition.op === 'IS NOT NULL') {
      return `${condition.key} ${condition.op}`;
    }

    const paramName = `p${paramIndex.i++}`;
    sqlRequest.input(paramName, condition.val);
    return `${condition.key} ${condition.op} @${paramName}`;
  }

  // Recursive step: If the item is a group, process its conditions.
  const conditionGroup = item as ConditionGroup;
  if (conditionGroup.conditions.length === 0) {
    return '1=1'; // Neutral expression for an empty group
  }
  
  const parts = conditionGroup.conditions.map(c => parseWhere(c, sqlRequest, allowedColumns, paramIndex));

  switch (conditionGroup.op) {
    case LogicalOperator.AND:
    case LogicalOperator.OR:
      return `(${parts.join(` ${conditionGroup.op} `)})`;
    
    case LogicalOperator.NOT:
      if (parts.length !== 1) throw new Error('A NOT group must contain exactly one condition or group.');
      return `NOT ${parts[0]}`;
    
    default:
      throw new Error(`Unsupported logical operator: ${conditionGroup.op}`);
  }
}

/**
 * Takes a QueryPayload object, securely builds a parameterized SQL query,
 * executes it, and returns the resulting data.
 * @param payload - The query definition from the client.
 * @returns A promise that resolves to an array of records from the database.
 * @throws An error if the payload is invalid or the database query fails.
 */
export async function executeGenericQuery(payload: QueryPayload): Promise<any[]> {
  const allowedColumns = ALLOWED_TABLES[payload.from];
  if (!allowedColumns) {
    throw new Error(`Querying table '${payload.from}' is not allowed.`);
  }

  const sqlRequest = db.request();
  let paramIndex = { i: 0 }; // Use a reference object for the counter

  // --- WHERE Clause ---
  let whereClause = '';
  if (payload.where && payload.where.conditions.length > 0) {
    const parsedConditions = parseWhere(payload.where, sqlRequest, allowedColumns, paramIndex);
    if (parsedConditions !== '1=1') {
      whereClause = `WHERE ${parsedConditions}`;
    }
  }

  // --- ORDER BY Clause ---
  let orderByClause = `ORDER BY ${allowedColumns[1]} ASC`; // Default sort
  if (payload.orderBy && payload.orderBy.length > 0) {
    const orderByParts = payload.orderBy.map(s => {
      if (!allowedColumns.includes(s.key)) throw new Error(`Sorting by column '${s.key}' is not allowed.`);
      if (s.direction !== 'asc' && s.direction !== 'desc') throw new Error('Invalid sort direction.');
      return `${s.key} ${s.direction}`;
    });
    orderByClause = `ORDER BY ${orderByParts.join(', ')}`;
  }
  
  // --- SELECT Clause ---
  const selectCols = payload.select.filter(col => allowedColumns.includes(col));
  if (selectCols.length === 0) {
    throw new Error('No valid columns selected for query.');
  }

  // --- LIMIT / OFFSET ---
  const limit = payload.limit ?? 50;
  const offset = payload.offset ?? 0;
  sqlRequest.input('limit', limit);
  sqlRequest.input('offset', offset);

  // --- Assemble and Execute ---
  const finalQuery = `
    SELECT ${selectCols.join(', ')}
    FROM ${payload.from}
    ${whereClause}
    ${orderByClause}
    OFFSET @offset ROWS
    FETCH NEXT @limit ROWS ONLY;
  `;

  console.log("Executing Generic Query:", finalQuery);
  const result = await sqlRequest.query(finalQuery);
  return result.recordset;
}