// File: src/routes/(browser)/+layout.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { ApiClient } from '$lib/api/client/ApiClient';
import { getSupplierApi } from '$lib/api/client/supplier';
import { getCategoryApi } from '$lib/api/client/category';
import { getOfferingApi } from '$lib/api/client/offering';
import { buildBreadcrumb } from '$lib/components/sidebarAndNav/buildBreadcrumb';
import type {
	RuntimeHierarchyTree,
	RuntimeHierarchyTreeNode
} from '$lib/components/sidebarAndNav/HierarchySidebar.types';
import type { NavigationState } from '$lib/components/sidebarAndNav/navigationState';
import {
	navigationState,
	setActiveViewNode,
	getCurrentPathForContext,
	setCurrentPathForContext,
	setActiveViewKeyForContext
} from '$lib/components/sidebarAndNav/navigationState';
import { getAppHierarchies } from './navHierarchyConfig';
import {
	convertToRuntimeTree,
	findNodeByKeyInHierarchies,
	updateDisabledStates,
	getPrimitivePathFromUrl,
	reconcilePaths,
	findNodesForPath
} from '$lib/components/sidebarAndNav/hierarchyUtils';

// ================================================================================================
// CACHING & INITIALIZATION
// ================================================================================================

const runtimeHierarchyCache = new Map<string, RuntimeHierarchyTree>();

function initializeAndCacheHierarchies(): RuntimeHierarchyTree[] {
	if (runtimeHierarchyCache.size > 0) {
		return Array.from(runtimeHierarchyCache.values());
	}
	log.debug('Initializing and caching runtime hierarchies for the first time...');
	const staticHierarchies = getAppHierarchies();
	const initialRuntimeHierarchies: RuntimeHierarchyTree[] = [];
	for (const staticTree of staticHierarchies) {
		const runtimeTree = convertToRuntimeTree(staticTree);
		initialRuntimeHierarchies.push(runtimeTree);
		runtimeHierarchyCache.set(runtimeTree.name, runtimeTree);
	}
	return initialRuntimeHierarchies;
}

// ================================================================================================
// HELPER FUNCTIONS for the load function
// ================================================================================================

/**
 * Finds the appropriate hierarchy tree that corresponds to the current URL's context.
 * The context is determined by the first segment of the URL path.
 *
 * @param allHierarchies All available runtime hierarchies.
 * @param url The current URL object from the SvelteKit load event.
 * @returns The matching RuntimeHierarchyTree for the current context.
 */
function findTreeForUrl(
	allHierarchies: RuntimeHierarchyTree[],
	url: URL
): RuntimeHierarchyTree {
	const firstPathSegment = url.pathname.split('/')[1] || '';

	let activeTree: RuntimeHierarchyTree | undefined;

	if (firstPathSegment === '') {
		// The root path '/' defaults to the 'suppliers' tree or the first available one as a fallback.
		activeTree = allHierarchies.find((tree) => tree.name === 'suppliers') || allHierarchies[0];
	} else {
		// Find the tree whose root item's key matches the first URL segment.
		activeTree = allHierarchies.find((tree) => tree.rootItem.item.key === firstPathSegment);
	}

	if (!activeTree) {
		// This is a critical error indicating a URL for which no navigation is configured.
		throw error(404, `Page not found: No hierarchy tree configured for path segment '${firstPathSegment}'.`);
	}
	log.debug(`Active tree for URL '${url.pathname}' is '${activeTree.name}'.`);
	return activeTree;
}

/**
 * Determines the specific `RuntimeHierarchyTreeNode` that should be highlighted as 'active' in the UI.
 *
 * @description
 * This function is the central logic for translating the application's navigation
 * state into a specific, active UI element. It resolves the active node based on a
 * strict priority order to create an intuitive user experience.
 *
 * The priority is as follows:
 * 1. **Explicit User Intent:** An explicit selection from the UI (e.g., a sidebar click).
 * 2. **Direct Leaf Match:** A static path segment at the end of the URL (e.g., "/attributes").
 * 3. **Default Child:** The configured `defaultChild` of the last entity in the context path.
 * 4. **Fallback:** The deepest node in the current navigation context path.
 *
 * @param nodesOnPath The rich node path representing the current navigation context.
 * @param url The current URL object from the SvelteKit load event.
 * @param contextKey The key of the currently active navigation context (e.g., "suppliers").
 * @param navState The full, current `NavigationState` from the Svelte store.
 * @param allHierarchies All available runtime hierarchies, for finding nodes by key.
 * @returns The `RuntimeHierarchyTreeNode` to be highlighted.
 */
