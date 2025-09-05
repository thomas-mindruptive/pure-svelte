import { keys } from "lodash-es"

/**
 * A compile-time only, "no-op" (no-operation) function.
 * It does nothing at runtime.
 *
 * Its sole purpose is to act as a static assertion. It forces the TypeScript
 * compiler to verify that all provided string arguments are valid keys of the
 * generic type `T`. The build will fail if any key is invalid.
 *
 * This is useful for validating configurations, column definitions, or any
 * list of strings that must match a type's properties.
 *
 * @example
 * // This will compile successfully:
 * typeGuard<Wholesaler>('name', 'region', 'dropship');
 *
 * // This will cause a compile-time error:
 * typeGuard<Wholesaler>('name', 'color'); // Error: "color" is not in keyof Wholesaler
 *
 * @template T - The object type to check against.
 * @param _keys - A list of keys that must be valid properties of `T`. They are unused at runtime.
 */
export function typeGuard<T extends object>(..._keys: (keyof T)[]) { void keys(_keys) }

// Takes a type and converts props to promises wirh exception of "Exclude".
export type Promisify<T> = {
  [K in keyof T]: Promise<T[K]>
}

// Takes a type and converts props to promises wirh exception of "Exclude".
export type PromisifyExcept<T, Exclude extends keyof T = never> = {
  [K in keyof T]: K extends Exclude ? T[K] : Promise<T[K]>
}
// Example:
// type OfferingDetail_LoadDataAsync = Promisify
//   OfferingDetail_LoadData, 
//   'supplierId' | 'categoryId'
// >;

// Takes a type and converts non-primitive types to promises.
export type PromisifyComplex<T> = {
  [K in keyof T]: T[K] extends string | number | boolean | null | undefined 
    ? T[K]                    // ← Primitives stay
    : Promise<T[K]>           // ← Complex types become Promise
}