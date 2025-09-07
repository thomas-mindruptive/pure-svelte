/**
 * Type-safe object-path utilities - Type definitions only.
 * 
 * Extracted to prevent circular imports between pathUtils and assertions.
 */

// -----------------------------------------------------------------------------
// CORE PATH TYPES
// -----------------------------------------------------------------------------

/**
 * All possible (non-empty) paths through T as tuples
 */
export type NonEmptyPath<T> = T extends Record<string | number, any>
  ? {
    [K in keyof T]-?: T[K] extends Record<string | number, any>
    ? [K] | [K, ...NonEmptyPath<T[K]>] // dive deeper if nested object
    : [K];                             // leaf property
  }[keyof T]
  : never;

/**
 * Value type at the end of a path P inside T
 */
export type PathValue<T, P> = P extends [infer K, ...infer R]
  ? K extends keyof T
  ? R extends []     // no more keys → return leaf type
  ? T[K]
  : PathValue<T[K], R> // recurse into child type
  : never
  : never;

/**
 * Optional variant: also allow empty paths (root object itself)
 */
export type PathOrRoot<T> = NonEmptyPath<T> | [];

// -----------------------------------------------------------------------------
// ADVANCED TYPE UTILITIES FOR ASSERTIONS
// -----------------------------------------------------------------------------

/**
 * Remove null and undefined from a type
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Set a nested property as definitely defined (remove null/undefined)
 */
export type SetPathDefined<T, P extends readonly PropertyKey[]> = P extends readonly [
  infer K,
  ...infer Rest
]
  ? K extends keyof T
    ? Rest extends readonly PropertyKey[]
      ? Rest extends []
        ? T & { [Key in K]: NonNullable<T[K]> }
        : T & { [Key in K]: SetPathDefined<T[K], Rest> }
      : never
    : T
  : T;

/**
 * Apply multiple path definitions to a type
 */
export type WithDefinedPaths<T, Paths extends readonly (readonly PropertyKey[])[]> = 
  Paths extends readonly [infer FirstPath, ...infer RestPaths]
    ? FirstPath extends readonly PropertyKey[]
      ? RestPaths extends readonly (readonly PropertyKey[])[]
        ? WithDefinedPaths<SetPathDefined<T, FirstPath>, RestPaths>
        : SetPathDefined<T, FirstPath>
      : T
    : T;

// -----------------------------------------------------------------------------
// UTILITY TYPES
// -----------------------------------------------------------------------------

/**
 * Extract keys that are objects (for recursive path building)
 */
export type ObjectKeys<T> = {
  [K in keyof T]: T[K] extends Record<string | number, any> ? K : never;
}[keyof T];

/**
 * Extract keys that are not objects (leaf properties)
 */
export type LeafKeys<T> = {
  [K in keyof T]: T[K] extends Record<string | number, any> ? never : K;
}[keyof T];

/**
 * Check if a type has any object properties
 */
export type HasObjectProperties<T> = ObjectKeys<T> extends never ? false : true;

// -----------------------------------------------------------------------------
// VALIDATION HELPER TYPES
// -----------------------------------------------------------------------------

/**
 * Check if a path exists in a type (compile-time validation)
 */
export type IsValidPath<T, P extends readonly PropertyKey[]> = P extends readonly [infer K, ...infer Rest]
  ? K extends keyof T
    ? Rest extends readonly PropertyKey[]
      ? Rest extends []
        ? true
        : IsValidPath<T[K], Rest>
      : false
    : false
  : false;