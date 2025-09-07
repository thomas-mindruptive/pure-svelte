// src/lib/utils/logger.types.ts
/* eslint-disable no-console */

/** Supported log levels in ascending verbosity. */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  DETDEBUG = 4,
}

/**
 * How much meta information to show before each message.
 * - none                 → nothing
 * - level                → [LEVEL]
 * - location             → <fn> (file:line)
 * - level+location       → [LEVEL] + <fn> (file:line)
 * - time+level+location  → ISO time + [LEVEL] + <fn> (file:line)
 */
export type MetaPreset =
  | 'none'
  | 'level'
  | 'location'
  | 'level+location'
  | 'time+level+location';

/** Runtime configuration for the logger. */
export interface LoggerConfig {
  level: LogLevel;
  meta: MetaPreset;
  skipFrames: number;

  clientHeaderCss: string;       // CSS color for browser header
  serverHeaderAnsiColor: string; // ANSI color for server header
  serverAnsiReset: string;       // ANSI reset

  scope?: string | null;         // optional scope label
}

/** Caller information extracted from the stack. */
export interface CallerInfo {
  functionName: string;
  displayPath: string; // "folder/file.ts:line"
}

export type LogArgs = unknown[];

/** Public API surface of a logger instance. */
export interface AppLogger {
  // Standard levels
  error: (...args: LogArgs) => void;
  warn: (...args: LogArgs) => void;
  info: (...args: LogArgs) => void;
  debug: (...args: LogArgs) => void;
  detdebug: (...args: LogArgs) => void;

  // Newline variants
  errorLn: (...args: LogArgs) => void;
  warnLn:  (...args: LogArgs) => void;
  infoLn:  (...args: LogArgs) => void;
  debugLn: (...args: LogArgs) => void;
  detdebugLn: (...args: LogArgs) => void;

  // Raw variants (no meta for the call)
  errorRaw: (...args: LogArgs) => void;
  warnRaw:  (...args: LogArgs) => void;
  infoRaw:  (...args: LogArgs) => void;
  debugRaw: (...args: LogArgs) => void;
  detdebugRaw: (...args: LogArgs) => void;

  // Header block (no meta; colored per environment)
  infoHeader: (...args: LogArgs) => void;

  // Utilities
  bind: (scope: string) => AppLogger;
  setConfig: (next: Partial<LoggerConfig>) => void;
  getConfig: () => Readonly<LoggerConfig>;
  getMeta: (skip?: number) => CallerInfo | null;
}
