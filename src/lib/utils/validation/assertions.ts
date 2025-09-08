// lib/utils/assertions.ts

/**
 * Type-safe object validation guards with path support.
 * 
 * Uses pathUtils for deep property checking with compile-time type safety.
 */


import { get, has } from "../pathUtils";
import type { WithDefinedPaths, NonEmptyPath } from "../pathUtils.types";

// -----------------------------------------------------------------------------
// ASSERTION GUARD (THROWS)
// -----------------------------------------------------------------------------

/**
 * Assert that object is not null/undefined. Throws on failure.
 */
export function assertDefined<T>(
  obj: T | null | undefined, 
  message: string
): asserts obj is NonNullable<T>;

/**
 * Assert that object exists and specified paths are defined. Throws on failure.
 * Returns type where specified paths are guaranteed to be non-null/undefined.
 */
export function assertDefined<T, const Paths extends readonly (readonly PropertyKey[])[]>(
  obj: T | null | undefined, 
  message: string,
  ...paths: Paths
): asserts obj is WithDefinedPaths<NonNullable<T>, Paths>;

/**
 * Runtime implementation for both overloads.
 */
export function assertDefined<T>(
  obj: T | null | undefined, 
  message: string,
  ...paths: readonly PropertyKey[][]
): asserts obj is T {
  if (!obj) {
    throw new Error(`Validation failed: ${message} (object is null or undefined)`);
  }
  
  for (const path of paths) {
    // Check if path exists
    if (!has(obj, path as NonEmptyPath<T>)) {
      const pathStr = path.join('.');
      throw new Error(
        `Validation failed: ${message}: Path [${pathStr}] does not exist or is undefined`
      );
    }
    
    // Additional null check - has only checks existence, not null
    const value = get(obj, path as NonEmptyPath<T>);
    if (value === null || value === undefined) {
      const pathStr = path.join('.');
      throw new Error(
        `Validation failed: ${message}: Path [${pathStr}] is null or undefined`
      );
    }
  }
}

// -----------------------------------------------------------------------------
// BOOLEAN GUARD (TYPE PREDICATE)
// -----------------------------------------------------------------------------

/**
 * Check if object is not null/undefined. Returns boolean.
 */
export function isDefined<T>(obj: T | null | undefined): obj is NonNullable<T>;

/**
 * Check if object exists and specified paths are defined. Returns boolean.
 * Returns type predicate with guaranteed path types.
 */
export function isDefined<T, const Paths extends readonly (readonly PropertyKey[])[]>(
  obj: T | null | undefined, 
  ...paths: Paths
): obj is WithDefinedPaths<NonNullable<T>, Paths>;

/**
 * Runtime implementation for both overloads.
 */
export function isDefined<T>(
  obj: T | null | undefined, 
  ...paths: readonly PropertyKey[][]
): obj is T {
  if (!obj) return false;
  
  return paths.every(path => {
    // Check if path exists
    if (!has(obj, path as NonEmptyPath<T>)) return false;
    
    // Check if value is not null/undefined
    const value = get(obj, path as NonEmptyPath<T>);
    return value !== null && value !== undefined;
  });
}

// -----------------------------------------------------------------------------
// ADDITIONAL UTILITY ASSERTIONS
// -----------------------------------------------------------------------------

/**
 * Assert that a path exists and is not null, but allow undefined.
 * Useful for optional properties that shouldn't be null when present.
 */
export function assertNotNull<T, const Paths extends readonly (readonly PropertyKey[])[]>(
  obj: T | null | undefined,
  message: string,
  ...paths: Paths
): asserts obj is WithDefinedPaths<NonNullable<T>, Paths> {
  if (!obj) {
    throw new Error(`Validation failed: ${message} (object is null or undefined)`);
  }
  
  for (const path of paths) {
    if (has(obj, path as NonEmptyPath<T>)) {
      const value = get(obj, path as NonEmptyPath<T>);
      if (value === null) {
        const pathStr = path.join('.');
        throw new Error(
          `Validation failed: ${message}: Path [${pathStr}] is null (undefined is allowed)`
        );
      }
    }
  }
}

/**
 * Assert that at least one of the specified paths is defined.
 */
export function assertAnyDefined<T>(
  obj: T | null | undefined,
  message: string,
  paths: readonly (readonly PropertyKey[])[]
): asserts obj is NonNullable<T> {
  if (!obj) {
    throw new Error(`Validation failed: ${message} (object is null or undefined)`);
  }
  
  const hasAny = paths.some(path => {
    if (!has(obj, path as NonEmptyPath<T>)) return false;
    const value = get(obj, path as NonEmptyPath<T>);
    return value !== null && value !== undefined;
  });
  
  if (!hasAny) {
    const pathStrs = paths.map(p => p.join('.'));
    throw new Error(
      `Validation failed: ${message}\n` +
      `None of the required paths are defined: [${pathStrs.join(', ')}]`
    );
  }
}

/**
 * Assert that all specified paths exist and are not null/undefined.
 */
export function assertAllDefined<T, const Paths extends readonly (readonly PropertyKey[])[]>(
  obj: T | null | undefined,
  message: string,
  paths: Paths
): asserts obj is WithDefinedPaths<NonNullable<T>, Paths> {
  assertDefined(obj, message, ...paths);
}

// -----------------------------------------------------------------------------
// USAGE EXAMPLES
// -----------------------------------------------------------------------------

/*
interface ResolvedData {
  offering: {
    offering_id: string;
    name: string;
    details?: {
      description: string;
      price: number | null;
    };
  } | null;
  user: {
    id: string;
    profile?: {
      name: string;
    } | null;
  };
  metadata?: {
    timestamp: string;
  };
}

const resolvedData: ResolvedData | null = getResolvedData();

// ✅ WORKING EXAMPLES:

// Basic assertion - guarantees resolvedData is not null
assertDefined(resolvedData, "resolvedData must exist");
// Type: ResolvedData (not null)

// Path assertion - guarantees offering is not null
assertDefined(resolvedData, "reloadAttributes:resolvedData.offering", ["offering"]);
// Type: ResolvedData & { offering: NonNullable<ResolvedData['offering']> }
// Now: resolvedData.offering.offering_id ✅ (no "possibly null" error!)

// Multiple paths
assertDefined(resolvedData, "Required data missing", 
  ["offering"], 
  ["user", "profile"]
);
// Now both resolvedData.offering.offering_id and resolvedData.user.profile.name work!

// Boolean type guard version
if (isDefined(resolvedData, ["offering"])) {
  // TypeScript knows: resolvedData.offering is definitely not null
  console.log(resolvedData.offering.offering_id); // ✅ No error!
}
*/