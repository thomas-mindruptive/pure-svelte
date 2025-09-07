<!-- src/lib/pages/offerings/OfferDetailAttributesPage.svelte -->
<script lang="ts">
	import { log } from '$lib/utils/logger';
	import { addNotification } from '$lib/stores/notifications';
	import { invalidateAll } from '$app/navigation';
	import AttributeGrid from '$lib/components/domain/attributes/AttributeGrid.svelte';
	import { getOfferingApi, offeringLoadingState } from '$lib/api/client/offering';
	import type { WholesalerOfferingAttribute_Attribute } from '$lib/domain/domainTypes';

	import '$lib/components/styles/assignment-section.css';
	import '$lib/components/styles/grid-section.css';
	import '$lib/components/styles/detail-page-layout.css';
	import '$lib/components/styles/form-elements.css';
	import OfferingDetailWrapper from '$lib/components/domain/offerings/OfferingDetailWrapper.svelte';

	import { ApiClient } from '$lib/api/client/ApiClient';
	import type { ID, DeleteStrategy, RowActionStrategy } from '$lib/components/grids/Datagrid.types';
	import {
		OfferingDetailAttributes_LoadDataSchema,
		type OfferingDetailAttributes_LoadData,
		type OfferingDetailAttributes_LoadDataAsync
	} from './offeringDetail.types';
	import { assertDefined } from '$lib/utils/validation/assertions';

	// --- PROPS ---
	// Empfängt das Objekt mit den Promises aus der `load`-Funktion.
	let { data }: {data: OfferingDetailAttributes_LoadDataAsync } = $props<{ data: OfferingDetailAttributes_LoadDataAsync }>();

	// --- LOKALER, REAKTIVER ZUSTAND ---
	// Speichert das Ergebnis der Promise-Auflösung.
	let resolvedData = $state<OfferingDetailAttributes_LoadData | null>(null);
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
				const [offering, assignedAttributes, availableAttributes, availableProducts] =
					await Promise.all([
						data.offering,
						data.assignedAttributes,
						data.availableAttributes,
						data.availableProducts
					]);

				if (aborted) return;

				const dataToValidate = {
					supplierId: data.supplierId,
					categoryId: data.categoryId,
					offering,
					assignedAttributes,
					availableAttributes,
					availableProducts
				};

				const validationResult = OfferingDetailAttributes_LoadDataSchema.safeParse(dataToValidate);

				if (!validationResult.success) {
					log.error(
						'Zod validation failed',
						validationResult.error.issues
					);
					throw new Error('Received invalid data structure from the API.');
				}

				resolvedData = validationResult.data;
			} catch (rawError: any) {
				if (aborted) return;
				const status = rawError.status ?? 500;
				const message = rawError.message || 'Failed to load or validate offering details.';
				loadingError = { message, status };
				log.error('Promise processing failed', { rawError });
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
	let selectedAttributeId: number | null = $state(null);
	let attributeValue: string = $state('');
	let isAssigning = $state(false);

	const client = new ApiClient(fetch);
	const offeringApi = getOfferingApi(client);

	// --- API-AUFRUFE ---
	async function handleAttributeDelete(ids: ID[]): Promise<void> {
		assertDefined(ids, 'OfferingDetailAttributesPage.handleAttributeDelete');
		log.info(`Deleting attribute assignments`, {
			ids
		});
		let dataChanged = false;
		for (const id of ids) {
			const parsed = offeringApi.parseAttributeCompositeId(String(id));
			if (!parsed) continue;
			const { offeringId, attributeId } = parsed;
			const result = await offeringApi.deleteOfferingAttribute(offeringId, attributeId);
			if (result.success) {
				addNotification(`Attribute assignment deleted.`, 'success');
				dataChanged = true;
			} else {
				addNotification(`Could not delete attribute assignment.`, 'error');
			}
		}
		if (dataChanged) invalidateAll();
	}

	function handleAttributeSelect(attribute: WholesalerOfferingAttribute_Attribute) {
		assertDefined(attribute, 'OfferingDetailAttributesPage.handleAttributeSelect');
		addNotification(
			`Editing for "${attribute.attribute_name}" not yet implemented.`,
			'info'
		);
	}

	async function handleAssignAttribute(event: SubmitEvent) {
		assertDefined(event, 'OfferingDetailAttributesPage.handleAssignAttribute');
		event.preventDefault();
		if (!selectedAttributeId) {
			addNotification('Please select an attribute.', 'error');
			return;
		}
		if (!resolvedData || !resolvedData.offering) {
			addNotification('An offering must be saved before assigning attributes.', 'error');
			return;
		}
		isAssigning = true;
		try {
			const assignmentData = {
				offering_id: resolvedData.offering.offering_id,
				attribute_id: selectedAttributeId,
				...(attributeValue && { value: attributeValue })
			};

			await offeringApi.createOfferingAttribute(assignmentData);

			addNotification('Attribute assigned successfully.', 'success');
			selectedAttributeId = null;
			attributeValue = '';
			await invalidateAll();
		} catch (error) {
			log.error(`Failed to assign attribute`, { error });
			addNotification('Failed to assign attribute.', 'error');
		} finally {
			isAssigning = false;
		}
	}

	// --- GRID STRATEGIES ---
	const deleteStrategy: DeleteStrategy<WholesalerOfferingAttribute_Attribute> = {
		execute: handleAttributeDelete
	};
	const rowActionStrategy: RowActionStrategy<WholesalerOfferingAttribute_Attribute> = {
		click: handleAttributeSelect
	};
</script>

<!-- TEMPLATE mit bedingtem Rendering -->
{#if loadingError}
	<div class="component-error-boundary">
		<h3>Error Loading Data (Status: {loadingError.status})</h3>
		<p>{loadingError.message}</p>
	</div>
{:else if isLoading || !resolvedData}
	<div class="detail-page-layout">Loading offering details...</div>
{:else}
	<OfferingDetailWrapper
		initialLoadedData={resolvedData}
		availableProducts={resolvedData.availableProducts}
	>
		<div class="grid-section">
			<div class="assignment-section">
				<h3>Assign New Attribute</h3>
				{#if !resolvedData.offering}
					<p class="field-hint">
						You must save the new offering first before you can assign attributes.
					</p>
				{/if}
				<form class="assignment-form" onsubmit={handleAssignAttribute}>
					<select bind:value={selectedAttributeId} disabled={isAssigning || !resolvedData.offering}>
						<option value={null}>Select an attribute...</option>
						{#each resolvedData.availableAttributes as attr (attr.attribute_id)}
							<option value={attr.attribute_id}>{attr.name}</option>
						{/each}
					</select>
					<input
						type="text"
						placeholder="Value (e.g., 'Red')"
						bind:value={attributeValue}
						disabled={isAssigning || !resolvedData.offering}
					/>
					<button
						type="submit"
						class="primary-button"
						disabled={isAssigning || !selectedAttributeId || !resolvedData.offering}
					>
						{isAssigning ? 'Assigning...' : 'Assign'}
					</button>
				</form>
			</div>

			<h2 style="margin-top: 1.5rem;">Assigned Attributes</h2>
			<AttributeGrid
				rows={resolvedData.assignedAttributes}
				loading={$offeringLoadingState}
				{deleteStrategy}
				{rowActionStrategy}
			/>
		</div>
	</OfferingDetailWrapper>
{/if}