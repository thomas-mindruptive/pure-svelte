<!-- src/lib/components/domain/offerings/OfferingDetailWrapper.svelte -->
<script lang="ts">
	import type {
		ProductDefinition,
		WholesalerItemOffering_ProductDef_Category,
	} from "$lib/domain/domainTypes";

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
	import OfferingForm from "./OfferingForm.svelte";
	import type {
		OfferingDetailAttributes_LoadData,
		OfferingDetailLinks_LoadData,
	} from "$lib/pages/offerings/offeringDetail.types";

	const {
		initialLoadedData,
		availableProducts,
		children,

		// Svelte 5 component-callback props
		onSubmitted,
		onSubmitError,
		onCancelled,
		onChanged,
	}: {
		initialLoadedData:
			| OfferingDetailLinks_LoadData
			| OfferingDetailAttributes_LoadData;
		availableProducts: ProductDefinition[] | null | undefined;
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

	log.debug(`(OfferingDetailWrapper) Loaded props:`, { initialLoadedData });

	// ===== VALIDATE and show errors in UI =====

	async function handleFormSubmitted(p: {
		data: WholesalerItemOffering_ProductDef_Category;
		result: unknown;
	}): Promise<void> {
		log.info(`(OfferDetailAttributesPage) Form submitted successfully`, p);
		addNotification("Form submitted successfully.", "success");
	}

	async function handleSubmitError(p: {
		data: WholesalerItemOffering_ProductDef_Category;
		reason?: string;
	}): Promise<void> {
		log.info(`(OfferDetailAttributesPage) Form submission error`, p);
		addNotification("Form submission error.", "error");
	}

	async function handleCancelled(p: {
		data: WholesalerItemOffering_ProductDef_Category;
		reason?: string;
	}): Promise<void> {
		log.info(`(OfferDetailAttributesPage) Form submission cancelled`, p);
		addNotification("Form submission cancelled.", "info");
	}

	async function handleChanged(info: {
		data: WholesalerItemOffering_ProductDef_Category;
		dirty: boolean;
	}): Promise<void> {
		log.info(`(OfferDetailAttributesPage) Form changed`, info);
	}
</script>

<div class="detail-page-layout">
	<!-- Sektion 1: Das Formular zur Bearbeitung der Offering-Stammdaten -->
	<div class="grid-section">
		{#if false}
			NOTE: offering can be null in "create" mode.
		{/if}
		<OfferingForm
			{initialLoadedData}
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
