// src/lib/pages/suppliers/supplierDetailPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { getSupplierApi } from '$lib/api/client/supplier';
import { ApiClient } from '$lib/api/client/ApiClient';

/**
 * Lädt alle Daten für die Lieferanten-Detailseite.
 * Führt drei API-Aufrufe parallel aus, um die Ladezeit zu optimieren.
 */
export async function load({ params, fetch: loadEventFetch }: LoadEvent) {
  const supplierId = Number(params.supplierId);
  if (isNaN(supplierId)) {
    throw error(400, 'Invalid Supplier ID');
  }

  log.info(`(SupplierDetailPage) loading all data for supplierId: ${supplierId}`);

  // 1. Create an ApiClient instance with the context-aware `fetch`.
  const client = new ApiClient(loadEventFetch);

  // 2. Get the supplier-specific API methods from the factory.
  const supplierApi = getSupplierApi(client);

  try {
    // Führe alle notwendigen Datenabrufe parallel aus.
    const [supplier, assignedCategories, availableCategories] = await Promise.all([
      supplierApi.loadSupplier(supplierId),
      supplierApi.loadCategoriesForSupplier(supplierId),
      supplierApi.loadAvailableCategoriesForSupplier(supplierId)
    ]);

    // Gib alle geladenen Daten an die UI-Komponente weiter.
    return {
      supplier,
      assignedCategories,
      availableCategories
    };

  } catch (err: any) {
    log.error(`(SupplierDetailPage) Failed to load data for supplierId: ${supplierId}`, { err });
    const status = err.status ?? err?.response?.status ?? 500;
    const msg = err?.response?.details || err?.message || 'Failed to load category';
    throw error(status, msg);
  }
}