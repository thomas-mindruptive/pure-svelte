// src/lib/server/queryBuilder.ts

/**
 * @file Secure SQL Query Builder (FINAL & CORRECTED)
 * @description This file contains the core logic for securely converting a type-safe
 * QueryPayload object into a parameterized SQL query. It relies on a strict security
 * configuration (`aliasedTablesConfig`) as a single source of truth. It supports both
 * server-enforced queries (via `fixedFrom`) for typed endpoints and more flexible,
 * client-defined queries for generic endpoints like `/api/query`.
 */

import { log } from '$lib/utils/logger';
import { db } from '$lib/server/db';
import type { QueryPayload, WhereCondition, WhereConditionGroup, JoinClause, SortDescriptor, FromClause, JoinConditionGroup } from '$lib/clientAndBack/queryGrammar';
import { isJoinColCondition, isWhereCondition, isWhereConditionGroup } from '$lib/clientAndBack/queryGrammar';
import type { QueryConfig } from '$lib/clientAndBack/queryConfig';
import { aliasedTablesConfig } from '$lib/clientAndBack/queryConfig';

// --- TYPE DEFINITIONS for internal use ---

/** A record for storing SQL parameters, e.g., { p0: 'value1', p1: 123 } */
type Parameters = Record<string, unknown>;

/** A context object passed through the builder functions to track parameters. */
type BuildContext = {
	parameters: Parameters;
	paramIndex: number;
};

// --- HELPER FUNCTIONS ---

/**
 * Recursively builds the WHERE clause string with proper parameterization.
 * @param where The condition or group of conditions to process.
 * @param ctx The build context for tracking parameters.
 * @returns The generated SQL string for the WHERE clause segment.
 */
function buildWhereClause<T>(where: WhereCondition<T> | WhereConditionGroup<T>, ctx: BuildContext): string {
	if (isWhereConditionGroup(where)) {
		// It's a group (e.g., with AND/OR), so we recurse through its nested conditions.
		const conditions = where.conditions.map(c => buildWhereClause(c, ctx)).join(` ${where.whereCondOp} `);
		return `(${conditions})`;
	}

	// It's a single WhereCondition (e.g., { key: 'w.status', op: '=', val: 'active' }).
	const { key, whereCondOp, val } = where;

	// Handle operators that don't require a value.
	if (whereCondOp === 'IS NULL' || whereCondOp === 'IS NOT NULL') {
		return `${String(key)} ${whereCondOp}`;
	}

	// Handle IN clauses, which require special syntax for multiple parameters.
	if ((whereCondOp === 'IN' || whereCondOp === 'NOT IN') && Array.isArray(val)) {
		if (val.length === 0) return '1=0'; // Return a logically false statement if the IN array is empty to prevent SQL errors.
		const paramNames = val.map(v => {
			const paramName = `p${ctx.paramIndex++}`;
			ctx.parameters[paramName] = v;
			return `@${paramName}`;
		});
		return `${String(key)} ${whereCondOp} (${paramNames.join(', ')})`;
	}

	// For all other operators, create a single parameter.
	const paramName = `p${ctx.paramIndex++}`;
	ctx.parameters[paramName] = val;
	return `${String(key)} ${whereCondOp} @${paramName}`;
}

/**
 * Recursively builds the ON clause for a JOIN, supporting complex conditions.
 * @param on The group of conditions for the ON clause.
 * @param ctx The build context for tracking parameters.
 * @returns The generated SQL string for the ON clause segment.
 */
function buildOnClause(on: JoinConditionGroup, ctx: BuildContext): string {
	const conditions = on.conditions.map(cond => {
		if (isJoinColCondition(cond)) {
			// This is a standard column-to-column join, e.g., 'w.wholesaler_id = wc.wholesaler_id'.
			return `${cond.columnA} ${cond.op} ${cond.columnB}`;
		}
		if (isWhereCondition(cond) || isWhereConditionGroup(cond)) {
			// This handles dynamic parameters within the ON clause (for the anti-join pattern).
			// e.g., 'AND wio.wholesaler_id = @p1'
			return buildWhereClause(cond, ctx);
		}
		throw new Error('Unsupported condition type encountered in JOIN ON clause.');
	}).join(` ${on.joinCondOp} `);
	return `(${conditions})`;
}

// ===================================================================================
// MAIN BUILDER FUNCTION
// ===================================================================================

/**
 * Builds a secure, parameterized SQL query from a payload, enforcing all security rules.
 * @param payload The query definition from the client.
 * @param config The master security configuration.
 * @param namedQuery Optional name of a predefined JOIN query.
 * @param fixedFrom Optional, server-enforced FROM clause to override the client payload for typed endpoints.
 * @returns An object containing the SQL string, parameters, and metadata.
 */
