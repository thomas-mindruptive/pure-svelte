<!-- src/routes/(browser)/+layout.svelte -->
<script lang="ts">
	import HierarchySidebar from '$lib/components/sidebarAndNav/HierarchySidebar.svelte';
	import { goto } from '$app/navigation';
	import { log } from '$lib/utils/logger';
	import Breadcrumb from '$lib/components/sidebarAndNav/Breadcrumb.svelte';
	import { attributeLoadingState } from '$lib/api/client/attribute.js';
	import { categoryLoadingState } from '$lib/api/client/category.js';
	import { offeringLoadingState } from '$lib/api/client/offering.js';
	import { productDefinitionLoadingState } from '$lib/api/client/productDefinition.js';
	import { supplierLoadingState } from '$lib/api/client/supplier.js';
	import { derived } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import type { HierarchyTree, HierarchyTreeNode } from '$lib/components/sidebarAndNav/HierarchySidebar.types.js';
    import { selectNode } from '$lib/stores/navigationState.js';

	let { data, children } = $props();

	const crumbItems = $derived(data.breadcrumbItems);
	const hierarchy = $derived(data.hierarchy);
	const activeLevel = $derived(data.activeLevel);

	// ===== LOADING INDICATOR  =====

	const isAnythingLoading = derived(
		[
			supplierLoadingState,
			categoryLoadingState,
			offeringLoadingState,
			attributeLoadingState,
			productDefinitionLoadingState
		],
		([
			$supplierLoading,
			$categoryLoading,
			$offeringLoading,
			$attributeLoading,
			$productDefLoading
		]) => {
			return (
				$supplierLoading ||
				$categoryLoading ||
				$offeringLoading ||
				$attributeLoading ||
				$productDefLoading
			);
		}
	);

	// ===== NAVIGATION (UPDATED FOR NEW HIERARCHY) =====
	
	/**
	 * Updated navigation handler for the new HierarchySidebar signature
	 * Now receives (tree, node) instead of just selectedItem
	 */
	function handleSidebarNavigation(tree: HierarchyTree, node: HierarchyTreeNode) {
		log.info(`(Layout) Sidebar navigation requested for tree: ${tree.name}, node: ${node.item.key}`);
		
		try {
			// NEW: Update NavigationState with the selected node
			// This handles context preservation automatically
			selectNode(node);
			
			// Navigate to the URL for this node (same logic as before)
			if (node.item && !node.item.disabled && node.item.href && node.item.href !== '#') {
				log.debug('Navigating to:', node.item.href);
				goto(node.item.href);
			} else {
				log.warn(`Navigation aborted for key: ${node.item.key}`, {
					node: node.item,
					tree: tree.name
				});
			}
		} catch (error) {
			log.error('Failed to handle sidebar navigation:', error);
		}
	}
</script>

<!----- TEMPLATE (UNVERÄNDERT) ----->

<div class="browser-layout">
	<aside class="sidebar">
		<HierarchySidebar
			{hierarchy}
			active={activeLevel}
			onselect={handleSidebarNavigation}
			shouldRenderHierarchyRootTitle = {false}
		/>
	</aside>

	<main class="main-content">
		<header class="main-header">
			<!-- Breadcrumbs -->
			<div class="breadcrumbs-wrapper">
				<Breadcrumb items={crumbItems} />
			</div>

			<!-- Spinner-->
			{#if $isAnythingLoading }
				<div class="loader-wrapper" transition:fade={{ duration: 150, delay: 200 }}>
					<div class="spinner"></div>
				</div>
			{/if}
		</header>

		<!-- Page content -->
		<div class="page-content-wrapper">
			{@render children()}
		</div>
	</main>
</div>

<style>
	/* --- LAYOUT-BASIS (Angepasst) --- */
	.browser-layout {
		display: grid;
		grid-template-columns: 280px 1fr;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
	}
	.sidebar {
		background: var(--pc-grid-header-bg, #f8fafc);
		border-right: 1px solid var(--pc-grid-border, #e2e8f0);
		overflow-y: auto;
	}

	/* --- SCROLLABLE MAIN --- */

	.main-content {
		display: grid;
		grid-template-rows: auto 1fr; /* Header: Höhe nach Bedarf, Inhalt: füllt den Rest */
		overflow: hidden; /* Verhindert doppelte Scrollbalken */
		background: #f8fafc;
	}

	/* --- HEADER --- */

	.main-header {
		display: flex;
		justify-content: flex-start; /* Breadcrumbs links, Spinner rechts */
		align-items: center; /* Vertikal zentrieren */
    gap: 2rem;
		padding: 0 1.5rem; /* Gleicher Abstand wie der Seiteninhalt */
		border-bottom: 1px solid var(--pc-grid-border, #e2e8f0);
		background-color: white;

		/* WICHTIG: Feste Mindesthöhe, um "Springen" zu verhindern, wenn der Spinner erscheint */
		min-height: 54px;
	}

	.breadcrumbs-wrapper {
		/* Dieser Wrapper sorgt dafür, dass die Breadcrumbs nicht unnötig schrumpfen */
		flex-grow: 0;
    min-width: 0;
    flex-shrink: 1;
	}

  /* ----- LOADING WRAPPER -----*/

	.loader-wrapper {
		/* Dieser Wrapper sorgt für eine korrekte Platzierung im Flex-Layout */
		flex-shrink: 0; /* Verhindert, dass der Spinner gequetscht wird */
    background-color:var(--color-primary);
    border-radius: 50%;
    padding: 5px;
	}

	.spinner {
		width: 1.5rem; 
		height: 1.5rem;
		border-radius: 50%;
		border: 4px solid var(--color-background);
		border-right-color: transparent;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* --- INHALTSBEREICH (NEU) --- */
	/* Dieser Container umschließt jetzt den <slot> und ist scrollbar */
	.page-content-wrapper {
		overflow-y: auto;
		padding: 1.5rem; /* Stellt sicher, dass der Inhalt Abstand zum Rand hat */
	}

	/* --- ALTE STYLES (ENTFERNT) --- */
	/* Die Klasse .global-loading-indicator wird nicht mehr benötigt und wurde entfernt. */
</style>