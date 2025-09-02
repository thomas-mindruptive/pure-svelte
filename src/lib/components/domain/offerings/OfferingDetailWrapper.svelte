<!-- src/lib/components/domain/offerings/OfferingDetailWrapper.svelte -->
<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import type {
		ProductDefinition,
		WholesalerItemOffering,
	} from "$lib/domain/types";
	import OfferingForm from "./OfferingForm.svelte";
	import type { Snippet } from "svelte";

	import "$lib/components/styles/detail-page-layout.css";
	import "$lib/components/styles/grid-section.css";

	const {
		offering,
		availableProducts,
		children,
	}: {
		offering: WholesalerItemOffering;
		availableProducts: ProductDefinition[];
		children: Snippet;
	} = $props();

	// ===== VALIDATE and show errors in UI =====

	let validationError = $state<string | null>(null);

	if (offering && (!availableProducts || availableProducts.length === 0)) {
		const errorMessage =
			"Dev-error: 'offering' (edit-mode) or 'availableProducts' (for create-mode) must be passed. Both are missing.";

		// Setze die reaktive Fehlervariable.
		validationError = errorMessage;

		// Logge den Fehler zusätzlich laut in der Entwicklerkonsole.
		console.error(`[Component Contract Violation] ${errorMessage}`);
	}
</script>

{#if validationError}
	<!-- Wenn ein Fehler aufgetreten ist, zeige NUR die Fehler-UI an. -->
	<div class="component-error-boundary">
		<h3>Komponenten-Fehler</h3>
		<p>
			Component cannot be displayed because it was called with invalid data.
		</p>
		<!-- Diese detaillierte Meldung ist super für die Entwicklung -->
		<pre>{validationError}</pre>
	</div>
{:else}
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
{/if}
