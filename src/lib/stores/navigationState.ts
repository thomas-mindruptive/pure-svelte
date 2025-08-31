import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Defines the shape of the stored navigation path.
 */
export interface NavigationPath {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
  leaf: 'attributes' | 'links' | null;
}

const initialState: NavigationPath = {
  supplierId: null,
  categoryId: null,
  offeringId: null,
  leaf: null
};

/**
 * Creates a Svelte store that automatically persists its value
 * to sessionStorage and restores it from there.
 * @param key The key for the sessionStorage.
 * @param startValue The initial value.
 */
function createPersistentPathStore(key: string, startValue: NavigationPath): Writable<NavigationPath> {
  const storedValue = browser ? window.sessionStorage.getItem(key) : null;
  const initial = storedValue ? (JSON.parse(storedValue) as NavigationPath) : startValue;

  const store = writable<NavigationPath>(initial);

  store.subscribe(value => {
    if (browser) {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    }
  });

  return store;
}

// Export the instance of our new, persistent store.
export const navigationState = createPersistentPathStore('sb:lastPath', initialState);

/**
 * Helper function to reset the path when a new context begins.
 * E.g., called when a new supplier is selected from the list.
 */
export function resetDownstreamPath(newPath: Partial<NavigationPath>) {
  navigationState.set({
    supplierId: newPath.supplierId ?? null,
    categoryId: newPath.categoryId ?? null,
    offeringId: newPath.offeringId ?? null,
    leaf: newPath.leaf ?? null
  });
}