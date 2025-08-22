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

    // ✅ FIX: Separate Konfigurationen für dev/prod
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

export const log = logger;