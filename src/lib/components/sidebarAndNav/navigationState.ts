// File: src/lib/components/sidebarAndNav/navigationState.ts

import { get, writable } from "svelte/store";
import { log } from "$lib/utils/logger";

// ================================================================================================
// TYPES
// ================================================================================================

/**
 * Represents the navigation state for a single hierarchy context.
 * It only contains the "memory" of the user's path.
 */
export type NavigationContext = {
  /**
   * The definitive, ordered path of navigation, e.g., ['suppliers', 3, 'categories', 5]
   */
  path: (string | number)[];
};

/**
 * Defines the entire navigation state for the application.
 */
export interface NavigationState {
  /**
   * The key of the currently active context (e.g., "suppliers").
   */
  activeContextKey: string | null;

  /**
   * A map storing the independent `NavigationContext` for each hierarchy tree.
   */
  contexts: Map<string, NavigationContext>;
}

// ================================================================================================
// INITIAL STATE
// ================================================================================================

const initialState: NavigationState = {
  activeContextKey: null,
  contexts: new Map(),
};

// ================================================================================================
// WRITABLE STORE
// ================================================================================================

/**
 * The central writable store for the entire navigation state.
 */
export const navigationState = writable<NavigationState>(initialState);

// ================================================================================================
// HELPER FUNCTIONS (STORE API)
// ================================================================================================

/**
 * Internal helper to get or create a navigation context for a given key.
 * @param state The current navigation state object.
 * @param contextKey The key for the context (e.g., "suppliers").
 * @returns The mutable NavigationContext object.
 */
function getOrCreateContext(state: NavigationState, contextKey: string): NavigationContext {
  if (!state.contexts.has(contextKey)) {
    state.contexts.set(contextKey, {
      path: [],
    });
  }
  // The "!" non-null assertion is safe here because we just created it if it didn't exist.
  return state.contexts.get(contextKey)!;
}

/**
 * Sets the definitive, reconciled primitive path for a specific context.
 * This is the primary mutator called by the `load` function.
 * @param contextKey The key of the context to update.
 * @param path The new primitive path for the context.
 */
export function setCurrentPathForContext(contextKey: string, path: (string | number)[]) {
  navigationState.update((state) => {
    log.debug(`Setting current path for context '${contextKey}':`, path);
    const context = getOrCreateContext(state, contextKey);
    context.path = path;
    state.activeContextKey = contextKey;
    return state;
  });
}

/**
 * Retrieves the current preserved path for a given context from the store.
 * Used by the `load` function during reconciliation.
 * @param contextKey The context to query.
 * @returns The preserved primitive path, or an empty array if none exists.
 */
export function getCurrentPathForContext(contextKey: string): (string | number)[] {
  // Uses `get()` to read the current value of the store once.
  return get(navigationState).contexts.get(contextKey)?.path ?? [];
}

/**
 * Resets the entire navigation state to its initial condition.
 */
export function resetNavigationState(): void {
  log.debug("⚠️ Resetting navigation state completely");
  navigationState.set(initialState);
}