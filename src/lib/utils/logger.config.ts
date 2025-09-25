// src/lib/utils/logger.config.ts
import { LogLevel, type LoggerConfig } from './logger.types';



/**
 * Central default configuration for the logger.
 * Modify this file to change global defaults; no circular imports.
 */
export const LOGGER_DEFAULT_CONFIG: Partial<LoggerConfig> = {
    level: LogLevel.DETDEBUG,
    meta: 'location',
    skipFrames: 0,

    clientHeaderCss: 'color:#0ea5e9',
    serverHeaderAnsiColor: '\x1b[36m', // cyan
    serverAnsiReset: '\x1b[0m',

    scope: null,
};


