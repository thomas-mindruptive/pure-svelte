// src/lib/server/queryBuilder.ts
import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import { 
  type QueryPayload, 
  type ConditionGroup, 
  type Condition, 
  type JoinClause, 
  LogicalOperator 
} from '$lib/clientAndBack/queryGrammar';
import type { QueryConfig } from '$lib/clientAndBack/queryConfig';


/**
 * SQL parameter value types that can be safely passed to MSSQL
 */
export type SqlParameterValue = string | number | boolean | Date | null;

/**
 * Result from buildQuery() containing the generated SQL and parameters
 */
export interface QueryBuildResult {
  sql: string;
  parameters: Record<string, SqlParameterValue>;
  metadata: {
    selectColumns: string[];
    fromClause: string;
    hasJoins: boolean;
    hasWhere: boolean;
    parameterCount: number;
  };
}

/**
 * Recursively parses WHERE conditions into parameterized SQL string
 * @param item - Condition or ConditionGroup to parse
 * @param allowedColumns - Whitelist of allowed columns for security
 * @param parameters - Parameter object to collect parameters
 * @param paramIndex - Reference object to track parameter indices
 * @returns Parameterized SQL WHERE clause
 */
function parseWhere(
  item: ConditionGroup | Condition,
  allowedColumns: string[],
  parameters: Record<string, SqlParameterValue>,
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
      parameters[paramName] = condition.val as SqlParameterValue;
      return `${condition.key} ${condition.op} @${paramName}`;
    }

    // Recursive case: condition group
    const conditionGroup = item as ConditionGroup;
    if (conditionGroup.conditions.length === 0) {
      return '1=1'; // Neutral expression for empty group
    }
    
    const parts = conditionGroup.conditions.map(c => 
      parseWhere(c, allowedColumns, parameters, paramIndex)
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    log.error("Error building JOIN clauses:", { error, joins });
    throw error;
  }
}

/**
 * PURE FUNCTION: Builds SQL query from payload and configuration
 * 
 * @param payload - Query definition (SELECT, FROM, WHERE, etc.)
 * @param config - Security configuration with allowed tables and JOINs
 * @returns QueryBuildResult with SQL, parameters, and metadata
 * @throws Error for validation failures
 */
export function buildQuery(payload: QueryPayload, config: QueryConfig): QueryBuildResult {
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

    log.info("Building query", { 
      from: payload.from, 
      selectCount: payload.select.length,
      hasWhere: !!payload.where,
      hasJoins: !!(payload.joins && payload.joins.length > 0)
    });

    let allowedColumns: string[];
    let fromClause: string;
    let joinClauses = '';
    
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

    const parameters: Record<string, SqlParameterValue> = {};
    const paramIndex = { i: 0 };

    // --- WHERE Clause ---
    let whereClause = '';
    if (payload.where && payload.where.conditions.length > 0) {
      const parsedConditions = parseWhere(payload.where, allowedColumns, parameters, paramIndex);
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
    
    parameters['limit'] = limit;
    parameters['offset'] = offset;

    // --- Assemble Final Query ---
    const sql = `
      SELECT ${selectCols.join(', ')}
      FROM ${fromClause}
      ${joinClauses}
      ${whereClause}
      ${orderByClause}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `.trim();

    const buildTime = Date.now() - startTime;
    
    log.info("Query built successfully", { 
      sql: sql.replace(/\s+/g, ' '), 
      parameterCount: paramIndex.i,
      limit,
      offset,
      buildTimeMs: buildTime
    });

    return {
      sql,
      parameters,
      metadata: {
        selectColumns: selectCols,
        fromClause,
        hasJoins: joinClauses.length > 0,
        hasWhere: whereClause.length > 0,
        parameterCount: paramIndex.i
      }
    };

  } catch (error: unknown) {
    const buildTime = Date.now() - startTime;
    
    log.error("Query building failed", { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      payload: {
        from: payload?.from,
        selectCount: payload?.select?.length,
        hasWhere: !!(payload?.where?.conditions?.length),
        hasJoins: !!(payload?.joins?.length)
      },
      buildTimeMs: buildTime,
      configTables: config ? Object.keys(config.allowedTables) : []
    });

    // Re-throw with more context
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Query building failed: ${message}`);
  }
}

/**
 * Database query result row - represents a generic database record
 */
export type QueryResultRow = Record<string, SqlParameterValue>;

/**
 * PURE FUNCTION: Executes a SQL query with parameters
 * 
 * @param sql - Parameterized SQL query string
 * @param parameters - Query parameters object
 * @returns Promise resolving to query results
 * @throws Error for database execution failures
 */
export async function executeQuery(sql: string, parameters: Record<string, SqlParameterValue>): Promise<QueryResultRow[]> {
  const startTime = Date.now();
  
  try {
    log.info("Executing query", { 
      sql: sql.replace(/\s+/g, ' '), 
      parameterCount: Object.keys(parameters).length 
    });

    const sqlRequest = db.request();
    
    // Add all parameters to the request
    Object.entries(parameters).forEach(([key, value]) => {
      sqlRequest.input(key, value);
    });

    // Execute the query
    const result = await sqlRequest.query(sql);
    const executionTime = Date.now() - startTime;
    
    log.info("Query executed successfully", { 
      rowCount: result.recordset.length,
      executionTimeMs: executionTime
    });

    return result.recordset as QueryResultRow[];

  } catch (error: unknown) {
    const executionTime = Date.now() - startTime;
    
    log.error("Query execution failed", { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      sql: sql.replace(/\s+/g, ' '),
      parameterCount: Object.keys(parameters).length,
      executionTimeMs: executionTime
    });

    // Re-throw with more context
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Database query execution failed: ${message}`);
  }
}

/**
 * BACKWARD COMPATIBILITY: Generic query execution (build + execute)
 * 
 * @param payload - Query definition
 * @param config - Security configuration  
 * @returns Promise resolving to query results
 */
export async function executeGenericQuery(
  payload: QueryPayload, 
  config: QueryConfig
): Promise<QueryResultRow[]> {
  const { sql, parameters } = buildQuery(payload, config);
  return executeQuery(sql, parameters);
}