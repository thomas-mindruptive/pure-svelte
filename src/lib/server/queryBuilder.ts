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
	type WhereConditionGroup,
	type WhereCondition,
	type JoinConditionGroup,
	type JoinColCondition,
	isWhereConditionGroup,
	isJoinColCondition,
	isConditionGroup,
	isWhereCondition
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
	fromSource: string,
	item: WhereCondition<unknown> | WhereConditionGroup<unknown>,
	allowedColumns: ReadonlyArray<string>,
	parameters: Record<string, SqlParameterValue>,
	paramIndex: { i: number }
): string {
	// Base case: item is a single condition
	if (!isWhereConditionGroup(item)) {
		// SECURITY: Regardless of compile-time type, validate every key at runtime against the whitelist.
		if (!allowedColumns.includes(item.key)) {
			throw new Error(`Column '${item.key}' is not allowed in the WHERE clause. Source: ${fromSource}`);
		}

		if (item.whereCondOp === ComparisonOperator.IS_NULL || item.whereCondOp === ComparisonOperator.IS_NOT_NULL) {
			return `${item.key} ${item.whereCondOp}`;
		}

		if ((item.whereCondOp === ComparisonOperator.IN || item.whereCondOp === ComparisonOperator.NOT_IN) && Array.isArray(item.val)) {
			// Handle empty arrays to prevent invalid SQL like `IN ()`
			if (item.val.length === 0) return item.whereCondOp === ComparisonOperator.IN ? '1=0' : '1=1';

			const paramNames = item.val.map(v => {
				const paramName = `p${paramIndex.i++}`;
				parameters[paramName] = v as SqlParameterValue;
				return `@${paramName}`;
			});
			return `${item.key} ${item.whereCondOp} (${paramNames.join(', ')})`;
		}

		const paramName = `p${paramIndex.i++}`;
		parameters[paramName] = item.val as SqlParameterValue;
		return `${item.key} ${item.whereCondOp} @${paramName}`;
	}

	// Recursive case: item is a condition group
	if (item.conditions.length === 0) return '1=1'; // Neutral for empty groups
	const parts = item.conditions.map(c => parseWhere(fromSource, c, allowedColumns, parameters, paramIndex));

	if (item.whereCondOp === LogicalOperator.NOT) {
		if (parts.length !== 1) throw new Error('A NOT group must contain exactly one condition or group.');
		return `NOT (${parts[0]})`;
	}

	return `(${parts.join(` ${item.whereCondOp} `)})`;
}

/**
 * Builds the ORDER BY clause, validating every column key at runtime.
 * @private
 */
function buildOrderBy(
	fromSource: string,
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
			throw new Error(`Sort column '${s.key}' is not allowed. Source: ${fromSource}`);
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
	fromSource: string,
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
		const onClause = parseJoinConditions(fromSource, join.on, allowedColumns);

		return `${join.type} ${join.table}${alias} ON ${onClause}`;
	}).join(' ');
}

function parseJoinConditions(
	fromSource: string,
	item: JoinConditionGroup | JoinColCondition | WhereCondition<unknown> | WhereConditionGroup<unknown>,
	allowedColumns: ReadonlyArray<string>,
	parameters?: Record<string, SqlParameterValue>,
	paramIndex?: { i: number }
): string {

	// ===== Regular WHERE =====

	// If regular WHERE => Use respective parser.
	if (isWhereCondition(item) || isWhereConditionGroup(item)) {
		log.debug(`Parsing WHERE clause`, { item, allowedColumns, fromSource });
		const whereClause = parseWhere(fromSource, item, allowedColumns, parameters ?? {}, paramIndex ?? { i: 0 });
		return whereClause;
	}

	// ===== Simple/single JOIN condition =====	
	
	log.debug(`Parsing JOIN clause`, { item, allowedColumns, fromSource });

	// Base case: item is a single join condition (columnA = columnB)
	if (!(isConditionGroup(item))) {
		if (isJoinColCondition(item)) {
			// SECURITY: Validate both columns against whitelist
			if (!allowedColumns.includes(item.columnA) || !allowedColumns.includes(item.columnB)) {
				log.error(`parseJoinConditions: Join columns '${item.columnA}' or '${item.columnB}' are not allowed. Source: ${fromSource}`, { allowedColumns }); // Extra logging for security
				throw new Error(`parseJoinConditions: Join columns '${item.columnA}' or '${item.columnB}' are not allowed. Source: ${fromSource}`);
			}

			// For JOIN conditions, we typically don't parameterize - it's column = column
			// But we could parameterize if needed for security
			return `${item.columnA} ${item.op} ${item.columnB}`;
		} else {
			throw Error("Invalid join condition: expected JoinColCondition.");
		}

	}

	// ===== JOIN condition group =====	

	// Recursive case: item is a condition group
	if (item.conditions.length === 0) return '1=1'; // Neutral for empty groups

	const parts = item.conditions.map(c =>
		parseJoinConditions(fromSource, c, allowedColumns)
	);

	if (item.joinCondOp === LogicalOperator.NOT) {
		if (parts.length !== 1) {
			throw new Error('A NOT group must contain exactly one condition or group.');
		}
		return `NOT (${parts[0]})`;
	}

	return `(${parts.join(` ${item.joinCondOp} `)})`;

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
		log.info("Starting query build...", { payload, fixedFrom });
		const fromSource = fixedFrom || payload.from;
		if (!fromSource) throw new Error('FROM clause is required.');

		const allowedColumns = config.allowedTables[
			fromSource as keyof typeof config.allowedTables
		] as ReadonlyArray<string>;

		log.info("Building query...", { fromSource, fixedFrom: !!fixedFrom, allowedColumns });

		if (!allowedColumns) {
			throw new Error(`Table or View '${fromSource}' is not allowed for querying.`);
		}

		let fromClause: string;
		let joinClauses = '';

		if (config.joinConfigurations?.[fromSource as keyof typeof config.joinConfigurations]) {
			const joinConfig = config.joinConfigurations[fromSource as keyof typeof config.joinConfigurations];
			fromClause = joinConfig.from;
			joinClauses = buildJoinClauses(fromSource, joinConfig.joins, allowedColumns);
		} else {
			fromClause = fromSource;
			if (payload.joins) joinClauses = buildJoinClauses(fromSource, payload.joins, allowedColumns);
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
			const parsed = parseWhere(fromSource, payload.where as WhereCondition<unknown>, allowedColumns, parameters, paramIndex);
			if (parsed !== '1=1') whereClause = `WHERE ${parsed}`;
		}

		// The `orderBy` payload is cast to the broader type, which is safe due to the `keyof T & string` fix.
		const orderByClause = buildOrderBy(
			fromSource,
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
		log.error("Query building failed", error);
		throw error;
	}
}

/**
 * Executes a pre-built, parameterized SQL query against the database.
 */
export async function executeQuery(sql: string, parameters: Record<string, SqlParameterValue>): Promise<QueryResultRow[]> {
	const startTime = Date.now();
	log.info("Executing query...", { sql, parameters });

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