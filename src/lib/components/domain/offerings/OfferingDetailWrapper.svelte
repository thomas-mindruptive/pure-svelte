<!-- src/lib/components/domain/offerings/OfferingDetailWrapper.svelte -->
<script lang="ts">
	import type {
		WholesalerItemOffering_ProductDef_Category_Supplier,
	} from "$lib/domain/domainTypes";

	import type { Snippet } from "svelte";

	import "$lib/components/styles/detail-page-layout.css";
	import "$lib/components/styles/grid-section.css";
	import { log } from "$lib/utils/logger";
	import { addNotification } from "$lib/stores/notifications";
	import OfferingForm from "./OfferingForm.svelte";
	import type {
		OfferingDetailAttributes_LoadData,
		OfferingDetailLinks_LoadData,
	} from "$lib/components/domain/offerings/offeringDetail.types";
	import { assertDefined } from "$lib/utils/validation/assertions";
	import { goto } from "$app/navigation";

	// ===== PROPS =====

	type OfferingDetailWrapperProps = {
		initialLoadedData:
			| OfferingDetailLinks_LoadData
			| OfferingDetailAttributes_LoadData;
		children: Snippet;
		// We do not expose the "on" handlers because we handle them themselves, not the page!
		// onSubmitted?: SubmittedCallback;
		// onSubmitError?: SubmitErrorCallback;
		// onCancelled?: CancelledCallback;
		// onChanged?: ChangedCallback;
	};

	const {
		initialLoadedData,
		children,
	}: OfferingDetailWrapperProps = $props();

	log.debug(`(OfferingDetailWrapper) Loaded props:`, { initialLoadedData });

	// ===== STATE =====

	const isCreateMode = $derived(!initialLoadedData?.offering);

	// ===== EVENT HANDLERS =====

	async function handleFormSubmitted(p: {
		data: WholesalerItemOffering_ProductDef_Category_Supplier;
		result: unknown;
	}): Promise<void> {
		assertDefined(p, "OfferingFormDetailWrapper.handleFormSubmitted");
		log.info(`Form submitted successfully`, p);
		addNotification("Offering updated successfully.", "success");
		if (isCreateMode) {
			// 1. Benötigte IDs extrahieren
			const newOffering = p.data; //
			const newOfferingId = newOffering?.offering_id;
			const { supplierId, categoryId } = initialLoadedData;

			// Defensive: Ensure ids.
			if (newOfferingId && supplierId && categoryId) {
				const newUrl = `/suppliers/${supplierId}/categories/${categoryId}/offerings/${newOfferingId}`;
				await goto(newUrl, { invalidateAll: true });
			} else {
				log.error("Could not redirect after create: Missing IDs.", {
					newOfferingId,
					supplierId,
					categoryId,
				});
				addNotification("Could not redirect to edit page.", "error");
			}
		}
		else {
			log.info(`Form submitted in EDIT mode. No navigation needed.`, p);
		}
	}

	async function handleSubmitError(p: {
		data: WholesalerItemOffering_ProductDef_Category_Supplier;
		reason?: string;
	}): Promise<void> {
		assertDefined(p, "OfferingFormDetailWrapper.handleSubmitError");
		log.info(`Form submission error`, p);
		addNotification("Form submission error.", "error");
	}

	async function handleCancelled(p: {
		data: WholesalerItemOffering_ProductDef_Category_Supplier;
		reason?: string;
	}): Promise<void> {
		assertDefined(p, "OfferingFormDetailWrapper.handleCancelled");
		log.info(`Form submission cancelled`, p);
		addNotification("Form submission cancelled.", "info");
	}

	async function handleChanged(info: {
		data: WholesalerItemOffering_ProductDef_Category_Supplier;
		dirty: boolean;
	}): Promise<void> {
		assertDefined(info, "OfferingFormDetailWrapper.handleChanged");
		log.info(`Form changed`, info);
	}
</script>

<!----- TEMPLATE ----->

<div class="detail-page-layout">
	<!-- Sektion 1: Das Formular zur Bearbeitung der Offering-Stammdaten -->
	<div class="grid-section">
		{#if false}
			NOTE: offering/initialLoadedData can be null in "create" mode.
		{/if}
		<OfferingForm
			{initialLoadedData}
			onSubmitted={handleFormSubmitted}
			onSubmitError={handleSubmitError}
			onCancelled={handleCancelled}
			onChanged={handleChanged}
		/>
	</div>

	<!-- Sektion 2: Der Slot für die spezifische untergeordnete Verwaltung -->
	{@render children()}
</div>
