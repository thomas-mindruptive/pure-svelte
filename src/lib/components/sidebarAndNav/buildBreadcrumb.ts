// File: src/lib/components/sidebarAndNav/buildBreadcrumb.ts

import type {
	RuntimeHierarchyTree,
	RuntimeHierarchyTreeNode
} from './HierarchySidebar.types';
import type { Crumb } from './Breadcrumb.svelte';
import { buildUrlFromNavigationPath } from './hierarchyUtils';

// === TYPES ===

/** Defines the input for our main builder function for clarity and type safety. */
export type BuildBreadcrumbParams = {
	/** The definitive path of selected entities from the NavigationState. */
	navigationPath: RuntimeHierarchyTreeNode[];
	/** A map from `urlParamName` (e.g., "supplierId") to the loaded entity name. */
	entityNameMap: Map<string, string>;
	/** The key of the level that is currently active in the UI. */
	activeLevelKey: string;
	/** The full hierarchy, needed to find labels for levels not in the navigationPath. */
	hierarchy: RuntimeHierarchyTree[];
};

// === HELPER FUNCTIONS ===

/**
 * Gets the display label for a given node in a fully dynamic way.
 * It prefers a specific entity name from the map, otherwise falls back to the generic label.
 *
 * @param node The node from the navigation path.
 * @param entityNameMap The map containing specific entity names.
 * @returns The appropriate display label as a string.
 */
function getCrumbLabel(
	node: RuntimeHierarchyTreeNode,
	entityNameMap: Map<string, string>
): string {
	const paramName = node.item.urlParamName;

	// Dynamically check if a specific name exists for this node's parameter.
	const specificName = entityNameMap.get(paramName);
	if (specificName) {
		return specificName;
	}

	// Fallback to the generic label (e.g., "Suppliers", "Categories").
	return node.item.label;
}

/**
 * Recursively searches through all provided hierarchy trees to find a node by its key.
 */
function findNodeByKeyInHierarchies(
	hierarchies: RuntimeHierarchyTree[],
	key: string
): RuntimeHierarchyTreeNode | null {
	for (const tree of hierarchies) {
		const found = findNodeInTree(tree.rootItem, key);
		if (found) return found;
	}
	return null;

	function findNodeInTree(
		node: RuntimeHierarchyTreeNode,
		keyToFind: string
	): RuntimeHierarchyTreeNode | null {
		if (node.item.key === keyToFind) return node;
		if (node.children) {
			for (const child of node.children) {
				const result = findNodeInTree(child, keyToFind);
				if (result) return result;
			}
		}
		return null;
	}
}

// === MAIN BREADCRUMB BUILDER ===

/**
 * Builds a fully dynamic breadcrumb trail based on the definitive navigation state.
 * This implementation is completely agnostic of the domain (no "suppliers", etc.).
 */
export function buildBreadcrumb({
	navigationPath,
	entityNameMap,
	activeLevelKey,
	hierarchy
}: BuildBreadcrumbParams): Crumb[] {
	const crumbs: Crumb[] = [];

	// --- Stage 1: Build the clickable "Context Path" ---
	for (let i = 0; i < navigationPath.length; i++) {
		const node = navigationPath[i];
		const pathForHref = navigationPath.slice(0, i + 1);
		crumbs.push({
			label: getCrumbLabel(node, entityNameMap),
			href: buildUrlFromNavigationPath(pathForHref)
		});
	}

	// --- Stage 2: Determine and adjust the "Active Page" ---
	const lastCrumb = crumbs.length > 0 ? crumbs[crumbs.length - 1] : null;
	const lastNodeInPath =
		navigationPath.length > 0 ? navigationPath[navigationPath.length - 1] : null;

	if (lastNodeInPath && lastNodeInPath.item.key === activeLevelKey) {
		// The active page is a list that is part of the context path.
		// Mark the last crumb as active.
		if (lastCrumb) {
			lastCrumb.active = true;
			delete lastCrumb.href;
		}
	} else {
		// The active page is a child of the context path.
		// Find its node to get the generic label and add it as the final crumb.
		const activeNode = findNodeByKeyInHierarchies(hierarchy, activeLevelKey);
		if (activeNode) {
			crumbs.push({
				label: activeNode.item.label, // Active lists always use the generic label
				active: true
			});
		}
	}

	return crumbs;
}