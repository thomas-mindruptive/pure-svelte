// File: src/lib/components/sidebarAndNav/buildBreadcrumb.ts

import type {
	RuntimeHierarchyTreeNode
} from './HierarchySidebar.types';
import { buildUrlFromNavigationPath } from './hierarchyUtils';
import { log } from '$lib/utils/logger';
import type { Crumb } from './breadcrumb.types';

// === TYPES ===

/** Defines the input for our main builder function for clarity and type safety. */
export type BuildBreadcrumbParams = {
	/** The definitive path of selected entities from the NavigationState. */
	navigationPath: RuntimeHierarchyTreeNode[];
	/** A map from `urlParamName` (e.g., "supplierId") to the loaded entity name. */
	entityNameMap: Map<string, string>;
	/** The node that is currently active in the UI. */
	activeNode: RuntimeHierarchyTreeNode | null;
};

// === HELPER FUNCTIONS ===

/**
 * Builds a fully explicit breadcrumb trail that shows both hierarchy levels and selected entities.
 *
 * @description
 * This function translates the application's navigation state into a user-friendly breadcrumb path.
 * The generated structure follows the explicit `Level / Entity / Level / Entity...` pattern.
 * It correctly identifies and marks the active crumb based on the provided `activeNode`.
 *
 * @param {BuildBreadcrumbParams} params - The necessary data to build the crumbs.
 * @returns {Crumb[]} An array of `Crumb` objects ready to be rendered by the `Breadcrumb.svelte` component.
 */
export function buildBreadcrumb({
	navigationPath,
	entityNameMap,
	activeNode
}: BuildBreadcrumbParams): Crumb[] {
	log.debug("Building breadcrumbs with path:", navigationPath.map(n => n.item.key), "and active node:", activeNode?.item.key);
	const crumbs: Crumb[] = [];

	// Stage 1: Build the explicit "Level / Entity" path
	for (let i = 0; i < navigationPath.length; i++) {
		const node = navigationPath[i];
		const paramName = node.item.urlParamName;
		const entityName = entityNameMap.get(paramName);
		const hrefForLevel = buildUrlFromNavigationPath(navigationPath.slice(0, i + 1));
		
		crumbs.push({
			label: node.item.label,
			href: hrefForLevel,
			node: node,
		});

		if (entityName) {
			crumbs.push({
				label: entityName,
				href: hrefForLevel,
				node: node,
			});
		}
	}

	// Stage 2: If the active node is a child of the path, append it
	if (activeNode && !navigationPath.includes(activeNode)) {
		crumbs.push({
			label: activeNode.item.label,
			node: activeNode,
		});
	}

	// Stage 3: CORRECTED LOGIC - Find and mark the active crumb using the activeNode.
	if (activeNode) {
		// Iterate backwards to find the last crumb that matches the active node.
		// This correctly handles cases where both a level ("Suppliers") and an entity ("Großhändler C")
		// share the same source node. The entity crumb will be found and marked first.
		for (let i = crumbs.length - 1; i >= 0; i--) {
			const crumb = crumbs[i];
			if (crumb.node === activeNode) {
				crumb.active = true;
				delete crumb.href;
				log.debug(`Marked crumb '${crumb.label}' as active because its node matches the activeNode.`);
				break; // Stop after finding the first match from the end.
			}
		}
	}

	log.debug("Final crumbs built:", crumbs);
	return crumbs;
}