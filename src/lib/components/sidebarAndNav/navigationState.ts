// File: src/lib/components/sidebarAndNav/navigationState.ts

import { writable } from 'svelte/store';
import { log } from '$lib/utils/logger';
import type { RuntimeHierarchyTreeNode } from './HierarchySidebar.types';

// ================================================================================================
// NEW, PRIMITIVE-BASED STATE SHAPE
// ================================================================================================

/**
 * Represents the full navigation state for a single, independent hierarchy context
 * (e.g., for the "suppliers" tree). It contains only serializable, primitive data.
 */
export type NavigationContext = {
	/**
	 * The definitive, ordered path of navigation, composed of static string keys
	 * and dynamic numeric IDs. e.g., ['suppliers', 3, 'categories', 5]
	 */
	path: (string | number)[];

	/**
	 * The `key` of the node that the UI should highlight as the "active" view.
	 * This can differ from the last element of the path due to `defaultChild` logic
	 * or explicit user clicks.
	 */
	activeViewKey: string | null;

	/**
	 * A temporary holder for a full node object, used to signal an explicit
	 * UI navigation intent from a component to the `load` function.
	 * It is not part of the persistent, primitive state.
	 */
	activeViewNode: RuntimeHierarchyTreeNode | null;
};

/**
 * Defines the entire navigation state for the application. It manages multiple
 * independent contexts and tracks which one is currently active.
 */
export interface NavigationState {
	/**
	 * The key of the currently active context (e.g., "suppliers"). This corresponds
	 * to the `name` property of a `HierarchyTree`.
	 */
	activeContextKey: string | null;

	/**
	 * A map storing the independent `NavigationContext` for each hierarchy tree,
	 * keyed by the tree's unique name. This enables context preservation when
	 * switching between different navigation hierarchies.
	 */
	contexts: Map<string, NavigationContext>;
}

// ================================================================================================
// INITIAL STATE
// ================================================================================================

const initialState: NavigationState = {
	activeContextKey: null,
	contexts: new Map()
};

// ================================================================================================
// EXPORTED STORE
// ================================================================================================

export const navigationState = writable<NavigationState>(initialState);

// ================================================================================================
// CORE MUTATOR AND QUERY FUNCTIONS
// ================================================================================================

/**
 * Gets or creates a mutable navigation context for a given key.
 * This is a low-level helper to avoid boilerplate in mutator functions.
 * @param state The current navigation state.
 * @param contextKey The key for the context (e.g., "suppliers").
 * @returns A mutable NavigationContext object.
 */
function getOrCreateContext(
	state: NavigationState,
	contextKey: string
): NavigationContext {
	if (!state.contexts.has(contextKey)) {
		state.contexts.set(contextKey, {
			path: [],
			activeViewKey: null,
			activeViewNode: null
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
 * Sets the key of the UI element that should be actively highlighted.
 * This is called by the `load` function after `determineActiveNode`.
 * @param contextKey The key of the context to update.
 * @param key The item key of the node to set as active.
 */
export function setActiveViewKeyForContext(contextKey: string, key: string | null) {
	navigationState.update((state) => {
		log.debug(`Setting active view key for context '${contextKey}': '${key}'`);
		const context = getOrCreateContext(state, contextKey);
		context.activeViewKey = key;
		return state;
	});
}

/**
 * Explicitly sets the node for the upcoming active view.
 * This is called from the UI just before navigation to signal intent. This is a
 * temporary, transitional state that is consumed by the `load` function.
 * @param node The full node object that the user clicked.
 */
export function setActiveViewNode(
	node: RuntimeHierarchyTreeNode | null
) {
	navigationState.update((state) => {
		// This intent is stored on the currently active context.
		const contextKey = state.activeContextKey;
		if (contextKey) {
			log.debug(`Setting active view INTENT for context '${contextKey}': '${node?.item.key}'`);
			const context = getOrCreateContext(state, contextKey);
			context.activeViewNode = node;
		}
		return state;
	});
}

/**
 * Retrieves the current preserved path for a given context.
 * Used by the `load` function during reconciliation.
 * @param state The current navigation state.
 * @param contextKey The context to query.
 * @returns The preserved primitive path, or an empty array if none exists.
 */
export function getCurrentPathForContext(
	state: NavigationState,
	contextKey: string
): (string | number)[] {
	return state.contexts.get(contextKey)?.path ?? [];
}

/**
 * Resets the entire navigation state to its initial condition.
 */
export function resetNavigationState(): void {
	log.debug("⚠️ Resetting navigation state completely");
	navigationState.set(initialState);
}