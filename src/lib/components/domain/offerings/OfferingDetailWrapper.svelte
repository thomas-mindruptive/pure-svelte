<!-- src/lib/components/domain/offerings/OfferingDetailWrapper.svelte -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ProductDefinition, WholesalerItemOffering } from '$lib/domain/types';
	import OfferingForm from './OfferingForm.svelte';
	import type { Snippet } from 'svelte';

	import '$lib/components/styles/detail-page-layout.css';
	import '$lib/components/styles/grid-section.css';

	const {
		offering,
		availableProducts,
		children
	}: {
		offering: WholesalerItemOffering;
		availableProducts: ProductDefinition[];
		children: Snippet;
	} = $props();
</script>

<div class="detail-page-layout">
	<!-- Sektion 1: Das Formular zur Bearbeitung der Offering-Stammdaten -->
	<div class="grid-section">
		<OfferingForm
			initial={offering}
			supplierId={offering.wholesaler_id}
			categoryId={offering.category_id}
			{availableProducts}
			onSubmitted={() => invalidateAll()}
		/>
	</div>

	<!-- Sektion 2: Der Slot für die spezifische untergeordnete Verwaltung -->
	{@render children()}
</div>