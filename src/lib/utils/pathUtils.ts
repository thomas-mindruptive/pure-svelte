/**
 * Type-safe object-path utilities with clean recursive types.
 */

import type { NonEmptyPath, PathValue } from './pathUtils.types';

// Re-export types for convenience
export type { NonEmptyPath, PathValue } from './pathUtils.types';

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

/**
 * Get the value at a single key of an object.
 */
export function get<T, K extends keyof T>(obj: T, key: K): T[K];

/**
 * Get the value at a deep path represented as a tuple.
 */
export function get<T, P extends NonEmptyPath<T>>(
  obj: T,
  path: readonly [...P]
): PathValue<T, P>;

/**
 * Runtime implementation for both overloads.
 */
export function get<T>(
  obj: T,
  keyOrPath: PropertyKey | readonly PropertyKey[]
) {
  // Simple validation without circular dependency
  if (!obj) {
    throw new Error("PathUtils.get: Object must be defined");
  }
  if (keyOrPath == null) {
    throw new Error("PathUtils.get: keyOrPath must be defined");
  }

  // Normalize input to array
  const keys = (Array.isArray(keyOrPath) ? keyOrPath : [keyOrPath]) as readonly PropertyKey[];
  let cur: unknown = obj;

  // Walk the path
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) {
      throw new Error(`Invalid path: encountered non-object before key "${String(k)}"`);
    }
    cur = (cur as Record<PropertyKey, unknown>)[k];
  }
  return cur;
}

// -----------------------------------------------------------------------------
// SET
// -----------------------------------------------------------------------------

/**
 * Set a value at a single top-level key.
 */
export function set<T, K extends keyof T>(obj: T, key: K, value: T[K]): void;

/**
 * Set a value at a deep path.
 */
export function set<T, P extends NonEmptyPath<T>>(
  obj: T,
  path: readonly [...P],
  value: PathValue<T, P>
): void;

/**
 * Runtime implementation for both overloads.
 */
export function set<T>(
  obj: T,
  keyOrPath: PropertyKey | readonly PropertyKey[],
  value: unknown
): void {
  // Simple validation without circular dependency
  if (!obj) {
    throw new Error("PathUtils.set: Object must be defined");
  }
  if (keyOrPath == null) {
    throw new Error("PathUtils.set: keyOrPath must be defined");
  }
  // Special handling: value === undefined means "unset" → delete property if it exists

  if (Array.isArray(keyOrPath)) {
    const path = keyOrPath;
    if (path.length === 0) throw new Error("Path must be non-empty");

    let cur: unknown = obj;

    // Traverse until just before the last key
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i] as PropertyKey;
      if (typeof cur !== "object" || cur === null) {
        throw new Error(`Invalid path: encountered non-object before key "${String(k)}"`);
      }
      cur = (cur as Record<PropertyKey, unknown>)[k];
    }

    // Set or delete value on the last key
    const lastKey = path[path.length - 1] as PropertyKey;
    if (typeof cur !== "object" || cur === null) {
      throw new Error(`Invalid path: cannot set "${String(lastKey)}" on non-object`);
    }
    if (value === undefined) {
      delete (cur as Record<PropertyKey, unknown>)[lastKey];
    } else {
      (cur as Record<PropertyKey, unknown>)[lastKey] = value;
    }
  } else {
    // Handle single key
    const k = keyOrPath as PropertyKey;
    if (typeof obj !== "object" || obj === null) {
      throw new Error(`Invalid target: cannot set "${String(k)}" on non-object`);
    }
    if (value === undefined) {
      delete (obj as Record<PropertyKey, unknown>)[k];
    } else {
      (obj as Record<PropertyKey, unknown>)[k] = value;
    }
  }
}

// -----------------------------------------------------------------------------
// HAS
// -----------------------------------------------------------------------------

/**
 * Check whether a deep path exists in an object.
 * Returns true if every step exists and the final value is not undefined.
 */
export function has<T, P extends NonEmptyPath<T>>(
  obj: T,
  path: readonly [...P]
): boolean {
  // Simple check without circular dependencies
  try {
    let cur: unknown = obj;

    for (const key of path as readonly PropertyKey[]) {
      if (typeof cur !== "object" || cur === null) return false;
      if (!(key in (cur as Record<PropertyKey, unknown>))) return false;
      cur = (cur as Record<PropertyKey, unknown>)[key];
    }

    return cur !== undefined;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// GET OR ROOT
// -----------------------------------------------------------------------------

/**
 * Return obj itself if path is empty, otherwise delegate to get().
 */
export function getOrRoot<T>(
  obj: T,
  path: readonly PropertyKey[]
): unknown {
  // Simple validation without circular dependency
  if (!obj) {
    throw new Error("PathUtils.getOrRoot: Object must be defined");
  }
  if (path == null) {
    throw new Error("PathUtils.getOrRoot: path must be defined");
  }

  if (path.length === 0) {
    return obj; // return root object
  }
  return get(obj, path as NonEmptyPath<T>);
}