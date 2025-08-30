// src/lib/utils/logger.ts
import { browser, dev } from '$app/environment';

// --- KONFIGURATION ---
const loggerConfig = {
	/**
	 * Legt fest, wie Dateipfade in den Logs angezeigt werden.
	 * 'full':  Zeigt den Pfad relativ zum 'src'-Verzeichnis (z.B. 'src/routes/browser/+page.svelte:25').
	 * 'short': Zeigt nur den Eltern-Ordner und den Dateinamen (z.B. 'browser/+page.svelte:25').
	 */
	pathDisplayMode: 'short' as 'full' | 'short'
};
// --------------------

// --- TYPEN ---
type LogValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[] | Error | unknown;
type LogArgs = LogValue[];

export interface Logger {
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
	displayPath: string; // Bereinigter, relativer Pfad für die Anzeige
}

// --- HILFSFUNKTIONEN ---

/**
 * Extrahiert detaillierte Aufrufer-Informationen aus dem Call-Stack.
 * @param skipLevels - Anzahl der zu überspringenden Stack-Ebenen.
 */
function getCallerInfo(skipLevels: number = 0): CallerInfo | null {
	try {
		const stack = new Error().stack;
		if (!stack) return null;

		const lines = stack.split('\n');
		const initialIndex = 2 + skipLevels;

		for (let i = initialIndex; i < Math.min(lines.length, 10); i++) {
			const line = lines[i].trim();
			let match = line.match(/at\s+(?:(.*)\s+\()?(.*):(\d+):(\d+)\)?/);
			if (!match) match = line.match(/(.*)@(.*):(\d+):(\d+)/);

			if (match) {
				const functionName = match[1] || '<anonymous>';
				let rawFilePath = match[2];

				if (isInternalFunction(functionName) || rawFilePath.includes('logger.ts')) {
					continue;
				}

				const queryParamIndex = rawFilePath.indexOf('?');
				if (queryParamIndex > -1) {
					rawFilePath = rawFilePath.substring(0, queryParamIndex);
				}

				let displayPath = rawFilePath;
				if (rawFilePath.startsWith('file://')) {
					displayPath = new URL(rawFilePath).pathname;
				}

				const projectRootMarker = 'src/';
				const projectRootIndex = displayPath.indexOf(projectRootMarker);
				if (projectRootIndex > -1) {
					displayPath = displayPath.substring(projectRootIndex);
				}

				const lineNumber = parseInt(match[3], 10);
				let finalDisplayPath = `${displayPath}:${lineNumber}`;

				// --- NEUE ÄNDERUNG: Pfadanzeige basierend auf Konfiguration anpassen ---
				if (loggerConfig.pathDisplayMode === 'short') {
					const pathSegments = displayPath.split('/');
					if (pathSegments.length > 2) {
						// Nimm die letzten beiden Teile (Eltern-Ordner/Datei)
						const shortPath = pathSegments.slice(-2).join('/');
						finalDisplayPath = `${shortPath}:${lineNumber}`;
					}
				}
				// -------------------------------------------------------------------

				return {
					functionName,
					filePath: rawFilePath,
					lineNumber: lineNumber,
					columnNumber: parseInt(match[4], 10),
					displayPath: finalDisplayPath
				};
			}
		}
		return null;
	} catch (e) {
		if (!browser) throw e;
		return null;
	}
}

function isInternalFunction(name: string): boolean {
	const internalNames = [
		'Object', 'Function', 'global', 'process', 'getCallerInfo', 'createLogger', 'createLoggerAuto',
		'withLogging', 'anonymous', '__awaiter', 'GenericLogger', 'createPinoWrapper', 'createBrowserWrapper'
	];
	return internalNames.includes(name);
}

// --- IMPLEMENTIERUNG ---

let logger: Logger;

if (browser) {
	// --- BROWSER IMPLEMENTATION ---
	const createBrowserWrapper = (consoleMethod: (...args: any[]) => void) => {
		return (...args: LogArgs): void => {
			const caller = getCallerInfo(1);
			if (caller) {
				const style = 'color: #888;';
				consoleMethod(`%c<${caller.functionName}> (${caller.displayPath})`, style, ...args);
			} else {
				consoleMethod(...args);
			}
		};
	};

	logger = {
		debug: createBrowserWrapper(console.debug.bind(console)),
		info: createBrowserWrapper(console.info.bind(console)),
		warn: createBrowserWrapper(console.warn.bind(console)),
		error: createBrowserWrapper(console.error.bind(console)),
	};
} else {
	// --- SERVER IMPLEMENTATION ---
	const placeholderLogger: Logger = {
		debug: (...args) => console.debug('[TEMP] ', ...args),
		info: (...args) => console.info('[TEMP] ', ...args),
		warn: (...args) => console.warn('[TEMP] ', ...args),
		error: (...args) => console.error('[TEMP] ', ...args)
	};
	logger = placeholderLogger;

	const createServerLogger = async (): Promise<Logger> => {
		const { createRequire } = await import('module');
		const pino = (await import('pino')).default;
		const require = createRequire(import.meta.url);

		const pinoInstance = dev
			? pino({
				level: 'debug',
				transport: {
					target: require.resolve('pino-pretty'),
					options: {
						colorize: true,
						ignore: 'pid,hostname,time',
						// NEU: Diese Zeile anfügen, um alle Metadaten anzuzeigen
						singleLine: true, // Optional, aber oft klarer mit Metadaten
						//messageFormat: '{caller} - {msg} {metadata}' // Zeigt Metadaten explizit an
					}
				}
			})
			: pino({
				level: 'info',
				base: { pid: undefined, hostname: undefined },
				timestamp: false
			});

		const createPinoWrapper = (pinoMethod: (...args: any[]) => void) => {
			return (...args: LogArgs): void => {
				const caller = getCallerInfo(1);
				const callerMeta = caller ? { caller: `${caller.functionName} (${caller.displayPath})` } : {};

				if (typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
					pinoMethod({ ...callerMeta, ...args[0] }, ...args.slice(1));
					return;
				}

				const msg = args[0];
				const potentialObject = args.length > 1 ? args[1] : undefined;
				if (
					typeof msg === 'string' &&
					!msg.includes('%o') &&
					!msg.includes('%O') &&
					typeof potentialObject === 'object' &&
					potentialObject !== null &&
					!Array.isArray(potentialObject)
				) {
					pinoMethod({ ...callerMeta, ...potentialObject }, msg, ...args.slice(2));
					return;
				}

				pinoMethod(callerMeta, ...args);
			};
		};

		return {
			debug: createPinoWrapper(pinoInstance.debug.bind(pinoInstance)),
			info: createPinoWrapper(pinoInstance.info.bind(pinoInstance)),
			warn: createPinoWrapper(pinoInstance.warn.bind(pinoInstance)),
			error: createPinoWrapper(pinoInstance.error.bind(pinoInstance))
		};
	};

	(async () => {
		try {
			const realLogger = await createServerLogger();
			logger.debug = realLogger.debug;
			logger.info = realLogger.info;
			logger.warn = realLogger.warn;
			logger.error = realLogger.error;
			logger.info('Logger-Proxy erfolgreich durch Pino-Instanz ersetzt.');
		} catch (e) {
			console.error('FATAL: Pino Logger konnte nicht initialisiert werden.', e);
		}
	})();
}

export const log = logger;