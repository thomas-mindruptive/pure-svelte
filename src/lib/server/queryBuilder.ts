// src/lib/server/queryBuilder.ts
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { 
  type QueryPayload, 
  type ConditionGroup, 
  type Condition, 
  type JoinClause, 
  LogicalOperator 
} from '../../routes/api/query/queryGrammar';

// Configuration passed from outside (domain-agnostic!)
export interface QueryConfig {
  allowedTables: { [tableName: string]: string[] };
  joinConfigurations?: { [viewName: string]: { from: string; joins: JoinClause[] } };
}

/**
 * Recursively parses WHERE conditions into parameterized SQL string
 * @param item - Condition or ConditionGroup to parse
 * @param sqlRequest - MSSQL request object for parameter binding
 * @param allowedColumns - Whitelist of allowed columns for security
 * @param paramIndex - Reference object to track parameter indices
 * @returns Parameterized SQL WHERE clause
 */
function parseWhere(
  item: ConditionGroup | Condition,
  sqlRequest: import('mssql').Request,
  allowedColumns: string[],
  paramIndex: { i: number }
): string {
  try {
    // Base case: simple condition
    if (!('conditions' in item)) {
      const condition = item as Condition;
      
      // Security check: validate column against whitelist
      if (!allowedColumns.includes(condition.key)) {
        throw new Error(`Column '${condition.key}' is not in the allowed columns list`);
      }

      // Handle NULL checks (no parameter needed)
      if (condition.op === 'IS NULL' || condition.op === 'IS NOT NULL') {
        return `${condition.key} ${condition.op}`;
      }

      // Parameterized condition to prevent SQL injection
      const paramName = `p${paramIndex.i++}`;
      sqlRequest.input(paramName, condition.val);
      return `${condition.key} ${condition.op} @${paramName}`;
    }

    // Recursive case: condition group
    const conditionGroup = item as ConditionGroup;
    if (conditionGroup.conditions.length === 0) {
      return '1=1'; // Neutral expression for empty group
    }
    
    const parts = conditionGroup.conditions.map(c => 
      parseWhere(c, sqlRequest, allowedColumns, paramIndex)
    );

    switch (conditionGroup.op) {
      case LogicalOperator.AND:
      case LogicalOperator.OR:
        return `(${parts.join(` ${conditionGroup.op} `)})`;
      
      case LogicalOperator.NOT:
        if (parts.length !== 1) {
          throw new Error('A NOT group must contain exactly one condition or group');
        }
        return `NOT ${parts[0]}`;
      
      default:
        throw new Error(`Unsupported logical operator: ${conditionGroup.op}`);
    }
  } catch (error) {
    log.error("Error parsing WHERE clause:", { error, item, allowedColumns });
    throw error;
  }
}

/**
 * Builds JOIN clauses from JoinClause array
 * @param joins - Array of JOIN definitions
 * @returns SQL JOIN clauses string
 */
function buildJoinClauses(joins: JoinClause[]): string {
  try {
    if (!joins || joins.length === 0) return '';
    
    return joins.map(join => {
      // Validate JOIN definition
      if (!join.table || !join.on) {
        throw new Error('JOIN clause missing required table or ON condition');
      }
      
      const alias = join.alias ? ` ${join.alias}` : '';
      return `${join.type} ${join.table}${alias} ON ${join.on}`;
    }).join(' ');
  } catch (error) {
    log.error("Error building JOIN clauses:", { error, joins });
    throw error;
  }
}

/**
 * GENERIC QueryBuilder - domain-agnostic, secure SQL query execution
 * 
 * @param payload - Query definition (SELECT, FROM, WHERE, etc.)
 * @param config - Security configuration with allowed tables and JOINs
 * @returns Promise resolving to query results
 * @throws Error for validation failures or database errors
 */
