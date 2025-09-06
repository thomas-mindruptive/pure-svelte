// src/lib/pages/suppliers/supplierDetailPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { getSupplierApi } from '$lib/api/client/supplier';
import { ApiClient } from '$lib/api/client/ApiClient';
// NEW: Import the asynchronous data type
import type { SupplierDetailPage_LoadDataAsync } from './supplierDetailPage.types';

/**
 * Loads all data for the Supplier Detail Page using the non-blocking "app shell" pattern.
 * This function returns immediately with an object of promises.
 * The corresponding Svelte component is responsible for resolving these promises.
 *
 * @param params Contains the supplierId from the URL.
 * @param loadEventFetch The context-aware fetch function from SvelteKit.
 * @returns An object where each property is a promise for the required data.
 */
export function load({ params, fetch: loadEventFetch }: LoadEvent): SupplierDetailPage_LoadDataAsync {
	const supplierId = Number(params.supplierId);

	if (isNaN(supplierId) && params.supplierId?.toLowerCase() !== 'new') {
		// This error is thrown immediately as it's a client-side validation error.
		throw error(400, 'Invalid Supplier ID');
	}

	log.info(`(SupplierDetailPage) Kicking off non-blocking load for supplierId: ${supplierId}`);

	// Create an ApiClient instance with the context-aware `fetch`.
	const client = new ApiClient(loadEventFetch);

	// Get the supplier-specific API methods from the factory.
	const supplierApi = getSupplierApi(client);

	// ⚠️ Return the object of promises directly without `await`.
	//    The page component will handle resolving and error states.

	// EDIT mode
	if (supplierId) {
		return {
			supplier: supplierApi.loadSupplier(supplierId),
			assignedCategories: supplierApi.loadCategoriesForSupplier(supplierId),
			availableCategories: supplierApi.loadAvailableCategoriesForSupplier(supplierId)
		};
	}
	// CREATE mode
	else {
		return {
			supplier: Promise.resolve(null),
			assignedCategories: supplierApi.loadCategoriesForSupplier(supplierId),
			availableCategories: supplierApi.loadAvailableCategoriesForSupplier(supplierId)
		};
	}
}