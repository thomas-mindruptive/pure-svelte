// src/lib/utils/logger.ts
import { browser, dev } from '$app/environment';

// ✅ STRIKTE TYPES statt any
type LogValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[] | Error | unknown;
type LogArgs = LogValue[];

interface Logger {
  debug: (...args: LogArgs) => void;
  info: (...args: LogArgs) => void;
  warn: (...args: LogArgs) => void;
  error: (...args: LogArgs) => void;
}

let logger: Logger;

if (browser) {
  // --- BROWSER IMPLEMENTATION ---
  logger = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };

} else {
  // --- SERVER IMPLEMENTATION ---
  const createServerLogger = async (): Promise<Logger> => {
    const { createRequire } = await import('module');
    const pino = (await import('pino')).default;

    const require = createRequire(import.meta.url);

    const serverLogger = dev
      ? pino({
        level: 'debug',
        transport: {
          target: require.resolve('pino-pretty'),
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          }
        }
      })
      : pino({
        level: 'info'
      });

    const createPinoLogFn = (pinoMethod: (obj: Record<string, unknown>, msg?: string) => void) => {
      return (...args: LogArgs): void => {
        const logObject: Record<string, unknown> = {};
        const messageParts: string[] = [];

        // First arg als object behandeln mit Type-Guards
        if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
          const firstArg = args.shift();
          if (firstArg instanceof FormData) {
            // Type-safe FormData handling
            Object.assign(logObject, Object.fromEntries(firstArg.entries()));
          } else {
            // Safe object handling
            Object.assign(logObject, firstArg as Record<string, unknown>);
          }
        }

        // Remaining args verarbeiten mit Type-Guards
        for (const arg of args) {
          if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
            if (arg instanceof FormData) {
              // Type-safe FormData entries
              const formDataObj = Object.fromEntries(arg.entries());
              logObject.extra_data = {
                ...(logObject.extra_data as Record<string, unknown> || {}),
                ...formDataObj
              };
            } else {
              // Safe object merge
              logObject.extra_data = {
                ...(logObject.extra_data as Record<string, unknown> || {}),
                ...(arg as Record<string, unknown>)
              };
            }
          } else {
            // Convert to string safely
            messageParts.push(String(arg ?? ''));
          }
        }

        pinoMethod.call(serverLogger, logObject, messageParts.join(' '));
      };
    };

    return {
      debug: createPinoLogFn(serverLogger.debug.bind(serverLogger)),
      info: createPinoLogFn(serverLogger.info.bind(serverLogger)),
      warn: createPinoLogFn(serverLogger.warn.bind(serverLogger)),
      error: createPinoLogFn(serverLogger.error.bind(serverLogger)),
    };
  };

  logger = await createServerLogger();
}

/**
 * Get the caller function name from call stack
 * Works in Node.js, Browser, Azure Functions, etc.
 * @param skipLevels - Number of additional stack levels to skip (default: 0)
 */
export function getCurrentFunctionName(skipLevels: number = 0): string {
  try {
    const stack = new Error().stack;
    if (!stack) return 'unknown';

    const lines = stack.split('\n');

    // Skip: Error message (0), getCurrentFunctionName (1), caller (2), + additional levels
    const startIndex = 2 + skipLevels;
    for (let i = startIndex; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];

      // Try different stack trace formats
      const match =
        // V8 (Node.js, Chrome): "at functionName ..."
        line.match(/at\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/) ||
        // V8 arrow functions: "at Object.functionName"  
        line.match(/at\s+Object\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/) ||
        // V8 async: "at async functionName"
        line.match(/at\s+async\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/) ||
        // Firefox: "functionName@"
        line.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)@/) ||
        // Safari: "functionName@file"
        line.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)@.*?:\d+:\d+/);

      if (match && match[1]) {
        const name = match[1];
        // Filter out internal/framework names
        if (!isInternalFunction(name)) {
          return name;
        }
      }
    }
    return '<cannot extract function name>';
  } catch (e) {
    console.error('logger: Failed to get current function name:', e);
    throw e
  }
}

/**
* Checks if function name is internal/framework function
*/
function isInternalFunction(name: string): boolean {
  const internalNames = [
    'Object', 'Function', 'global', 'process',
    'getCurrentFunctionName', 'createLogger', 'createLoggerAuto',
    'withLogging', 'anonymous', '__awaiter', 'GenericLogger'
  ];
  return internalNames.includes(name);
}

export const log = logger;