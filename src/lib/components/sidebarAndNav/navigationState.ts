// File: src/lib/components/sidebarAndNav/navigationState.svelte.ts

import { log } from "$lib/utils/logger";

/**
 * An app can have several navigation contextes or "trees".
 * The context reflexts the currently active or valid "depth" of the navigation.
 * E.g. suppliers -> supplier1 -> categories -> category1
 */
export type NavigationContext = {
  contextKey: string;
  path: (string | number)[];
};

/**
 * The state is defined by all available contexts.
 */
export interface NavigationState {
  activeContextKey: string | null;
  contexts: Map<string, NavigationContext>;
}

// ================================================================================================
// SVELTE 5 RUNES-BASED STORE
// ================================================================================================

function createNavigationStore() {
  // Use $state rune for reactive state
  const state = $state<NavigationState>({
    activeContextKey: null,
    contexts: new Map(),
  });

  // Derived state using $derived rune
  const activeContext = $derived(() => {
    if (!state.activeContextKey) return null;
    return state.contexts.get(state.activeContextKey) ?? null;
  });

  const currentPath = $derived(() => activeContext()?.path ?? []);

  // Helper function
  function getOrCreateContext(contextKey: string): NavigationContext {
    if (!state.contexts.has(contextKey)) {
      state.contexts.set(contextKey, {
        contextKey,
        path: [],
      });
    }
    return state.contexts.get(contextKey)!;
  }

  return {
    // Read-only reactive state
    get activeContextKey() {
      return state.activeContextKey;
    },
    
    get contexts() {
      return state.contexts;
    },
    
    get activeContext() {
      return activeContext();
    },

    get currentPath() {
      return currentPath();
    },

    // Actions
    setCurrentPathForContext(contextKey: string, path: (string | number)[]) {
      log.debug(`Setting current path for context '${contextKey}':`, path);
      const context = getOrCreateContext(contextKey);
      context.path = path;
      state.activeContextKey = contextKey;
    },

    getCurrentPathForContext(contextKey: string): (string | number)[] {
      return state.contexts.get(contextKey)?.path ?? [];
    },

    reset() {
      log.debug("⚠️ Resetting navigation state completely");
      state.activeContextKey = null;
      state.contexts.clear();
    },
  };
}

// ================================================================================================
// EXPORTED STORE INSTANCE
// ================================================================================================

export const navigationStore = createNavigationStore();

// For backward compatibility, you can also export individual functions
export const {
  setCurrentPathForContext,
  getCurrentPathForContext,
  reset: resetNavigationState,
} = navigationStore;
