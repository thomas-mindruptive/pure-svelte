// src/lib/backendQueries/queryBuilder.ts

/**
 * @file Secure SQL Query Builder with Branded Schemas
 * @description Converts type-safe QueryPayload objects into parameterized SQL queries.
 * Uses branded schemas with meta information as the single source of truth.
 */

import { log } from '$lib/utils/logger';
import { db } from '$lib/backendQueries/db';
import type { QueryPayload, WhereCondition, WhereConditionGroup, JoinClause, SortDescriptor, FromClause, JoinConditionGroup } from '$lib/backendQueries/queryGrammar';
import { isJoinColCondition, isWhereCondition, isWhereConditionGroup } from '$lib/backendQueries/queryGrammar';
import type { QueryConfig } from '$lib/backendQueries/queryConfig';
import type { Transaction } from 'mssql';
import { metaByAlias, schemaByAlias } from '$lib/domain/domainTypes.utils';

// --- TYPE DEFINITIONS for internal use ---

/** A record for storing SQL parameters, e.g., { p0: 'value1', p1: 123 } */
type Parameters = Record<string, unknown>;

/** A context object passed through the builder functions to track parameters. */
type BuildContext = {
	parameters: Parameters;
	paramIndex: number;
};

// --- VALIDATION FUNCTIONS ---

/**
 * Validates SELECT columns against branded schema definitions
 * @param selectColumns - Array of column names to validate
 * @param hasJoins - Whether the query contains JOINs
 */
function validateSelectColumns(selectColumns: string[], hasJoins: boolean): void {
	for (const column of selectColumns) {
		// Handle qualified columns (e.g., "w.wholesaler_id")
		if (column.includes('.')) {
			const [alias, columnName] = column.split('.');
			let cleanColumn = columnName;

			// Handle AS clauses (e.g., "w.name AS supplier_name")
			if (cleanColumn.includes(' AS ')) {
				cleanColumn = cleanColumn.split(' AS ')[0].trim();
			}

			// Skip wildcard and aggregate functions
			if (cleanColumn === '*' ||
				cleanColumn.startsWith('COUNT(') ||
				cleanColumn.startsWith('SUM(') ||
				cleanColumn.startsWith('AVG(') ||
				cleanColumn.startsWith('MAX(') ||
				cleanColumn.startsWith('MIN(')) {
				continue;
			}

			// Validate against branded schema
			const schema = schemaByAlias.get(alias);
			if (schema) {
				const allowedColumns = schema.keyof().options;
				if (!allowedColumns.includes(cleanColumn)) {
					throw new Error(
						`Column '${cleanColumn}' not found in metadata of schema with alias '${alias}'. ` +
						`Available columns: ${allowedColumns.join(', ')}`
					);
				}
			} else {
				throw new Error(
					`Alias '${alias}' is not defined in metadata of any branded schema. ` +
					`Available aliases: ${Array.from(metaByAlias.keys()).join(', ')}`
				);
			}
		} else {
			// Unqualified column
			if (hasJoins) {
				// In JOIN queries, unqualified columns are ambiguous
				throw new Error(
					`Unqualified column '${column}' found in JOIN query. ` +
					`All columns in JOIN queries must be qualified (e.g., 'w.name', 'pc.category_id').`
				);
			}
			// In single-table queries, unqualified columns are fine - skip validation
			// Let the SQL engine handle validation at runtime
		}
	}
}

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
		fromClause = `${joinConfig.from.table} ${joinConfig.from.alias} `;
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

		// --- VALIDATION USING BRANDED SCHEMAS ---
		// Fetch the metadata for the given alias from our branded schemas
		const meta = metaByAlias.get(alias);

		// SECURITY CHECK 1: The alias must be defined in a branded schema
		if (!meta) {
			throw new Error(
				`Alias '${alias}' is not defined in metadata of any branded schema. ` +
				`Available aliases: ${Array.from(metaByAlias.keys()).join(', ')}`
			);
		}

		// SECURITY CHECK 2: The alias must be used for its designated table.
		const expectedFullTableName = `${meta.dbSchema}.${meta.tableName}`;
		const expectedTableName = meta.tableName;

		if (table !== expectedFullTableName && table !== expectedTableName) {
			throw new Error(
				`Alias '${alias}' is defined in metadata for table '${expectedFullTableName}', ` +
				`but was incorrectly used for table '${table}'.`
			);
		}

		// If all checks pass, construct the final FROM clause string for the SQL query.
		fromClause = `${table} ${alias}`;
		fromTableForMetadata = table;
	}

	// --- 2. Validate SELECT columns against Branded Schema definitions ---
	const hasJoins = realJoins.length > 0;
	if (select && Array.isArray(select)) {
		validateSelectColumns(select as string[], hasJoins);
	}

	// --- 3. Build JOIN Clauses ---
	const joinClause = realJoins?.map((join: JoinClause) => {
		const { type, table, alias, on } = join;
		if (!alias) throw new Error("All JOINs must have an alias for consistency and security.");

		// Perform the same validation checks for each JOIN's alias and table.
		const meta = metaByAlias.get(alias);
		if (!meta) {
			throw new Error(
				`JOIN alias '${alias}' is not defined in metadata of any branded schema. ` +
				`Available aliases: ${Array.from(metaByAlias.keys()).join(', ')}`
			);
		}

		const expectedFullTableName = `${meta.dbSchema}.${meta.tableName}`;

		if (table !== expectedFullTableName) {
			throw new Error(
				`JOIN alias '${alias}' is defined in metadata for table '${expectedFullTableName}', not '${table}'.`
			);
		}

		const onClause = buildOnClause(on, ctx);
		return `${type} ${table} ${alias} ON ${onClause}`;
	}).join(' ');

	// --- 4. Build Remaining SQL Clauses ---
	const selectClause = select.join(', ');
	const whereClause = where ? `WHERE ${buildWhereClause(where, ctx)}` : '';
	const orderByClause = orderBy ? `ORDER BY ${orderBy.map((s: SortDescriptor<T>) => `${String(s.key)} ${s.direction}`).join(', ')}` : '';
	const limitClause = (limit && limit > 0) ? `OFFSET ${offset || 0} ROWS FETCH NEXT ${limit} ROWS ONLY` : '';

	// --- 5. Assemble Final Query ---
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
export async function executeQuery(sql: string, parameters: Parameters, options?: { transaction?: Transaction }): Promise<Record<string, unknown>[]> {
	try {
		const requestSource = options?.transaction || db;
		const request = requestSource.request();
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