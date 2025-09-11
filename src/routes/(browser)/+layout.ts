// File: src/routes/(browser)/+layout.ts

import { log } from '$lib/utils/logger';
import type { LoadEvent } from '@sveltejs/kit';
import { ApiClient } from '$lib/api/client/ApiClient';
import { getSupplierApi } from '$lib/api/client/supplier';
import { getCategoryApi } from '$lib/api/client/category';
import { getOfferingApi } from '$lib/api/client/offering';
import { buildBreadcrumb } from '$lib/components/sidebarAndNav/buildBreadcrumb';
import type {
	RuntimeHierarchyTree,
	RuntimeHierarchyTreeNode
} from '$lib/components/sidebarAndNav/HierarchySidebar.types';
import { setActiveTreePath } from '$lib/components/sidebarAndNav/navigationState';
import { getAppHierarchies } from './hierarchyConfig';
import {
	buildNavigationPath,
	convertToRuntimeTree,
	extractLeafFromUrl,
	parseUrlParameters,
	updateRuntimeHierarchyParameters
} from '$lib/components/sidebarAndNav/hierarchyUtils';

// === CACHING ARCHITECTURE ======================================================================

const runtimeHierarchyCache = new Map<string, RuntimeHierarchyTree>();

function initializeAndCacheHierarchies(): RuntimeHierarchyTree[] {
	if (runtimeHierarchyCache.size > 0) {
		return Array.from(runtimeHierarchyCache.values());
	}
	log.debug('(Layout) Initializing and caching runtime hierarchies for the first time...');
	const staticHierarchies = getAppHierarchies();
	const initialRuntimeHierarchies: RuntimeHierarchyTree[] = [];
	for (const staticTree of staticHierarchies) {
		const runtimeTree = convertToRuntimeTree(staticTree);
		initialRuntimeHierarchies.push(runtimeTree);
		runtimeHierarchyCache.set(runtimeTree.name, runtimeTree);
	}
	return initialRuntimeHierarchies;
}

// === HIERARCHY UTILITIES =======================================================================

/**
 * Determines the key of the active level for sidebar highlighting, correctly
 * implementing the `defaultChild` strategy from the navigation readme.
 *
 * @param navigationPath The current path of resolved entities.
 * @param tree The hierarchy tree being navigated.
 * @param leaf The key of a leaf page if one is active, otherwise null.
 * @returns The string key of the active level.
 */
function determineActiveLevel(
	navigationPath: RuntimeHierarchyTreeNode[],
	tree: RuntimeHierarchyTree,
	leaf: string | null
): string {
	// Rule 1: A leaf page always has the highest priority and is the active level.
	if (leaf) {
		log.debug(`(Layout) Active level is leaf: '${leaf}'`);
		return leaf;
	}

	// Rule 2: If a user has selected an entity, determine the next logical step.
	if (navigationPath.length > 0) {
		const lastNodeInPath = navigationPath[navigationPath.length - 1];

		// Use the configured `defaultChild` if it exists.
		if (lastNodeInPath.defaultChild) {
			log.debug(
				`(Layout) Active level is defaultChild '${lastNodeInPath.defaultChild}' of node '${lastNodeInPath.item.key}'`
			);
			return lastNodeInPath.defaultChild;
		}

		// Fallback: If no `defaultChild` is defined, the entity's own level is active.
		log.debug(
			`(Layout) Active level is last path node '${lastNodeInPath.item.key}' (no defaultChild)`
		);
		return lastNodeInPath.item.key;
	}

	// Rule 3: If there is no navigation path, the root of the tree is active.
	log.debug(`(Layout) Active level is tree root '${tree.rootItem.item.key}'`);
	return tree.rootItem.item.key;
}

// === MAIN LOAD FUNCTION ========================================================================

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
	log.info(`(Layout) Load function triggered for URL: ${url.pathname}`);
	depends(`url:${url.href}`);

	// --- 1. Get or Initialize Hierarchy from Cache ---------------------------------------------
	const initialHierarchies = initializeAndCacheHierarchies();

	// --- 2. Parse URL for Parameters and Leaf --------------------------------------------------
	const urlParams = parseUrlParameters(initialHierarchies, params);
	const leaf = extractLeafFromUrl(initialHierarchies, url.pathname);
	log.debug('(Layout) Parsed URL parameters:', urlParams);
	log.debug(`(Layout) Extracted leaf page: ${leaf}`);

	// --- 3. Update Hierarchy with Current Context ----------------------------------------------
	const contextualHierarchy = updateRuntimeHierarchyParameters(initialHierarchies, urlParams);
	const supplierTree = contextualHierarchy.find((tree) => tree.name === 'suppliers');
	if (!supplierTree) {
		throw new Error("Critical: 'suppliers' tree not found in hierarchy configuration.");
	}

	// --- 4. Build the Navigation Context Path --------------------------------------------------
	const navigationPath = buildNavigationPath(supplierTree, urlParams);
	log.debug('(Layout) Built navigation path:', navigationPath.map((n) => n.item.key));

	// --- 5. Synchronize with Central Navigation State ------------------------------------------
	if (navigationPath.length > 0) {
		setActiveTreePath(supplierTree, navigationPath as RuntimeHierarchyTreeNode[]);
	} else {
        // Ensure that if the path is empty, the state is also cleared for the active tree.
        setActiveTreePath(supplierTree, []);
    }
	log.debug(`(Layout) NavigationState store updated with path of length: ${navigationPath.length}`);

	// --- 6. Determine the Active UI Level ------------------------------------------------------
	const activeLevel = determineActiveLevel(
		navigationPath as RuntimeHierarchyTreeNode[],
		supplierTree,
		leaf
	);
	log.debug(`(Layout) Determined final active UI level key: '${activeLevel}'`);

	// --- 7. Fetch Dynamic Entity Names for Display ---------------------------------------------
	const client = new ApiClient(loadEventFetch);
	const entityNameMap = new Map<string, string>();
	const promises = [];
	if (urlParams.supplierId) {
		promises.push(
			getSupplierApi(client)
				.loadSupplier(urlParams.supplierId)
				.then((s) => {
					if (s.name) entityNameMap.set('supplierId', s.name);
				})
				.catch(() => {})
		);
	}
	if (urlParams.categoryId) {
		promises.push(
			getCategoryApi(client)
				.loadCategory(urlParams.categoryId)
				.then((c) => {
					if (c.name) entityNameMap.set('categoryId', c.name);
				})
				.catch(() => {})
		);
	}
	if (urlParams.offeringId) {
		promises.push(
			getOfferingApi(client)
				.loadOffering(urlParams.offeringId)
				.then((o) => {
					if (o.product_def_title) entityNameMap.set('offeringId', o.product_def_title);
				})
				.catch(() => {})
		);
	}
	await Promise.all(promises);
	log.debug('(Layout) Fetched entity names:', Object.fromEntries(entityNameMap));

	// --- 8. Build Breadcrumbs ------------------------------------------------------------------
	const breadcrumbItems = buildBreadcrumb({
		navigationPath: navigationPath as RuntimeHierarchyTreeNode[],
		entityNameMap,
		activeLevelKey: activeLevel,
		hierarchy: contextualHierarchy
	});

	// --- 9. Return Final Data Payload ----------------------------------------------------------
	return {
		hierarchy: contextualHierarchy,
		breadcrumbItems,
		activeLevel,
		entityNameMap,
		navigationPath,
		urlParams,
		leaf
	};
}