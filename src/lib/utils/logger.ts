// src/lib/utils/logger.ts
import { browser, dev } from '$app/environment';
import pino, { type Logger, type LoggerOptions } from 'pino';

// --- CONFIGURATION ---
const loggerConfig = {
	/**
	 * Determines how file paths should be displayed in the logs.
	 * 'full':  Show the path relative to the 'src' directory (e.g., 'src/routes/+page.svelte:25').
	 * 'short': Show only the parent folder and filename (e.g., 'routes/+page.svelte:25').
	 */
	pathDisplayMode: 'short' as 'full' | 'short'
};

// --- TYPES ---
type LogValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| Record<string, unknown>
	| unknown[]
	| Error
	| unknown;

type LogArgs = LogValue[];

export interface AppLogger {
	debug: (...args: LogArgs) => void;
	info: (...args: LogArgs) => void;
	warn: (...args: LogArgs) => void;
	error: (...args: LogArgs) => void;
}

interface CallerInfo {
	functionName: string;
	filePath: string;
	lineNumber: number;
	columnNumber: number;
	displayPath: string; // cleaned, relative path for display
}

// --- HELPERS ---

/**
 * Type guard for plain object records (not arrays, not null).
 */
function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Checks if a function is an internal Node.js function
 * that should be ignored when extracting stack traces.
 */
function isInternalFunction(functionName: string): boolean {
	const internals = ['Module.', 'Object.', 'Function.', 'processTicksAndRejections'];
	return internals.some((x) => functionName.startsWith(x));
}

/**
 * Extracts detailed caller information from the call stack.
 * @param skipLevels - number of stack levels to skip (to hide logger internals).
 */
