// src/lib/utils/logger.ts
/* eslint-disable no-console */
import {
  LogLevel, type MetaPreset, type LoggerConfig,
  type AppLogger, type CallerInfo, type LogArgs
} from './logger.types';
import { LOGGER_DEFAULT_CONFIG } from './logger.config';

/** SSR-safe environment flag. */
const isServer = typeof window === 'undefined';

/** Parse caller function and file:line; strip cache-busting query (?t=...). */
function parseCaller(skipLevels: number): CallerInfo | null {
  try {
    const stack = new Error().stack;
    if (!stack) return null;
    const lines = stack.split('\n');
    // [0] Error, [1] current fn; start scanning a bit deeper
    for (let i = 2 + skipLevels; i < Math.min(lines.length, 14); i++) {
      const line = lines[i]!.trim();
      const m = line.match(/at\s+(?:(.*)\s+\()?(.*):(\d+):(\d+)\)?/);
      if (!m) continue;
      const fn = m[1] || '<anonymous>';
      let file = m[2] || '';
      const lineNo = m[3];

      // Remove trailing Vite/webpack cachebusting
      file = file.replace(/\?t=\d+$/, '');

      const parts = file.split(/[\\/]/);
      const short = parts.slice(-2).join('/') || file;
      return { functionName: fn, displayPath: `${short}:${lineNo}` };
    }
  } catch { /* ignore */ }
  return null;
}

/** Map level to a bound console method. */
function levelToConsole(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case LogLevel.ERROR:    return console.error.bind(console);
    case LogLevel.WARN:     return console.warn.bind(console);
    case LogLevel.INFO:     return console.info.bind(console);
    case LogLevel.DEBUG:    return console.debug.bind(console);
    case LogLevel.DETDEBUG: return console.debug.bind(console);
    default:                return console.log.bind(console);
  }
}

/** Create a new logger with the given seed config. */
export function createLogger(seed?: Partial<LoggerConfig>): AppLogger {
  // Make a mutable config object, seeded with defaults.
  const cfg: LoggerConfig = {
    level: LogLevel.INFO,
    meta: 'time+level+location',
    skipFrames: 0,
    clientHeaderCss: 'color:#0ea5e9',
    serverHeaderAnsiColor: '\x1b[36m',
    serverAnsiReset: '\x1b[0m',
    scope: null,
    ...(seed ?? {}),
  };

  /** Core print helper. Applies level gate, builds prefix, prints payload. */
  function _print(level: LogLevel, newline: boolean, forceRaw: boolean, ...args: LogArgs) {
    if (level > cfg.level) return;
    const emit = levelToConsole(level);
    if (newline) emit('');

    // If meta is disabled for this call or globally
    if (forceRaw || cfg.meta === 'none') {
      emit(...args);
      return;
    }

    // Build prefix according to preset
    let prefix = '';
    const levelTag = `[${LogLevel[level]}]`;

    let location = '';
    if (cfg.meta.includes('location')) {
      const caller = parseCaller(2 + cfg.skipFrames); // 2: _print wrapper + bound fn
      if (caller) location = ` <${caller.functionName}> (${caller.displayPath})`;
    }

    switch (cfg.meta as MetaPreset) {
      case 'level':
        prefix = levelTag;
        break;
      case 'location':
        prefix = `${location}`.trim();
        break;
      case 'level+location':
        prefix = `${levelTag}${cfg.scope ? ` ${cfg.scope}` : ''}${location}`;
        break;
      case 'time+level+location': {
        const ts = new Date().toISOString();
        prefix = `${ts} ${levelTag}${cfg.scope ? ` ${cfg.scope}` : ''}${location}`;
        break;
      }
      // 'none' is handled above
    }

    if (!isServer) {
      emit(`%c${prefix}`, 'color:#888;', ...args);
    } else {
      emit(prefix, ...args);
    }
  }

  /** Header block: NO meta; server uses ANSI color, client uses CSS color. */
  function infoHeaderImpl(...args: LogArgs) {
    const line = '=======================================================';
    if (isServer) {
      const C = cfg.serverHeaderAnsiColor || '';
      const R = cfg.serverAnsiReset || '';
      console.info('');
      console.info(`${C}${line}${R}`);
      console.info(...args);
      console.info(`${C}${line}${R}`);
    } else {
      const css = cfg.clientHeaderCss || '';
      console.info('');
      console.info(`%c${line}`, css);
      console.info(...args);
      console.info(`%c${line}`, css);
    }
  }

  /** Build level functions with .ln and .raw variants. */
  function mk(level: LogLevel) {
    const fn = (...args: LogArgs) => _print(level, false, false, ...args);
    (fn as any).ln  = (...args: LogArgs) => _print(level, true,  false, ...args);
    (fn as any).raw = (...args: LogArgs) => _print(level, false, true,  ...args);
    return fn as ((...args: LogArgs) => void) & {
      ln: (...args: LogArgs) => void;
      raw: (...args: LogArgs) => void;
    };
  }

  const e  = mk(LogLevel.ERROR);
  const w  = mk(LogLevel.WARN);
  const i  = mk(LogLevel.INFO);
  const d  = mk(LogLevel.DEBUG);
  const dd = mk(LogLevel.DETDEBUG);

  const api: AppLogger = {
    // Standard
    error: e, warn: w, info: i, debug: d, detdebug: dd,
    // Newline
    errorLn: e.ln, warnLn: w.ln, infoLn: i.ln, debugLn: d.ln, detdebugLn: dd.ln,
    // Raw
    errorRaw: e.raw, warnRaw: w.raw, infoRaw: i.raw, debugRaw: d.raw, detdebugRaw: dd.raw,
    // Header
    infoHeader: infoHeaderImpl,

    // Utilities
    bind(scope: string): AppLogger {
      // Create a child logger sharing config values
      const child = createLogger(cfg);
      const nextScope = cfg.scope ? `${cfg.scope}/${scope}` : scope;
      child.setConfig({ scope: nextScope });
      // nudge skipFrames so location points to userland after wrapper
      child.setConfig({ skipFrames: (child.getConfig().skipFrames ?? 0) + 1 });
      return child;
    },

    setConfig(next: Partial<LoggerConfig>) {
      Object.assign(cfg, next || {});
    },

    getConfig() {
      return Object.freeze({ ...cfg });
    },

    getMeta(extraSkip = 0) {
      return parseCaller(2 + cfg.skipFrames + (extraSkip >= 0 ? extraSkip : 0));
    },
  };

  return api;
}

/** Shared logger instance using external defaults (no circular import). */
export const log: AppLogger = createLogger(LOGGER_DEFAULT_CONFIG);

/** Helper re-exports (optional) */
export function setConfig(next: Partial<LoggerConfig>) { log.setConfig(next); }
export function bind(scope: string): AppLogger { return log.bind(scope); }
