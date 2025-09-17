// File: src/lib/components/domain/productDefinitions/productDefinitionDetailPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { ApiClient } from '$lib/api/client/ApiClient';
import { getProductDefinitionApi } from '$lib/api/client/productDefinition';
import type { ProductDefinitionDetailPage_LoadDataAsync } from './productDefinitionDetailPage.types';

/**
 * Loads all data for the Product Definition Detail Page using the non-blocking "app shell" pattern.
 * It returns an object of promises that the Svelte component will resolve.
 *
 * @param params Contains the productDefId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent): ProductDefinitionDetailPage_LoadDataAsync {
	const productDefId = Number(params.productDefId);

	// Handle "create new" mode
	if (params.productDefId?.toLowerCase() === 'new') {
		log.info(`Loading ProductDefinitionDetailPage in CREATE mode.`);
		return {
			productDefinition: Promise.resolve(null),
			offerings: Promise.resolve([])
		};
	}

	if (isNaN(productDefId) || productDefId <= 0) {
		throw error(400, 'Invalid Product Definition ID. Must be a positive number.');
	}

	log.info(`Kicking off non-blocking load for productDefId: ${productDefId}`);

	const client = new ApiClient(loadEventFetch);
	const productDefinitionApi = getProductDefinitionApi(client);

	// Return the object of promises directly without `await`.
	// The page component will handle resolving and error states.
	return {
		productDefinition: productDefinitionApi.loadProductDefinition(productDefId),
		offerings: productDefinitionApi.loadOfferingsForProductDefinition(productDefId)
	};
}