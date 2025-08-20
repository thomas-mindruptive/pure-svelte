// src/lib/utils/logger.ts
import { browser, dev } from '$app/environment';
import type pino from 'pino';

// ... Logger interface ...
interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

let logger: Logger;

if (browser) {
  // --- BROWSER IMPLEMENTATION ---
  // Absolut sauber, kein serverseitiger Code hier.
  logger = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };

} else {
  // --- SERVER IMPLEMENTATION (KORREKT GEKAPSELT) ---
  
  // Wir erstellen eine asynchrone IIFE (Immediately Invoked Function Expression),
  // um `await` auf der obersten Ebene verwenden zu können.
  const createServerLogger = async (): Promise<Logger> => {
    // ✅ ALLE serverseitigen Imports sind JETZT HIER INNEN.
    // Sie werden niemals vom Browser-Bundle-Scanner gesehen.
    const { createRequire } = await import('module');
    const pino = (await import('pino')).default;
    
    const require = createRequire(import.meta.url);

    const serverLogger = pino({
      level: dev ? 'debug' : 'info',
      transport: dev ? {
        target: require.resolve('pino-pretty'),
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        }
      } : undefined,
    });

    const createPinoLogFn = (pinoMethod: (obj: object, msg?: string) => void): ((...args: any[]) => void) => {
      // ... (Diese Hilfsfunktion bleibt unverändert)
      return (...args: any[]) => {
        const logObject: Record<string, any> = {};
        const messageParts: any[] = [];
        if (typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
            if (args[0] instanceof FormData) {
              Object.assign(logObject, Object.fromEntries(args.shift()));
            } else {
              Object.assign(logObject, args.shift());
            }
        }
        for (const arg of args) {
            if (typeof arg === 'object' && arg !== null) {
                let objectToMerge;
                if (arg instanceof FormData) {
                    objectToMerge = Object.fromEntries(arg);
                } else {
                    objectToMerge = arg;
                }
                logObject.extra_data = { ...(logObject.extra_data || {}), ...objectToMerge };
            } else {
                messageParts.push(arg);
            }
        }
        pinoMethod.call(serverLogger, logObject, messageParts.join(' '));
      };
    };

    return {
      debug: createPinoLogFn(serverLogger.debug),
      info: createPinoLogFn(serverLogger.info),
      warn: createPinoLogFn(serverLogger.warn),
      error: createPinoLogFn(serverLogger.error),
    };
  };

  // Wir rufen die asynchrone Funktion auf und weisen das Ergebnis zu.
  // Das 'await' auf der obersten Ebene ist in modernen Modulen erlaubt.
  logger = await createServerLogger();
}

export const log = logger;