export async function executeGenericQuery(
  payload: QueryPayload, 
  config: QueryConfig
): Promise<any[]> {
  const startTime = Date.now();
  
  try {
    // Input validation
    if (!payload) {
      throw new Error('Query payload is required');
    }
    if (!config) {
      throw new Error('Query configuration is required');
    }
    if (!payload.select || payload.select.length === 0) {
      throw new Error('SELECT clause cannot be empty');
    }
    if (!payload.from) {
      throw new Error('FROM clause is required');
    }

    log.info("Executing generic query", { 
      from: payload.from, 
      selectCount: payload.select.length,
      hasWhere: !!payload.where,
      hasJoins: !!(payload.joins && payload.joins.length > 0)
    });

    let allowedColumns: string[];
    let fromClause: string;
    let joinClauses: string = '';
    
    // Check if this is a predefined JOIN configuration (virtual view)
    if (config.joinConfigurations && config.joinConfigurations[payload.from]) {
      const joinConfig = config.joinConfigurations[payload.from];
      allowedColumns = config.allowedTables[payload.from];
      
      if (!allowedColumns) {
        throw new Error(`No column definitions found for virtual view '${payload.from}'`);
      }
      
      fromClause = joinConfig.from;
      joinClauses = buildJoinClauses(joinConfig.joins);
      
      log.info("Using predefined JOIN configuration", { view: payload.from, joinCount: joinConfig.joins.length });
    } else {
      // Regular table query
      allowedColumns = config.allowedTables[payload.from];
      if (!allowedColumns) {
        throw new Error(`Table '${payload.from}' is not in the allowed tables list`);
      }
      
      fromClause = payload.from;
      
      // Build custom JOINs if provided in payload
      if (payload.joins && payload.joins.length > 0) {
        joinClauses = buildJoinClauses(payload.joins);
        log.info("Using custom JOIN clauses", { joinCount: payload.joins.length });
      }
    }

    const sqlRequest = db.request();
    let paramIndex = { i: 0 };

    // --- WHERE Clause ---
    let whereClause = '';
    if (payload.where && payload.where.conditions.length > 0) {
      const parsedConditions = parseWhere(payload.where, sqlRequest, allowedColumns, paramIndex);
      if (parsedConditions !== '1=1') {
        whereClause = `WHERE ${parsedConditions}`;
      }
    }

    // --- ORDER BY Clause ---
    let orderByClause = `ORDER BY ${allowedColumns[0]} ASC`; // Default sort by first column
    if (payload.orderBy && payload.orderBy.length > 0) {
      const orderByParts = payload.orderBy.map(s => {
        if (!allowedColumns.includes(s.key)) {
          throw new Error(`Sort column '${s.key}' is not in the allowed columns list`);
        }
        if (s.direction !== 'asc' && s.direction !== 'desc') {
          throw new Error(`Invalid sort direction: ${s.direction}`);
        }
        return `${s.key} ${s.direction}`;
      });
      orderByClause = `ORDER BY ${orderByParts.join(', ')}`;
    }
    
    // --- SELECT Clause ---
    const selectCols = payload.select.filter(col => {
      // Allow column names with aliases (e.g., 'pc.name AS category_name')
      const baseCol = col.includes(' AS ') ? col.split(' AS ')[0].trim() : col;
      return allowedColumns.includes(baseCol) || allowedColumns.includes(col);
    });
    
    if (selectCols.length === 0) {
      throw new Error('No valid columns found in SELECT clause after security filtering');
    }

    // --- LIMIT / OFFSET ---
    const limit = Math.min(payload.limit ?? 50, 1000); // Cap at 1000 for performance
    const offset = Math.max(payload.offset ?? 0, 0);   // Ensure non-negative
    
    sqlRequest.input('limit', limit);
    sqlRequest.input('offset', offset);

    // --- Assemble Final Query ---
    const finalQuery = `
      SELECT ${selectCols.join(', ')}
      FROM ${fromClause}
      ${joinClauses}
      ${whereClause}
      ${orderByClause}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `.trim();

    log.info("Query assembled", { 
      query: finalQuery.replace(/\s+/g, ' '), 
      parameterCount: paramIndex.i,
      limit,
      offset
    });

    // --- Execute Query ---
    const result = await sqlRequest.query(finalQuery);
    const executionTime = Date.now() - startTime;
    
    log.info("Query executed successfully", { 
      rowCount: result.recordset.length,
      executionTimeMs: executionTime,
      from: payload.from
    });

    return result.recordset;

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    log.error("Query execution failed", { 
      error: error.message,
      stack: error.stack,
      payload: {
        from: payload?.from,
        selectCount: payload?.select?.length,
        hasWhere: !!(payload?.where?.conditions?.length),
        hasJoins: !!(payload?.joins?.length)
      },
      executionTimeMs: executionTime,
      configTables: config ? Object.keys(config.allowedTables) : []
    });

    // Re-throw with more context for API layer
    throw new Error(`Database query failed: ${error.message}`);
  }
}