export function buildQuery<T>(
	payload: QueryPayload<T>,
	config: QueryConfig,
	namedQuery?: string,
	fixedFrom?: FromClause
) {
	const { select, joins, where, orderBy, limit, offset } = payload;
	let realJoins = joins || [];

	const ctx: BuildContext = {
		parameters: {},
		paramIndex: 0,
	};

	let fromClause = '';
	let fromTableForMetadata = '';

	// --- 1. Determine and Validate the FROM Clause ---
	// This logic implements the hybrid model.
	if (namedQuery && config.joinConfigurations) {
		// Case 1: A predefined, trusted JOIN configuration is used. This is the most secure path.
		const joinConfig = config.joinConfigurations[namedQuery as keyof typeof config.joinConfigurations];
		if (!joinConfig) throw new Error(`Named query '${namedQuery}' is not defined.`);
		fromClause = joinConfig.from;
		fromTableForMetadata = namedQuery;
		if (joinConfig.joins) {
			realJoins = [...joinConfig.joins, ...realJoins];
		}
	} else {
		// Case 2: A dynamic query is being built.
		// Prioritize the server-enforced 'fixedFrom' from the typed endpoint. If it's not present,
		// fall back to the 'from' object provided by the client (used by /api/query).
		const fromSource = fixedFrom || payload.from;
		if (!fromSource) {
			throw new Error("Query payload must include a 'from' clause.");
		}

		const { table, alias } = fromSource;

		// --- NESTED VALIDATION STEPS FOR THE FROM CLAUSE ---
		// Fetch the entire configuration for the given alias from our single source of truth.
		const aliasConfig = aliasedTablesConfig[alias as keyof typeof aliasedTablesConfig];

		// SECURITY CHECK 1: The alias must be explicitly registered in `aliasedTablesConfig`.
		// This prevents any arbitrary strings from being used as aliases.
		if (!aliasConfig) {
			throw new Error(`Alias '${alias}' is not a registered alias.`);
		}

		// SECURITY CHECK 2: The alias must be used for its designated table.
		// This crucial check prevents misuse, e.g., a client trying to query `dbo.users` using the valid alias 'w'.
		if (aliasConfig.tableName !== table) {
			throw new Error(`Alias '${alias}' is registered for table '${aliasConfig.tableName}', but was incorrectly used for table '${table}'.`);
		}

		// If all checks pass, construct the final FROM clause string for the SQL query.
		fromClause = `${table} ${alias}`;
		fromTableForMetadata = table;
	}

	// --- 2. Build JOIN Clauses ---
	const joinClause = realJoins?.map((join: JoinClause) => {
		const { type, table, alias, on } = join;
		if (!alias) throw new Error("All JOINs must have an alias for consistency and security.");

		// Perform the same validation checks for each JOIN's alias and table.
		const aliasConfig = aliasedTablesConfig[alias as keyof typeof aliasedTablesConfig];
		if (!aliasConfig) throw new Error(`JOIN alias '${alias}' is not a registered alias.`);
		if (aliasConfig.tableName !== table) throw new Error(`JOIN alias '${alias}' is for table '${aliasConfig.tableName}', not '${table}'.`);

		const onClause = buildOnClause(on, ctx);
		return `${type} ${table} ${alias} ON ${onClause}`;
	}).join(' ');

	// --- 3. Build Remaining SQL Clauses ---
	const selectClause = select.join(', ');
	const whereClause = where ? `WHERE ${buildWhereClause(where, ctx)}` : '';
	const orderByClause = orderBy ? `ORDER BY ${orderBy.map((s: SortDescriptor<T>) => `${String(s.key)} ${s.direction}`).join(', ')}` : '';
	const limitClause = (limit && limit > 0) ? `OFFSET ${offset || 0} ROWS FETCH NEXT ${limit} ROWS ONLY` : '';

	// --- 4. Assemble Final Query ---
	const sql = `SELECT ${selectClause} FROM ${fromClause} ${joinClause || ''} ${whereClause} ${orderByClause} ${limitClause}`;

	return {
		sql: sql.trim().replace(/\s+/g, ' '),
		parameters: ctx.parameters,
		metadata: {
			selectColumns: select as string[],
			hasJoins: !!realJoins?.length,
			hasWhere: !!where,
			parameterCount: ctx.paramIndex,
			tableFixed: fromTableForMetadata
		}
	};
}

/**
 * Executes the generated SQL query with its parameters safely against the database.
 * @param sql The parameterized SQL string from `buildQuery`.
 * @param parameters A record of parameters to be safely injected by the driver.
 * @returns A promise that resolves to an array of query result objects.
 */
export async function executeQuery(sql: string, parameters: Parameters): Promise<Record<string, unknown>[]> {
	try {
		const request = db.request();
		for (const key in parameters) {
			request.input(key, parameters[key]);
		}
		const result = await request.query(sql);
		return result.recordset;
	} catch (err) {
		// Log the failed query for easier debugging, then re-throw.
		log.error("SQL Execution Failed", { sql, parameters, error: err });
		throw err;
	}
}