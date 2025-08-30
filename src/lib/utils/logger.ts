// src/lib/utils/logger.ts
/**
 * Minimal, isomorphic logger using only console.* with caller info.
 * Erweiterung: *Ln Methoden, die vor der Ausgabe eine Leerzeile einfügen.
 */

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

    // Print with newline
    debugLn: (...args: LogArgs) => void;
    infoLn: (...args: LogArgs) => void;
    warnLn: (...args: LogArgs) => void;
    errorLn: (...args: LogArgs) => void;

    // Do not print meta info like time, function name...
    debugRaw: (...args: LogArgs) => void;
    infoRaw: (...args: LogArgs) => void;
    warnRaw: (...args: LogArgs) => void;
    errorRaw: (...args: LogArgs) => void;

    infoHeader: (...args: LogArgs) => void;
}

interface CallerInfo {
    functionName: string;
    displayPath: string; // shortened "folder/file.ts:line"
}

/** Hilfsfunktion: Stacktrace parsen für CallerInfo */
function getCallerInfo(skipLevels = 0): CallerInfo | null {
    try {
        const stack = new Error().stack;
        if (!stack) return null;

        const lines = stack.split('\n');
        const start = 2 + skipLevels; // skip "Error" + wrapper
        for (let i = start; i < Math.min(lines.length, 12); i++) {
            const line = lines[i]!.trim();
            const m = line.match(/at\s+(?:(.*)\s+\()?(.*):(\d+):(\d+)\)?/);
            if (!m) continue;

            const fn = m[1] || '<anonymous>';
            const file = m[2] || '';
            const lineNo = m[3];
            const parts = file.split(/[\\/]/);
            const short = parts.slice(-2).join('/') || file;

            return {
                functionName: fn,
                displayPath: `${short}:${lineNo}`
            };
        }
    } catch { /* ignore */ }
    return null;
}

/** Basis-Wrapper für console.* */
function wrap(consoleMethod: (...args: unknown[]) => void, insertNewline = false, printMetaInfo = true) {
    return (...args: LogArgs) => {
        const caller = getCallerInfo(1);
        if (insertNewline) consoleMethod(''); // ← Leerzeile

        if (caller) {
            if (printMetaInfo) {
                const style = 'color:#888;';
                const metaInfo = `%c<${caller.functionName}> (${caller.displayPath})`;
                consoleMethod(metaInfo, style, ...args);
            } else {
                consoleMethod(...args);
            }
        } else {
            consoleMethod(...args);
        }
    };
}

export const log: AppLogger = {
    debug: wrap(console.debug),
    info: wrap(console.info),
    warn: wrap(console.warn),
    error: wrap(console.error),

    debugLn: wrap(console.debug, true),
    infoLn: wrap(console.info, true),
    warnLn: wrap(console.warn, true),
    errorLn: wrap(console.error, true),

    debugRaw: wrap(console.debug, false, false),
    infoRaw: wrap(console.info, false, false),
    warnRaw: wrap(console.warn, false, false),
    errorRaw: wrap(console.error, false, false),

    infoHeader(...args) {
        this.infoRaw("");
        this.infoRaw("=======================================================");
        this.infoRaw(args);
        this.infoRaw("=======================================================");
    },
};
