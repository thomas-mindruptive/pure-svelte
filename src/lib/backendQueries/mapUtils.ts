/**
 * Generic utility functions for creating Maps from arrays.
 */

import { assertDefined } from "$lib/utils/assertions";

/**
 * Generates a Map from an array of data using a key extractor function.
 * 
 * @template T - The type of items in the array
 * @param data - Array of items to convert to a Map
 * @param keyExtractor - Function that extracts the numeric key from each item
 * @returns Map with numeric keys and values of type T
 * @throws Error if key is undefined or null.
 * 
 * @example
 * const materials: Material[] = [...];
 * const map = generateMapFromData(materials, (m) => m.material_id);
 * // Map<number, Material>
 */
export function generateMapFromData<T>(
  data: T[],
  keyExtractor: (item: T) => number
): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of data) {
    const key = keyExtractor(item);
    assertDefined(key, "key");
    map.set(key, item);
  }
  return map;
}

/**
 * Generates multiple Maps from an array of data arrays.
 * Each inner array is converted to a Map using the provided key extractor.
 * 
 * @template T - The type of items in the arrays
 * @param dataArrays - Array of arrays, each containing items to convert to a Map
 * @param keyExtractor - Function that extracts the numeric key from each item
 * @returns Array of Maps, one for each input array
 * 
 * @example
 * const materialsArray1: Material[] = [...];
 * const materialsArray2: Material[] = [...];
 * const maps = generateMapsFromDataArrays(
 *   [materialsArray1, materialsArray2],
 *   (m) => m.material_id
 * );
 * // Map<number, Material>[]
 */
export function generateMapsFromDataArrays<T>(
  dataArrays: T[][],
  keyExtractor: (item: T) => number
): Map<number, T>[] {
  return dataArrays.map(data => generateMapFromData(data, keyExtractor));
}

/**
 * Generates a Map from an array of data using a key extractor function,
 * with support for merging duplicate keys (last value wins).
 * 
 * @template T - The type of items in the array
 * @param data - Array of items to convert to a Map
 * @param keyExtractor - Function that extracts the numeric key from each item
 * @param mergeStrategy - Optional function to merge values when duplicate keys are found
 * @returns Map with numeric keys and values of type T
 * 
 * @example
 * const materials: Material[] = [...];
 * const map = generateMapFromDataWithMerge(
 *   materials,
 *   (m) => m.material_id,
 *   (existing, newItem) => newItem // Last value wins
 * );
 */
export function generateMapFromDataWithMerge<T>(
  data: T[],
  keyExtractor: (item: T) => number,
  mergeStrategy?: (existing: T, newItem: T) => T
): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of data) {
    const key = keyExtractor(item);
    if (map.has(key) && mergeStrategy) {
      const merged = mergeStrategy(map.get(key)!, item);
      map.set(key, merged);
    } else {
      map.set(key, item);
    }
  }
  return map;
}

