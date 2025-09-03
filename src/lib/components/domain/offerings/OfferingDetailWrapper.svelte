<!-- src/lib/components/domain/offerings/OfferingDetailWrapper.svelte -->
<script lang="ts">
	import type {
		ProductDefinition,
		WholesalerItemOffering,
	} from "$lib/domain/types";
	import OfferingForm from "./OfferingForm.svelte";
	import type { Snippet } from "svelte";

	import "$lib/components/styles/detail-page-layout.css";
	import "$lib/components/styles/grid-section.css";
	import { log } from "$lib/utils/logger";
	import type {
		CancelledCallback,
		ChangedCallback,
		SubmitErrorCallback,
		SubmittedCallback,
	} from "$lib/components/forms/forms.types";
    import { addNotification } from "$lib/stores/notifications";

	const {
		offering,
		availableProducts,
		children,

		// Svelte 5 component-callback props
		onSubmitted,
		onSubmitError,
		onCancelled,
		onChanged,
	}: {
		offering: WholesalerItemOffering;
		availableProducts: ProductDefinition[];
		children: Snippet;

		onSubmitted?: SubmittedCallback;
		onSubmitError?: SubmitErrorCallback;
		onCancelled?: CancelledCallback;
		onChanged?: ChangedCallback;
	} = $props();

	// Silence "unused variable" warning for props passed directly to child components.
	// This is a deliberate signal to the compiler.
	void onSubmitted;
	void onSubmitError;
	void onCancelled;
	void onChanged;

	log.debug(`(OfferingDetailWrapper) Loaded props:`, {
		offering,
		availableProducts,
	});
	// ===== VALIDATE and show errors in UI =====

	let validationError = $state<string | null>(null);

	if (!offering && (!availableProducts || availableProducts.length === 0)) {
		const errorMessage =
			"Dev-error: 'offering' (edit-mode) or 'availableProducts' (for create-mode) must be passed. Both are missing.";

		// Setze die reaktive Fehlervariable.
		validationError = errorMessage;

		// Logge den Fehler zusätzlich laut in der Entwicklerkonsole.
		log.error(`[Component Contract Violation] ${errorMessage}`);
	}

	async function handleFormSubmitted() {
		log.info(`(OfferDetailAttributesPage) Form submitted successfully`);
		addNotification("Form submitted successfully.", "success");
	}

	async function handleSubmitError() {
		log.info(`(OfferDetailAttributesPage) Form submission error`);
		addNotification("Form submission error.", "error");
	}

	async function handleCancelled() {
		log.info(`(OfferDetailAttributesPage) Form submission cancelled`);
		addNotification("Form submission cancelled.", "info");
	}

	async function handleChanged() {
		log.info(`(OfferDetailAttributesPage) Form changed`);
	}
</script>

{#if validationError}
	<!-- Wenn ein Fehler aufgetreten ist, zeige NUR die Fehler-UI an. -->
	<div class="component-error-boundary">
		<h3>Komponenten-Fehler</h3>
		<p>
			Component cannot be displayed because it was called with invalid
			data.
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
				onSubmitted={handleFormSubmitted}
				onSubmitError={handleSubmitError}
				onCancelled={handleCancelled}
				onChanged={handleChanged}
			/>
		</div>

		<!-- Sektion 2: Der Slot für die spezifische untergeordnete Verwaltung -->
		{@render children()}
	</div>
{/if}
