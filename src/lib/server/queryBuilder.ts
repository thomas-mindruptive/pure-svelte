// src/lib/server/queryBuilder.ts

/**
 * @file Secure SQL Query Builder
 * @description This module is the heart of all server-side data access.
 * It is responsible for safely constructing and executing parameterized SQL queries
 * based on defined payloads and a strict security configuration. It prevents
 * SQL injection and ensures only whitelisted data can be queried.
 */

import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';
import {
	type QueryPayload,
	type JoinClause,
	type JoinSortDescriptor,
	LogicalOperator,
	ComparisonOperator,
	type ConditionGroup,
	type Condition,
	type JoinConditionGroup,
	type JoinCondition,
	isConditionGroup
} from '$lib/clientAndBack/queryGrammar';
import type { supplierQueryConfig as SupplierQueryConfigType } from '$lib/clientAndBack/queryConfig';

// -----------------------------------------------------------------------------
// TYPES AND INTERFACES
// -----------------------------------------------------------------------------

/** Defines the allowed types for safe SQL parameters. */
export type SqlParameterValue = string | number | boolean | Date | null | Buffer;

/** The result object returned by the `buildQuery` function. */
export interface QueryBuildResult {
	sql: string;
	parameters: Record<string, SqlParameterValue>;
	metadata: {
		selectColumns: string[];
		fromClause: string;
		hasJoins: boolean;
		hasWhere: boolean;
		parameterCount: number;
		tableFixed: string;
	};
}

/** A generic row object returned from a database query. */
export type QueryResultRow = Record<string, SqlParameterValue>;


// -----------------------------------------------------------------------------
// INTERNAL HELPER FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Recursively parses WHERE conditions into a parameterized SQL string.
 * It validates EVERY column key at runtime against the security whitelist.
 * @private
 */
function parseWhere(
	item: Condition<unknown> | ConditionGroup<unknown>,
	allowedColumns: ReadonlyArray<string>,
	parameters: Record<string, SqlParameterValue>,
	paramIndex: { i: number }
): string {
	// Base case: item is a single condition
	if (!isConditionGroup(item)) {
		// SECURITY: Regardless of compile-time type, validate every key at runtime against the whitelist.
		if (!allowedColumns.includes(item.key)) {
			throw new Error(`Column '${item.key}' is not allowed in the WHERE clause.`);
		}
		
		if (item.op === ComparisonOperator.IS_NULL || item.op === ComparisonOperator.IS_NOT_NULL) {
			return `${item.key} ${item.op}`;
		}

		if ((item.op === ComparisonOperator.IN || item.op === ComparisonOperator.NOT_IN) && Array.isArray(item.val)) {
			// Handle empty arrays to prevent invalid SQL like `IN ()`
			if (item.val.length === 0) return item.op === ComparisonOperator.IN ? '1=0' : '1=1';
			
			const paramNames = item.val.map(v => {
				const paramName = `p${paramIndex.i++}`;
				parameters[paramName] = v as SqlParameterValue;
				return `@${paramName}`;
			});
			return `${item.key} ${item.op} (${paramNames.join(', ')})`;
		}

		const paramName = `p${paramIndex.i++}`;
		parameters[paramName] = item.val as SqlParameterValue;
		return `${item.key} ${item.op} @${paramName}`;
	}

	// Recursive case: item is a condition group
	if (item.conditions.length === 0) return '1=1'; // Neutral for empty groups
	const parts = item.conditions.map(c => parseWhere(c, allowedColumns, parameters, paramIndex));

	if (item.op === LogicalOperator.NOT) {
		if (parts.length !== 1) throw new Error('A NOT group must contain exactly one condition or group.');
		return `NOT (${parts[0]})`;
	}

	return `(${parts.join(` ${item.op} `)})`;
}

/**
 * Builds the ORDER BY clause, validating every column key at runtime.
 * @private
 */
function buildOrderBy(
	orderBy: ReadonlyArray<JoinSortDescriptor>,
	allowedColumns: ReadonlyArray<string>
): string {
	if (orderBy.length === 0) {
		// MSSQL requires an ORDER BY clause for OFFSET/FETCH. `(SELECT NULL)` is the standard workaround.
		return 'ORDER BY (SELECT NULL)';
	}

	const orderByParts = orderBy.map(s => {
		// SECURITY: Validate every sort key against the whitelist.
		if (!allowedColumns.includes(s.key)) {
			throw new Error(`Sort column '${s.key}' is not allowed.`);
		}
		const dir = s.direction.toLowerCase();
		if (dir !== 'asc' && dir !== 'desc') {
			throw new Error(`Invalid sort direction: '${s.direction}'.`);
		}
		return `${s.key} ${dir}`;
	});

	return `ORDER BY ${orderByParts.join(', ')}`;
}

function buildJoinClauses(
	joins: ReadonlyArray<JoinClause>,
	allowedColumns: ReadonlyArray<string>
): string {
	if (!joins || joins.length === 0) return '';
	
	return joins.map(join => {
		if (!join.table || !join.on) {
			throw new Error('JOIN clause requires "table" and "on" properties.');
		}
		
		// SECURITY: Basic check to prevent trivial injection in JOIN clauses.
		if (/[;']/.test(join.table) || (join.alias && /[;']/.test(join.alias))) {
			throw new Error('Invalid characters detected in JOIN clause.');
		}
		
		const alias = join.alias ? ` AS ${join.alias}` : '';
		const onClause = parseJoinConditions(join.on, allowedColumns);
		
		return `${join.type} ${join.table}${alias} ON ${onClause}`;
	}).join(' ');
}