function determineActiveNode(
	nodesOnPath: RuntimeHierarchyTreeNode[],
	url: URL,
	contextKey: string,
	navState: NavigationState,
	allHierarchies: RuntimeHierarchyTree[]
): RuntimeHierarchyTreeNode {
	log.debug(`Determining active node for context '${contextKey}'...`);

	// --- Priority 1: Explicit User Intent ---
	const currentContext = navState.contexts.get(contextKey);
	const explicitViewNode = currentContext?.activeViewNode;
	if (explicitViewNode) {
		log.info(`Active node determined by EXPLICIT USER INTENT: '${explicitViewNode.item.key}'`);
		return explicitViewNode;
	}

	const lastNodeInPath = nodesOnPath.length > 0 ? nodesOnPath[nodesOnPath.length - 1] : null;

	if (!lastNodeInPath) {
		const fallbackRoot = allHierarchies[0]?.rootItem;
		if (!fallbackRoot) throw error(500, 'No hierarchies configured.');
		return fallbackRoot;
	}

	// --- Priority 2: Direct Leaf Match ---
	const pathSegments = url.pathname.split('/').filter(Boolean);
	const lastUrlSegment = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null;
	if (lastUrlSegment && lastNodeInPath.children) {
		const matchingChild = lastNodeInPath.children.find(
			(child) => child.item.key === lastUrlSegment
		);
		if (matchingChild) {
			log.info(`Active node determined by DIRECT LEAF MATCH: '${matchingChild.item.key}'`);
			return matchingChild;
		}
	}

	// --- Priority 3: Default Child ---
	if (lastNodeInPath.defaultChild) {
		const childNodeKey = lastNodeInPath.defaultChild;
		const childNode = findNodeByKeyInHierarchies(allHierarchies, childNodeKey);
		if (childNode) {
			log.info(`Active node determined by DEFAULT CHILD: '${childNode.item.key}'`);
			return childNode;
		} else {
			log.warn(`Configuration error: defaultChild '${childNodeKey}' not found.`);
		}
	}

	// --- Priority 4: Fallback ---
	log.info(`Active node determined by FALLBACK (last node in path): '${lastNodeInPath.item.key}'`);
	return lastNodeInPath;
}

// ================================================================================================
// FINAL `load` FUNCTION
// ================================================================================================

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
	log.info(`Load function triggered for URL: ${url.pathname}`);
	depends(`url:${url.href}`);

	// --- Setup ---
	const currentNavState = get(navigationState);
	const allHierarchies = initializeAndCacheHierarchies();
	let nodesOnPath: RuntimeHierarchyTreeNode[];

	// --- Phase 1: Reconciliation ---
	const activeTree = findTreeForUrl(allHierarchies, url);
	const currentContextKey = activeTree.name;
	const urlPrimitivePath = getPrimitivePathFromUrl(url);
	const preservedPrimitivePath = getCurrentPathForContext(currentNavState, currentContextKey);
	const definitivePrimitivePath = reconcilePaths(urlPrimitivePath, preservedPrimitivePath);

	// --- Phase 2: State Update & Data Preparation ---
	setCurrentPathForContext(currentContextKey, definitivePrimitivePath);
	try {
		// Translate the definitive primitive path into rich node objects. This also validates the path.
		nodesOnPath = findNodesForPath(activeTree, definitivePrimitivePath);
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'An unknown error occurred';
		log.error(`Path validation failed, rendering 404. Reason: ${message}`);
		throw error(404, 'Page not found');
	}

	// Inject the actual runtime IDs from SvelteKit's params into our rich nodes.
	// The `findNodesForPath` validates the *structure*, and this step injects the *data*.
	const indexedParams = params as Record<string, string>;
	nodesOnPath.forEach((node) => {
		if (node.item.urlParamName && indexedParams[node.item.urlParamName]) {
			const paramValue = indexedParams[node.item.urlParamName];
			const numericValue = Number(paramValue);
			node.item.urlParamValue = isNaN(numericValue) ? paramValue : numericValue;
		}
	});

	// --- Phase 3: UI State Update ---
	updateDisabledStates(activeTree, nodesOnPath);

	const activeNode = determineActiveNode(
		nodesOnPath,
		url,
		currentContextKey,
		currentNavState,
		allHierarchies
	);

	// Update the active view key in the state for the UI to consume.
	setActiveViewKeyForContext(currentContextKey, activeNode.item.key);

	// Consume the user's explicit navigation intent so it's only used once.
	if (currentNavState.contexts.get(currentContextKey)?.activeViewNode) {
		setActiveViewNode(null);
	}

	// Fetch dynamic entity names for breadcrumbs.
	const client = new ApiClient(loadEventFetch);
	const entityNameMap = new Map<string, string>();
	const promises = [];
	for (const node of nodesOnPath) {
		if (node.item.type === 'object' && node.item.urlParamName) {
			const paramName = node.item.urlParamName;
			const entityId = node.item.urlParamValue;

			if (entityId && typeof entityId === 'number') {
				if (paramName === 'supplierId') {
					promises.push(
						getSupplierApi(client)
							.loadSupplier(entityId)
							.then((s) => {
								if (s.name) entityNameMap.set('supplierId', s.name);
							})
							.catch(() => {})
					);
				} else if (paramName === 'categoryId') {
					promises.push(
						getCategoryApi(client)
							.loadCategory(entityId)
							.then((c) => {
								if (c.name) entityNameMap.set('categoryId', c.name);
							})
							.catch(() => {})
					);
				} else if (paramName === 'offeringId') {
					promises.push(
						getOfferingApi(client)
							.loadOffering(entityId)
							.then((o) => {
								if (o.product_def_title) entityNameMap.set('offeringId', o.product_def_title);
							})
							.catch(() => {})
					);
				}
			}
		}
	}
	await Promise.all(promises);
	log.debug('Fetched entity names:', Object.fromEntries(entityNameMap));

	// Build breadcrumbs using the rich node path.
	const breadcrumbItems = buildBreadcrumb({
		navigationPath: nodesOnPath,
		entityNameMap,
		activeNode
	});

	// --- Return Final Data ---
	return {
		hierarchy: allHierarchies,
		breadcrumbItems,
		activeNode,
		urlParams: params // Pass SvelteKit's raw params for resolveHref
	};
}