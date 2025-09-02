/**
 * Type-safe object path utilities with clean recursive types
 */

// Alle möglichen (nicht-leeren) Pfade durch T als Tupel
export type NonEmptyPath<T> = T extends Record<string | number, any>
  ? {
      [K in keyof T]-?: T[K] extends Record<string | number, any>
        ? [K] | [K, ...NonEmptyPath<T[K]>]
        : [K];
    }[keyof T]
  : never;


// Typ des Werts am Ende eines Pfades
export type PathValue<T, P> = P extends [infer K, ...infer R]
    ? K extends keyof T
    ? R extends []
    ? T[K]
    : PathValue<T[K], R>
    : never
    : never;

// Optional: erlaubt auch leere Pfade
//type PathOrRoot<T> = NonEmptyPath<T> | [];

// ----- GET (Safe Version) ---------------------------------------------------

export function get<T, K extends keyof T>(obj: T, key: K): T[K];
export function get<T, P extends NonEmptyPath<T>>(obj: T, path: readonly [...P]): PathValue<T, P>;

// --- Implementierung (einmal) ---
export function get<T>(
  obj: T,
  keyOrPath: PropertyKey | readonly PropertyKey[]
) {
  const keys = (Array.isArray(keyOrPath) ? keyOrPath : [keyOrPath]) as readonly PropertyKey[];
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) {
      throw new Error("Invalid path");
    }
    cur = (cur as Record<PropertyKey, unknown>)[k];
  }
  return cur;
}



// ----- SET -------------------------------------------------------------------

// --- SET: Overloads ---
// 1) Ein einzelner Key
export function set<T, K extends keyof T>(obj: T, key: K, value: T[K]): void;
// 2) Tiefer Pfad als Tupel
export function set<T, P extends NonEmptyPath<T>>(
  obj: T,
  path: readonly [...P],
  value: PathValue<T, P>
): void;

// --- Implementierung (einmal) ---
export function set<T>(
  obj: T,
  keyOrPath: PropertyKey | readonly PropertyKey[],
  value: unknown
): void {
  if (Array.isArray(keyOrPath)) {
    const path = keyOrPath;
    if (path.length === 0) throw new Error("Path must be non-empty");

    let cur: unknown = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i] as PropertyKey;
      if (typeof cur !== "object" || cur === null) {
        throw new Error("Invalid path: hit non-object before last key");
      }
      cur = (cur as Record<PropertyKey, unknown>)[k];
    }

    const lastKey = path[path.length - 1] as PropertyKey;
    if (typeof cur !== "object" || cur === null) {
      throw new Error("Invalid path: cannot set on non-object");
    }
    (cur as Record<PropertyKey, unknown>)[lastKey] = value;
  } else {
    const k = keyOrPath as PropertyKey;
    if (typeof obj !== "object" || obj === null) {
      throw new Error("Invalid target: cannot set on non-object");
    }
    (obj as Record<PropertyKey, unknown>)[k] = value;
  }
}

// ----- HAS -------------------------------------------------------------------

export function has<T, P extends NonEmptyPath<T>>(
    obj: T,
    path: readonly [...P]
): boolean {
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

// ----- Einfache ROOT Variant -------------------------------------------------

export function getOrRoot<T>(
    obj: T,
    path: readonly PropertyKey[]
): unknown {
    if (path.length === 0) {
        return obj;
    }

    return get(obj, path as NonEmptyPath<T>);
}

// ===== SAMPLES =====

interface Offer {
    customer: {
        address: {
            street: string;
            city: string;
            dummy?: string
        };
        name: string;
    };
    price: number;
}

const offer: Offer = {
    customer: {
        address: { street: "Main St", city: "Berlin" },
        name: "Alice"
    },
    price: 100
};

console.log("pathUtils")

// GET → korrekt typisiert als string
const dummy = get(offer, ["customer", "address", "dummy"]);
console.log(dummy)
const street = get(offer, ["customer", "address", "street"]);
console.log(street)
const customer = get(offer, "customer");
console.log(`Customer from single: `, JSON.stringify(customer))
// street: string

// SET → erwartet string
set(offer, ["customer", "address", "dummy"], "Broadway");
console.log(`Modified: `, JSON.stringify(offer));
set(offer, "customer", { address: { street: "New St", city: "New City" }, name: "New Name" });
console.log(`Modified through single: `, JSON.stringify(offer));

// ❌ Compile Error (erwartet string, bekommt number)
// set(offer, ["customer", "address", "street"], 123);
