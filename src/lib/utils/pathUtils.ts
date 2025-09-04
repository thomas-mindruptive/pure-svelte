/**
 * Type-safe object-path utilities with clean recursive types.
 *
 * Features:
 * - NonEmptyPath<T>: all possible non-empty paths through T as tuples
 * - PathValue<T, P>: the value type at the end of a path P in T
 * - get / set / has: runtime helpers with compile-time type safety
 */

import { assertDefined } from "./validation/assertions";

// -----------------------------------------------------------------------------
// TYPE UTILITIES
// -----------------------------------------------------------------------------

// All possible (non-empty) paths through T as tuples
export type NonEmptyPath<T> = T extends Record<string | number, any>
  ? {
    [K in keyof T]-?: T[K] extends Record<string | number, any>
    ? [K] | [K, ...NonEmptyPath<T[K]>] // dive deeper if nested object
    : [K];                             // leaf property
  }[keyof T]
  : never;

// Value type at the end of a path P inside T
export type PathValue<T, P> = P extends [infer K, ...infer R]
  ? K extends keyof T
  ? R extends []     // no more keys → return leaf type
  ? T[K]
  : PathValue<T[K], R> // recurse into child type
  : never
  : never;

// Optional variant: also allow empty paths (root object itself)
// type PathOrRoot<T> = NonEmptyPath<T> | [];

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
  assertDefined(obj, "PathUtils.get: Object must be defined");
  assertDefined(keyOrPath, "PathUtils.get: keyOrPath must be defined");

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
  assertDefined(obj, "PathUtils.set: Object must be defined");
  assertDefined(keyOrPath, "PathUtils.set: keyOrPath must be defined");
  assertDefined(value, "PathUtils.set: value must be defined");

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

    // Set value on the last key
    const lastKey = path[path.length - 1] as PropertyKey;
    if (typeof cur !== "object" || cur === null) {
      throw new Error(`Invalid path: cannot set "${String(lastKey)}" on non-object`);
    }
    (cur as Record<PropertyKey, unknown>)[lastKey] = value;
  } else {
    // Handle single key
    const k = keyOrPath as PropertyKey;
    if (typeof obj !== "object" || obj === null) {
      throw new Error(`Invalid target: cannot set "${String(k)}" on non-object`);
    }
    (obj as Record<PropertyKey, unknown>)[k] = value;
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
  // Do not "assertDefined" here, because it uses "has" => circular.
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
  assertDefined(obj, "PathUtils.getOrRoot: Object must be defined");
  assertDefined(path, "PathUtils.getOrRoot: path must be defined");

  if (path.length === 0) {
    return obj; // return root object
  }
  return get(obj, path as NonEmptyPath<T>);
}

// -----------------------------------------------------------------------------
// SAMPLE USAGE
// -----------------------------------------------------------------------------

// interface Offer {
//   customer: {
//     address: {
//       street: string;
//       city: string;
//       dummy?: string; // optional field
//     };
//     name: string;
//   };
//   price: number;
// }

// const offer: Offer = {
//   customer: {
//     address: { street: "Main St", city: "Berlin" },
//     name: "Alice",
//   },
//   price: 100,
// };

// console.log("pathUtils demo");

// // GET → correctly inferred as string | undefined (because dummy is optional)
// const dummy = get(offer, ["customer", "address", "dummy"]);
// console.log("dummy:", dummy);

// // GET → correctly inferred as string
// const street = get(offer, ["customer", "address", "street"]);
// console.log("street:", street);

// // GET by single key
// const customer = get(offer, "customer");
// console.log(`Customer from single:`, JSON.stringify(customer));

// // SET → expects a string (matches the path type)
// set(offer, ["customer", "address", "dummy"], "Broadway");
// console.log(`Modified (dummy set):`, JSON.stringify(offer));

// // SET by single key
// set(offer, "customer", { address: { street: "New St", city: "New City" }, name: "New Name" });
// console.log(`Modified (whole customer):`, JSON.stringify(offer));

// // ❌ Compile-time error (expects string, receives number)
// // set(offer, ["customer", "address", "street"], 123);
