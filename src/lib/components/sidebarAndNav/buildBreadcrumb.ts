// File: src/lib/components/sidebarAndNav/buildBreadcrumb.ts

import type { RuntimeHierarchyTreeNode } from './HierarchySidebar.types';
import { log } from '$lib/utils/logger';
import type { Crumb } from './breadcrumb.types';

// === TYPES ===

/** Defines the input for our main builder function. */
export type BuildBreadcrumbParams = {
	/** The definitive path of selected entities from the NavigationState. */
	navigationPath: RuntimeHierarchyTreeNode[];
	/** A map from `urlParamName` (e.g., "supplierId") to the loaded entity name. */
	entityNameMap: Map<string, string>;
	/** The node that is currently active in the UI. */
	activeNode: RuntimeHierarchyTreeNode;
};

// === HELPER FUNCTIONS ===

/**
 * Builds a user-friendly breadcrumb trail from the application's navigation context path.
 *
 * @description
 * This function translates the `navigationPath`—which contains an explicit sequence of
 * List and Object nodes—into a final array of `Crumb` objects for the UI.
 *
 * It determines the label for each crumb dynamically:
 * - If a node in the path has a `urlParamName` and a corresponding entry in the
 *   `entityNameMap`, it uses the dynamic entity name (e.g., "Großhändler C").
 * - Otherwise, it falls back to the static `label` from the hierarchy configuration (e.g., "Suppliers").
 *
 * It also correctly marks the active crumb based on the provided `activeNode`.
 *
 * @param params - The necessary data to build the crumbs.
 * @returns An array of `Crumb` objects ready to be rendered by the `Breadcrumb.svelte` component.
 */
export function buildBreadcrumb({
	navigationPath,
	entityNameMap,
	activeNode
}: BuildBreadcrumbParams): Crumb[] {
	log.debug(`Building crumbs with path of length ${navigationPath.length}`, {
		pathKeys: navigationPath.map((n) => n.item.key),
		activeNodeKey: activeNode?.item.key
	});

	const crumbs: Crumb[] = [];

	for (const node of navigationPath) {
		// Skip hidden nodes from the breadcrumb trail.
		if (node.item.display === false) {
			continue;
		}

		let label: string;
		const paramName = node.item.urlParamName;
		const entityName = paramName ? entityNameMap.get(paramName) : undefined;

		// Use the dynamic entity name if available, otherwise use the static label.
		if (entityName) {
			label = entityName;
		} else {
			label = node.item.label;
		}

		// The active node is the one the user is currently viewing. It should not be a link.
		const isActive = node === activeNode;

		crumbs.push({
			label: label,
			// The href is now taken directly from the node's configuration.
			// It should be undefined for the active node to prevent it from being a link.
			href: isActive ? undefined : node.item.href,
			node: node,
			active: isActive
		});
	}

	log.debug("Final crumbs built:", crumbs);
	return crumbs;
}