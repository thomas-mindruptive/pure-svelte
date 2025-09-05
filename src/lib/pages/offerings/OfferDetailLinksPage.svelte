<!-- src/lib/pages/offerings/OfferDetailLinksPage.svelte -->
<script lang="ts">
	import { addNotification } from '$lib/stores/notifications';
	import { invalidateAll } from '$app/navigation';
	import LinkGrid from '$lib/components/links/LinkGrid.svelte';
	import { getOfferingApi, offeringLoadingState } from '$lib/api/client/offering';
	import type { WholesalerOfferingLink } from '$lib/domain/domainTypes';
	import { ApiClient } from '$lib/api/client/ApiClient';
	import '$lib/components/styles/assignment-section.css';
	import '$lib/components/styles/grid-section.css';
	import '$lib/components/styles/detail-page-layout.css';
	import '$lib/components/styles/form-elements.css';
	import OfferingDetailWrapper from '$lib/components/domain/offerings/OfferingDetailWrapper.svelte';
	import type { ID, DeleteStrategy, RowActionStrategy } from '$lib/components/grids/Datagrid.types';
	import {
		OfferingDetailLinks_LoadDataSchema,
		type OfferingDetailLinks_LoadData,
		type OfferingDetailLinks_LoadDataAsync
	} from './offeringDetail.types';
	import { log } from '$lib/utils/logger';
	import { assertDefined } from '$lib/utils/validation/assertions';

	// --- PROPS ---
	let { data } = $props<{ data: OfferingDetailLinks_LoadDataAsync }>();

	// --- LOKALER, REAKTIVER ZUSTAND ---
	let resolvedData = $state<OfferingDetailLinks_LoadData | null>(null);
	let isLoading = $state(true);
	let loadingError = $state<{ message: string; status?: number } | null>(null);

	// --- DATENVERARBEITUNG mit $effect ---
	$effect(() => {
		let aborted = false;
		const processPromises = async () => {
			isLoading = true;
			loadingError = null;
			resolvedData = null;

			try {
				const [offering, links, availableProducts] = await Promise.all([
					data.offering,
					data.links,
					data.availableProducts
				]);

				if (aborted) return;

				const dataToValidate = {
					supplierId: data.supplierId,
					categoryId: data.categoryId,
					offering,
					links,
					availableProducts
				};

				const validationResult = OfferingDetailLinks_LoadDataSchema.safeParse(dataToValidate);

				if (!validationResult.success) {
					log.error('(OfferDetailLinksPage) Zod validation failed', validationResult.error.issues);
					throw new Error('Received invalid data structure from the API.');
				}

				resolvedData = validationResult.data;
			} catch (rawError: any) {
				if (aborted) return;
				const status = rawError.status ?? 500;
				const message = rawError.message || 'Failed to load or validate link details.';
				loadingError = { message, status };
				log.error('(OfferDetailLinksPage) Promise processing failed', { rawError });
			} finally {
				if (!aborted) {
					isLoading = false;
				}
			}
		};

		processPromises();
		return () => {
			aborted = true;
		};
	});

	// --- STATE & API ---
	let newUrl = $state('');
	let newNotes = $state('');
	let isAssigning = $state(false);

	const client = new ApiClient(fetch);
	const offeringApi = getOfferingApi(client);

	// --- API-AUFRUFE ---
	async function handleLinkDelete(ids: ID[]): Promise<void> {
		assertDefined(ids, 'OfferDetailLinksPage.handleLinkDelete');
		for (const id of ids) {
			await offeringApi.deleteOfferingLink(Number(id));
		}
		addNotification('Link(s) deleted.', 'success');
		invalidateAll();
	}

	function handleLinkSelect(link: WholesalerOfferingLink) {
		assertDefined(link, 'OfferDetailLinksPage.handleLinkSelect');
		addNotification(`Editing for link "${link.url}" not yet implemented.`, 'info');
	}

	async function handleAssignLink(event: SubmitEvent) {
		assertDefined(event, 'OfferDetailLinksPage.handleAssignLink');
		event.preventDefault();

		if (!resolvedData || !resolvedData.offering) {
			addNotification('An offering must be saved before assigning links.', 'error');
			return;
		}

		if (!newUrl) return;
		isAssigning = true;
		try {
			const linkData: Omit<WholesalerOfferingLink, 'link_id'> = {
				offering_id: resolvedData.offering.offering_id,
				url: newUrl,
				...(newNotes && { notes: newNotes })
			};
			await offeringApi.createOfferingLink(linkData);

			addNotification('Link added.', 'success');
			newUrl = '';
			newNotes = '';
			await invalidateAll();
		} finally {
			isAssigning = false;
		}
	}

	// --- GRID STRATEGIES ---
	const deleteStrategy: DeleteStrategy<WholesalerOfferingLink> = {
		execute: handleLinkDelete
	};
	const rowActionStrategy: RowActionStrategy<WholesalerOfferingLink> = {
		click: handleLinkSelect
	};
</script>

<!-- TEMPLATE mit bedingtem Rendering -->
{#if loadingError}
	<div class="component-error-boundary">
		<h3>Error Loading Data (Status: {loadingError.status})</h3>
		<p>{loadingError.message}</p>
	</div>
{:else if isLoading || !resolvedData}
	<div class="detail-page-layout">Loading link details...</div>
{:else}
	<OfferingDetailWrapper
		initialLoadedData={resolvedData}
		availableProducts={resolvedData.availableProducts}
	>
		<div class="grid-section">
			<div class="assignment-section">
				<h3>Add New Link</h3>
				{#if !resolvedData.offering}
					<p class="field-hint">
						You must save the new offering first before you can add links.
					</p>
				{/if}
				<form class="assignment-form" onsubmit={handleAssignLink}>
					<input
						type="url"
						placeholder="https://example.com/product"
						bind:value={newUrl}
						required
						disabled={isAssigning || !resolvedData.offering}
					/>
					<input
						type="text"
						placeholder="Optional notes..."
						bind:value={newNotes}
						disabled={isAssigning || !resolvedData.offering}
					/>
					<button
						type="submit"
						class="primary-button"
						disabled={isAssigning || !newUrl || !resolvedData.offering}
					>
						{isAssigning ? 'Adding...' : 'Add Link'}
					</button>
				</form>
			</div>

			<h2 style="margin-top: 1.5rem;">Assigned Links</h2>
			<LinkGrid
				rows={resolvedData.links}
				loading={$offeringLoadingState}
				{deleteStrategy}
				{rowActionStrategy}
			/>
		</div>
	</OfferingDetailWrapper>
{/if}