// File: src/routes/(browser)/+layout.ts

import { log } from "$lib/utils/logger";
import type { LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getCategoryApi } from "$lib/api/client/category";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb } from "$lib/components/sidebarAndNav/buildBreadcrumb";
import type { RuntimeHierarchyTree, RuntimeHierarchyTreeNode } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { setActiveTreePath, setActiveViewKey } from "$lib/components/sidebarAndNav/navigationState";
import * as ns from "$lib/components/sidebarAndNav/navigationState";
import { getAppHierarchies } from "./hierarchyConfig";
import {
  buildNavigationPath,
  convertToRuntimeTree,
  extractLeafFromUrl,
  parseUrlParameters,
  updateDisabledStates,
  updateRuntimeHierarchyParameters,
} from "$lib/components/sidebarAndNav/hierarchyUtils";
import { get } from "svelte/store";

// === CACHING ARCHITECTURE ======================================================================

const runtimeHierarchyCache = new Map<string, RuntimeHierarchyTree>();

function initializeAndCacheHierarchies(): RuntimeHierarchyTree[] {
  if (runtimeHierarchyCache.size > 0) {
    return Array.from(runtimeHierarchyCache.values());
  }
  log.debug("(Layout) Initializing and caching runtime hierarchies for the first time...");
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
	leaf: string | null,
    currentState: ns.NavigationState
): string {
	// Rule 1: An explicitly set view key from a sidebar click has the highest priority.
	const explicitViewKey = currentState.activeViewKey;
	if (explicitViewKey) {
		log.debug(`(Layout) Active level determined by EXPLICIT VIEW KEY: '${explicitViewKey}'`);
		// Consume the key so it's only used once.
		setActiveViewKey(null);
		return explicitViewKey;
	}

	// Rule 2: A leaf page is the next priority.
	if (leaf) {
		log.debug(`(Layout) Active level determined by LEAF: '${leaf}'`);
		return leaf;
	}

	// Rule 3: If an entity is selected, apply the defaultChild logic.
	if (navigationPath.length > 0) {
		const lastNodeInPath = navigationPath[navigationPath.length - 1];
		if (lastNodeInPath.item.urlParamValue !== 'leaf' && lastNodeInPath.defaultChild) {
			log.debug(`(Layout) Active level determined by DEFAULT CHILD: '${lastNodeInPath.defaultChild}'`);
			return lastNodeInPath.defaultChild;
		}
		if (lastNodeInPath) {
			log.debug(`(Layout) Active level determined by LAST PATH NODE: '${lastNodeInPath.item.key}'`);
			return lastNodeInPath.item.key;
		}
	}

	// Fallback: The root of the tree is active.
	log.debug(`(Layout) Active level determined by FALLBACK: '${tree.rootItem.item.key}'`);
	return tree.rootItem.item.key;
}

// === MAIN LOAD FUNCTION ========================================================================

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  log.info(`(Layout) Load function triggered for URL: ${url.pathname}`);
  depends(`url:${url.href}`);

  const currentNavState = get(ns.navigationState);
  // const activeTree = currentState.activeTree;
  log.debug("### Current navstate: ", currentNavState);

  // --- 1. Get or Initialize Hierarchy from Cache ---------------------------------------------
  const initialHierarchies = initializeAndCacheHierarchies();

  // --- 2. Reconciliate currentNavState and URL params.  --------------------------------------

  // --- 2.1 Get preserved context from store
  const preservedParams: Record<string, string | number> = {};
  if (currentNavState.activeTree) {
    currentNavState.activeTree.paths.forEach((node) => {
      if (node.item.urlParamValue !== "leaf") {
        preservedParams[node.item.urlParamName] = node.item.urlParamValue;
      }
    });
  }

  // --- Step 2.2: Get the primary parameters from the URL path. These have priority
  const pathParams = parseUrlParameters(initialHierarchies, params);

  // --- Step 2.3: Merge them. Path parameters from the URL override the preserved context.
  const urlParams = { ...preservedParams, ...pathParams };
  log.debug("Preserved context from store:", preservedParams);
  log.debug("Params from URL path:", pathParams);
  log.debug("FINAL merged params for this load:", urlParams);

  const leaf = extractLeafFromUrl(initialHierarchies, url.pathname);
  log.debug(`Extracted leaf page: ${leaf}`);

  // --- 3. Update Hierarchy with Current Context ----------------------------------------------
  let contextualHierarchy = updateRuntimeHierarchyParameters(initialHierarchies, urlParams);
  const supplierTree = contextualHierarchy.find((tree) => tree.name === "suppliers");
  if (!supplierTree) {
    throw new Error("Critical: 'suppliers' tree not found in hierarchy configuration.");
  }

  // --- 4. Build the Navigation Context Path --------------------------------------------------
  const navigationPath = buildNavigationPath(supplierTree, urlParams);
  log.debug(
    "(Layout) Built navigation path:",
    navigationPath.map((n) => n.item.key),
  );

  // --- 4.5 Update Disabled States ------------------------------------------------------------
  // After knowing the context path, update the entire tree to set which nodes
  // are clickable (enabled) or not (disabled).
  contextualHierarchy = contextualHierarchy.map((tree) => updateDisabledStates(tree, navigationPath));
  log.debug("(Layout) Updated disabled states for the hierarchy.");

  // --- 5. Synchronize with Central Navigation State ------------------------------------------
  if (navigationPath.length > 0) {
    setActiveTreePath(supplierTree, navigationPath);
  } else {
    setActiveTreePath(supplierTree, []);
  }
  log.debug(`(Layout) NavigationState store updated with path of length: ${navigationPath.length}`);

  // --- 6. Determine the Active UI Level ------------------------------------------------------
  const activeLevel = determineActiveLevel(navigationPath, supplierTree, leaf, currentNavState);

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
          if (s.name) entityNameMap.set("supplierId", s.name);
        })
        .catch(() => {}),
    );
  }
  if (urlParams.categoryId) {
    promises.push(
      getCategoryApi(client)
        .loadCategory(urlParams.categoryId)
        .then((c) => {
          if (c.name) entityNameMap.set("categoryId", c.name);
        })
        .catch(() => {}),
    );
  }
  if (urlParams.offeringId) {
    promises.push(
      getOfferingApi(client)
        .loadOffering(urlParams.offeringId)
        .then((o) => {
          if (o.product_def_title) entityNameMap.set("offeringId", o.product_def_title);
        })
        .catch(() => {}),
    );
  }
  await Promise.all(promises);
  log.debug("(Layout) Fetched entity names:", Object.fromEntries(entityNameMap));

  // --- 8. Build Breadcrumbs ------------------------------------------------------------------
  const breadcrumbItems = buildBreadcrumb({
    navigationPath: navigationPath,
    entityNameMap,
    activeLevelKey: activeLevel,
    hierarchy: contextualHierarchy,
  });

  // --- 9. Return Final Data Payload ----------------------------------------------------------
  return {
    hierarchy: contextualHierarchy,
    breadcrumbItems,
    activeLevel,
    entityNameMap,
    navigationPath,
    urlParams,
    leaf,
  };
}