function parseJoinConditions(
	item: JoinConditionGroup | JoinCondition,
	allowedColumns: ReadonlyArray<string>
): string {
	// Base case: item is a single join condition (columnA = columnB)
	if (!('conditions' in item)) {
		// SECURITY: Validate both columns against whitelist
		if (!allowedColumns.includes(item.columnA) || !allowedColumns.includes(item.columnB)) {
			throw new Error(`Join columns '${item.columnA}' or '${item.columnB}' are not allowed.`);
		}
		
		// For JOIN conditions, we typically don't parameterize - it's column = column
		// But we could parameterize if needed for security
		return `${item.columnA} ${item.op} ${item.columnB}`;
	}

	// Recursive case: item is a condition group
	if (item.conditions.length === 0) return '1=1'; // Neutral for empty groups
	
	const parts = item.conditions.map(c => 
		parseJoinConditions(c, allowedColumns)
	);

	if (item.op === LogicalOperator.NOT) {
		if (parts.length !== 1) {
			throw new Error('A NOT group must contain exactly one condition or group.');
		}
		return `NOT (${parts[0]})`;
	}

	return `(${parts.join(` ${item.op} `)})`;
}


// -----------------------------------------------------------------------------
// PUBLIC API FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Builds a secure, parameterized SQL query from a payload and configuration.
 * This is the main public function of the module.
 *
 * @template T The domain entity type for strict `QueryPayload` validation.
 * @param payload The client-provided query structure, either strictly typed or for joins.
 * @param config The server-side security configuration object.
 * @param fixedFrom An optional string to enforce the `FROM` table/view, overriding any client value.
 * @returns A `QueryBuildResult` object with the SQL string, parameters, and metadata.
 */
export function buildQuery<T>(
	payload: QueryPayload<T>,
	config: typeof SupplierQueryConfigType,
	fixedFrom?: string
): QueryBuildResult {
	const startTime = Date.now();
	try {
		const fromSource = fixedFrom || payload.from;
		if (!fromSource) throw new Error('FROM clause is required.');

		log.info("Building query...", { fromSource, fixedFrom: !!fixedFrom });

		const allowedColumns = config.allowedTables[
			fromSource as keyof typeof config.allowedTables
		] as ReadonlyArray<string>;

		if (!allowedColumns) {
			throw new Error(`Table or View '${fromSource}' is not allowed for querying.`);
		}

		let fromClause: string;
		let joinClauses = '';

		if (config.joinConfigurations?.[fromSource as keyof typeof config.joinConfigurations]) {
			const joinConfig = config.joinConfigurations[fromSource as keyof typeof config.joinConfigurations];
			fromClause = joinConfig.from;
			joinClauses = buildJoinClauses(joinConfig.joins, allowedColumns);
		} else {
			fromClause = fromSource;
			if (payload.joins) joinClauses = buildJoinClauses(payload.joins, allowedColumns);
		}

		const parameters: Record<string, SqlParameterValue> = {};
		const paramIndex = { i: 0 };
		
		const selectColumns = payload.select as ReadonlyArray<string>;
		const validatedSelect = selectColumns.filter(col => {
			const baseCol = col.split(' AS ')[0].trim();
			return allowedColumns.includes(baseCol) || allowedColumns.includes(col);
		});
		if (validatedSelect.length === 0) throw new Error('No valid columns in SELECT clause after filtering.');

		let whereClause = '';
		if (payload.where) {
			// `payload.where` is structurally compatible, allowing TypeScript to resolve this safely.
			const parsed = parseWhere(payload.where as Condition<unknown>, allowedColumns, parameters, paramIndex);
			if (parsed !== '1=1') whereClause = `WHERE ${parsed}`;
		}
		
		// The `orderBy` payload is cast to the broader type, which is safe due to the `keyof T & string` fix.
		const orderByClause = buildOrderBy(
			(payload.orderBy as JoinSortDescriptor[]) || [], 
			allowedColumns
		);

		const limit = Math.min(payload.limit ?? 100, 2000);
		const offset = Math.max(payload.offset ?? 0, 0);
		const offsetClause = `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

		const sql = `SELECT ${validatedSelect.join(', ')} FROM ${fromClause} ${joinClauses} ${whereClause} ${orderByClause} ${offsetClause};`;

		const buildTime = Date.now() - startTime;
		log.info(`Query built successfully in ${buildTime}ms`, { parameterCount: paramIndex.i });

		return {
			sql, parameters,
			metadata: {
				selectColumns: validatedSelect, fromClause, hasJoins: !!joinClauses,
				hasWhere: !!whereClause, parameterCount: paramIndex.i, tableFixed: fromSource
			}
		};
	} catch (error: unknown) {
		log.error("Query building failed", { error: error instanceof Error ? error.message : String(error) });
		throw error;
	}
}

/**
 * Executes a pre-built, parameterized SQL query against the database.
 */
export async function executeQuery(sql: string, parameters: Record<string, SqlParameterValue>): Promise<QueryResultRow[]> {
    const startTime = Date.now();
    log.info("Executing query...", { parameterCount: Object.keys(parameters).length });

    try {
        const request = db.request();
        for (const [key, value] of Object.entries(parameters)) {
            request.input(key, value);
        }
        const result = await request.query(sql);
        const executionTime = Date.now() - startTime;
        log.info(`Query executed successfully in ${executionTime}ms`, { rowCount: result.recordset.length });
        return result.recordset as QueryResultRow[];
    } catch (error: unknown) {
        log.error("Query execution failed", {
            sql: sql,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}