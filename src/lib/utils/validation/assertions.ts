/**
 * Type-safe object validation guards with path support.
 * 
 * Uses pathUtils for deep property checking with compile-time type safety.
 */

import * as pathUtils from '$lib/utils/pathUtils'; // for usage examples

// -----------------------------------------------------------------------------
// ASSERTION GUARD (THROWS)
// -----------------------------------------------------------------------------

/**
 * Assert that object is not null/undefined. Throws on failure.
 */
export function assertDefined<T>(
  obj: T | null | undefined, 
  message: string
): asserts obj is T;

/**
 * Assert that object exists and specified paths are defined. Throws on failure.
 */
export function assertDefined<T>(
  obj: T | null | undefined, 
  message: string,
  ...paths: pathUtils.NonEmptyPath<T>[]
): asserts obj is T;

/**
 * Runtime implementation for both overloads.
 */
export function assertDefined<T>(
  obj: T | null | undefined, 
  message: string,
  ...paths: pathUtils.NonEmptyPath<T>[]
): asserts obj is T {
  if (!obj) {
    throw new Error(`Validation failed: ${message} (object is null or undefined)`);
  }
  
  for (const path of paths) {
    if (!pathUtils.has(obj, path)) {
      throw new Error(`Validation failed: ${message}: Path [${(path as readonly PropertyKey[]).join('.')}] does not exist or is undefined`);
    }
  }
}

// -----------------------------------------------------------------------------
// BOOLEAN GUARD (TYPE PREDICATE)
// -----------------------------------------------------------------------------

/**
 * Check if object is not null/undefined. Returns boolean.
 */
export function isDefined<T>(obj: T | null | undefined): obj is T;

/**
 * Check if object exists and specified paths are defined. Returns boolean.
 */
export function isDefined<T>(
  obj: T | null | undefined, 
  ...paths: pathUtils.NonEmptyPath<T>[]
): obj is T;

/**
 * Runtime implementation for both overloads.
 */
export function isDefined<T>(
  obj: T | null | undefined, 
  ...paths: pathUtils.NonEmptyPath<T>[]
): obj is T {
  if (!obj) return false;
  return paths.every(path => pathUtils.has(obj, path));
}

// -----------------------------------------------------------------------------
// USAGE EXAMPLES
// -----------------------------------------------------------------------------

/*
interface User {
  profile: {
    address: {
      street: string;
      city: string;
    };
    name: string;
  };
  id: number;
}

const user: User | null = getUser();

// Boolean checks
if (isDefined(user)) {
  // TS knows: user is not null
}

if (isDefined(user, ['profile', 'name'], ['id'])) {
  // TS knows: user.profile.name and user.id exist
}

// Assertion checks (throws on failure) - message always required as second param
assertDefined(user, "User must be authenticated");
assertDefined(user, "User profile incomplete", ['profile', 'address', 'street']);

try {
  assertDefined(apiResponse, "API response invalid", ['data'], ['status']);
  processData(apiResponse.data);
} catch (error) {
  handleValidationError(error);
}

// FormShell usage
assertDefined(initial, "FormShell requires valid initial data");
const cleanInitial = createSnapshot(initial);
*/