function getCallerInfo(skipLevels: number = 0): CallerInfo | null {
	try {
		const stack = new Error().stack;
		if (!stack) return null;

		const lines = stack.split('\n');
		const initialIndex = 2 + skipLevels; // skip "Error" line + current function

		for (let i = initialIndex; i < Math.min(lines.length, 10); i++) {
			const line = lines[i].trim();
			let match = line.match(/at\s+(?:(.*)\s+\()?(.*):(\d+):(\d+)\)?/);
			if (!match) match = line.match(/(.*)@(.*):(\d+):(\d+)/);

			if (match) {
				const functionName = match[1] || '<anonymous>';
				let rawFilePath = match[2];

				// Skip internal functions or recursive logger calls
				if (isInternalFunction(functionName) || rawFilePath.includes('logger.ts')) {
					continue;
				}

				// Remove query params (like ?t=123456) from SvelteKit stack traces
				const queryParamIndex = rawFilePath.indexOf('?');
				if (queryParamIndex > -1) {
					rawFilePath = rawFilePath.substring(0, queryParamIndex);
				}

				// Normalize path
				let displayPath = rawFilePath;
				if (rawFilePath.startsWith('file://')) {
					displayPath = new URL(rawFilePath).pathname;
				}

				// Make path relative to src/
				const projectRootMarker = 'src/';
				const projectRootIndex = displayPath.indexOf(projectRootMarker);
				if (projectRootIndex > -1) {
					displayPath = displayPath.substring(projectRootIndex);
				}

				const lineNumber = parseInt(match[3], 10);
				const columnNumber = parseInt(match[4], 10);
				let finalDisplayPath = `${displayPath}:${lineNumber}`;

				// If short mode is enabled, only show last 2 path segments
				if (loggerConfig.pathDisplayMode === 'short') {
					const parts = displayPath.split('/');
					if (parts.length >= 2) {
						finalDisplayPath = parts.slice(-2).join('/') + ':' + lineNumber;
					}
				}

				return {
					functionName,
					filePath: rawFilePath,
					lineNumber,
					columnNumber,
					displayPath: finalDisplayPath
				};
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Normalizes values for logging (especially Error objects).
 * Converts Errors into plain objects with name, message, stack, and extra properties.
 */
function normalizeForLog(x: unknown): unknown {
	if (x instanceof Error) {
		// Start with the standard error fields
		const out: Record<string, unknown> = {
			name: x.name,
			message: x.message,
			stack: x.stack
		};

		// Copy enumerable custom fields without casting the Error
		for (const key of Object.keys(x)) {
			// @ts-expect-error: indexing Error for custom enumerable props
			out[key] = (x as Record<string, unknown>)[key];
		}

		return out;
	}
	return x;
}

// --- IMPLEMENTATIONS ---

/**
 * Creates a browser logger wrapper that behaves like console.log
 * but adds caller info (function + path).
 * @param consoleMethod - one of console.debug/info/warn/error
 */
const createBrowserWrapper = (consoleMethod: (...cargs: unknown[]) => void) => {
	return (...args: LogArgs): void => {
		const caller = getCallerInfo(1);
		if (caller) {
			const style = 'color: #888;';
			// Show caller info in gray, then spread the arguments
			consoleMethod(`%c<${caller.functionName}> (${caller.displayPath})`, style, ...args);
		} else {
			consoleMethod(...args);
		}
	};
};

/**
 * Creates a Pino logger wrapper that mimics console.log behavior:
 * - If first argument is a string => treat as message, log rest as objects
 * - If first argument is an object => treat as structured log object
 * - Normalizes Errors into plain objects with stack traces
 *
 * NOTE: We never spread unknown values; we only spread plain object records
 *       to satisfy TS2698 ("Spread types may only be created from object types").
 */
const createPinoWrapper =
	(pinoMethod: (...p: unknown[]) => void) =>
		(...args: LogArgs): void => {
			const caller = getCallerInfo(1);
			const callerMeta: Record<string, unknown> = caller
				? { caller: `${caller.functionName} (${caller.displayPath})` }
				: {};

			// Case 1: first arg is a string -> message + additional objects
			if (typeof args[0] === 'string') {
				const [msg, ...rest] = args;

				if (rest.length === 0) {
					// message only
					pinoMethod({ ...callerMeta }, msg);
					return;
				}

				if (rest.length === 1) {
					// message + single payload (object or primitive)
					const payload = normalizeForLog(rest[0]);
					if (isRecord(payload)) {
						pinoMethod({ ...callerMeta, ...payload }, msg);
					} else {
						pinoMethod({ ...callerMeta, value: payload }, msg);
					}
					return;
				}

				// message + many payloads -> keep them together under "extra"
				const extra = rest.map((r) => normalizeForLog(r));
				pinoMethod({ ...callerMeta, extra }, msg);
				return;
			}

			// Case 2: first arg is an object -> structured log with optional extras
			if (isRecord(args[0])) {
				const [obj, ...rest] = args;
				const normalized = normalizeForLog(obj);
				if (isRecord(normalized)) {
					if (rest.length === 0) {
						pinoMethod({ ...callerMeta, ...normalized });
						return;
					}
					const extra = rest.map((r) => normalizeForLog(r));
					pinoMethod({ ...callerMeta, ...normalized, extra });
					return;
				} else {
					// rare case: obj isn't a record after normalization
					const extra = rest.map((r) => normalizeForLog(r));
					pinoMethod({ ...callerMeta, value: normalized, extra });
					return;
				}
			}

			// Case 3: fallback -> log everything as "extra"
			const extra = args.map((r) => normalizeForLog(r));
			pinoMethod({ ...callerMeta, extra });
		};

// --- LOGGER EXPORT ---

let log: AppLogger;

if (browser) {
	// Browser: wrap console methods
	log = {
		debug: createBrowserWrapper(console.debug),
		info: createBrowserWrapper(console.info),
		warn: createBrowserWrapper(console.warn),
		error: createBrowserWrapper(console.error)
	};
} else {
	// Server: create pino options without inserting `undefined` under exactOptionalPropertyTypes
	const pinoOptions: LoggerOptions = dev
		? {
			transport: {
				target: 'pino-pretty',
				options: { colorize: true, translateTime: true }
			}
		}
		: {}; // no 'transport' key at all in production

	const pinoLogger: Logger = pino(pinoOptions);

	log = {
		// Bind methods; use wrappers that mimic console signature & behavior
		debug: createPinoWrapper(pinoLogger.debug.bind(pinoLogger)),
		info: createPinoWrapper(pinoLogger.info.bind(pinoLogger)),
		warn: createPinoWrapper(pinoLogger.warn.bind(pinoLogger)),
		error: createPinoWrapper(pinoLogger.error.bind(pinoLogger))
	};
}

export { log };
