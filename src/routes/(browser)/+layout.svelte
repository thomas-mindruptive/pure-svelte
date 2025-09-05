<!-- src/routes/(browser)/+layout.svelte - REFACTORED FOR INLINE SPINNER -->
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
	import { fade } from 'svelte/transition'; // Import für die Animation

	let { data, children } = $props();

	const crumbItems = $derived(data.breadcrumbItems);
	const sidebarItems = $derived(data.sidebarItems);
	const activeLevel = $derived(data.activeLevel);

	// ===== LOADING INDICATOR (Unverändert) =====
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

	// ===== NAVIGATION (Unverändert) =====
	function handleSidebarNavigation(event: CustomEvent<{ key: string }>) {
		const selectedKey = event.detail.key;
		const selectedItem = sidebarItems.find((item) => item.key === selectedKey);
		log.info(`(Layout) Sidebar navigation requested for key: ${selectedKey}`);
		if (selectedItem && !selectedItem.disabled && selectedItem.href && selectedItem.href !== '#') {
			goto(selectedItem.href);
		} else {
			log.warn(`(Layout) Navigation aborted for key: ${selectedKey}`, {
				item: selectedItem
			});
		}
	}
</script>

<!----- TEMPLATE (Angepasst) ----->

<div class="browser-layout">
	<aside class="sidebar">
		<HierarchySidebar
			items={sidebarItems}
			active={activeLevel}
			onselect={handleSidebarNavigation}
		/>
	</aside>

	<main class="main-content">
		<!-- NEU: Ein <header> umschließt Breadcrumbs und Spinner -->
		<header class="main-header">
			<div class="breadcrumbs-wrapper">
				<Breadcrumb items={crumbItems} />
			</div>

			<!-- Der Lade-Spinner wird nur bei Bedarf eingeblendet -->
			{#if $isAnythingLoading }
				<div class="loader-wrapper" transition:fade={{ duration: 150, delay: 200 }}>
					<div class="spinner"></div>
				</div>
			{/if}
		</header>

		<!-- Der Seiteninhalt wird jetzt in einem eigenen scrollbaren Container gerendert -->
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