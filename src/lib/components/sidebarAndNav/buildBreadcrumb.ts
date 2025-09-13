// File: src/lib/components/sidebarAndNav/buildBreadcrumb.ts

import type { RuntimeHierarchyTreeNode } from './HierarchySidebar.types';
import { log } from '$lib/utils/logger';
import type { Crumb } from './breadcrumb.types';

export type BuildBreadcrumbParams = {
	navigationPath: RuntimeHierarchyTreeNode[];
	entityNameMap: Map<string, string>;
	activeNode: RuntimeHierarchyTreeNode;
};

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

	// The navigationPath can contain both visible list nodes and hidden object nodes.
	// The breadcrumb must render a representation for ALL of them.
	for (const node of navigationPath) {
		let label: string;

		if (node.item.type === 'object') {
			const paramName = node.item.urlParamName;
			const entityName = paramName ? entityNameMap.get(paramName) : undefined;
			label = entityName || node.item.label;
		} else {
			label = node.item.label;
		}

		// A breadcrumb item is considered "active" if its node corresponds to the
		// overall active view determined by the load function.
		const isActive = node === activeNode;

		crumbs.push({
			label: label,
			href: isActive ? undefined : node.item.href,
			node: node,
			active: isActive
		});
	}

	log.debug("Final crumbs built:", crumbs);
	return crumbs;
}