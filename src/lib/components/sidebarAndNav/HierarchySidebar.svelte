<!-- File: src/lib/components/sidebarAndNav/HierarchySidebar.svelte -->

<script lang="ts">
	import '$lib/components/styles/sidebar.css';
	import { log } from '$lib/utils/logger';
	import type {
		RuntimeHierarchyTree,
		RuntimeHierarchyTreeNode,
		RuntimeHierarchyItem
	} from './HierarchySidebar.types';
	// Step 1: Import validation utilities
	import { validateTree } from '$lib/components/sidebarAndNav/hierarchyUtils';
	import ValidationWrapper from '$lib/components/validation/ValidationWrapper.svelte';
    import type { ValidationError } from '../validation/validation.types';

	// === TYPES ====================================================================================

	export type SelectCallback = (node: RuntimeHierarchyTreeNode) => void;

	type FlattenedItem = {      
		key: RuntimeHierarchyItem['key'];
		label: RuntimeHierarchyItem['label'];
		count?: RuntimeHierarchyItem['count'];
		disabled?: RuntimeHierarchyItem['disabled'];
		level: RuntimeHierarchyItem['level'];
		treeRef: RuntimeHierarchyTree;
		nodeRef: RuntimeHierarchyTreeNode;
		hasChildren: boolean;
	};

	export type HierarchySidebarProps = {
		hierarchy?: RuntimeHierarchyTree[];
		active?: RuntimeHierarchyTreeNode | null;
		ariaLabel?: string;
		onselect?: SelectCallback;
		shouldRenderHierarchyRootTitle: boolean;
	};

	// === PROPS ====================================================================================

	const {
		hierarchy = [] as RuntimeHierarchyTree[],
		active = null,
		ariaLabel = 'Navigation',
		onselect,
		shouldRenderHierarchyRootTitle
	}: HierarchySidebarProps = $props();

	// === UTILITY FUNCTIONS =======================================================================

function flattenTreeNode(
		node: RuntimeHierarchyTreeNode,
		tree: RuntimeHierarchyTree
	): FlattenedItem[] {
		const result: FlattenedItem[] = [];

		// ONLY add display == true nodes!
		if (node.item.display !== false) {
			result.push({
				key: node.item.key,
				label: node.item.label,
				count: node.item.count,
				disabled: node.item.disabled,
				level: node.item.level,
				treeRef: tree,
				nodeRef: node,
				hasChildren: Boolean(node.children && node.children.length > 0)
			});
		}

		// Always iterate children.
		if (node.children) {
			for (const childNode of node.children) {
				result.push(...flattenTreeNode(childNode, tree));
			}
		}
		return result;
	}

	function flattenHierarchy(runtimeHierarchy: RuntimeHierarchyTree[]): FlattenedItem[] {
		const result: FlattenedItem[] = [];
		for (const tree of runtimeHierarchy) {
			result.push(...flattenTreeNode(tree.rootItem, tree));
		}
		return result;
	}

	// === DERIVED STATE & VALIDATION ==============================================================

	const flattenedItems = $derived(flattenHierarchy(hierarchy));

	/**
	 * Validates the incoming hierarchy prop and transforms errors into the format
	 * expected by the ValidationWrapper component. Returns null if there are no errors.
	 */
	const validationErrors = $derived.by(() => {
		if (!hierarchy || hierarchy.length === 0) {
			return null;
		}

		const allErrors: ValidationError[] = [];

		for (const tree of hierarchy) {
			const result = validateTree(tree);
			if (!result.isValid) {
				// Transform the string errors into the structured error object
				for (const errorString of result.errors) {
					const parts = errorString.split(': ');
					if (parts.length === 2) {
						allErrors.push({
							path: parts[0].split('.'),
							message: parts[1]
						});
					} else {
						// Fallback for unexpected error format
						allErrors.push({
							path: ['Unknown'],
							message: errorString
						});
					}
				}
			}
		}

		if (allErrors.length > 0) {
			log.error(`Validation error: `, allErrors);
		}

		return allErrors.length > 0 ? allErrors : null;
	});

	// === EVENT HANDLERS ===========================================================================

	function handleSelect(node: RuntimeHierarchyTreeNode) {
		log.debug('Sidebar item selected', { nodeKey: node.item.key, href: node.item.href });
		try {
			onselect?.(node);
		} catch (error: unknown) {
			log.error('Selection callback in HierarchySidebar failed:', error);
		}
	}
</script>

<!-- TEMPLATE ==================================================================================== -->

<ValidationWrapper errors={validationErrors}>
	<nav class="hb" aria-label={ariaLabel}>
		{#each hierarchy as tree (tree.name)}
			<div class="hb__tree">
				{#if shouldRenderHierarchyRootTitle && tree.name}
					<h3 class="hb__root-title">{tree.name}</h3>
				{/if}

				<ul class="hb__list">
					{#each flattenedItems.filter((item) => item.treeRef === tree) as item (item.key)}
						<li class="hb__li">
							<button
								type="button"
								class="hb__item {active === item.nodeRef ? 'is-active' : ''}"
								disabled={!!item.disabled}
								aria-current={active === item.nodeRef ? 'page' : undefined}
								style="padding-left: {(item.level ?? 0) * 14}px"
								onclick={() => !item.disabled && handleSelect(item.nodeRef)}
							>
								<!-- {#if item.hasChildren}
									<span class="hb__expand-indicator" aria-hidden="true">▶</span>
								{:else}
									<span class="hb__expand-spacer" aria-hidden="true"></span>
								{/if} -->
								<span class="hb__label">{item.label}</span>
								{#if item.count != null}
									<span class="hb__count">{item.count}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
</ValidationWrapper>

<!-- STYLES ====================================================================================== -->

<style>
	.hb__item {
		display: flex;
		align-items: center;
		width: 100%;
		/* Rest of existing styles from sidebar.css remain the same */
	}

	.hb__label {
		flex: 1;
		text-align: left;
	}

	.hb__count {
		margin-left: auto;
		/* Existing count styles from sidebar.css */
	}
</style>