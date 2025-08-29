// src/lib/pages/suppliers/supplierDetailPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { 
    loadSupplier, 
    loadCategoriesForSupplier, 
    loadAvailableCategoriesForSupplier 
} from '$lib/api/client/supplier';

/**
 * Lädt alle Daten für die Lieferanten-Detailseite.
 * Führt drei API-Aufrufe parallel aus, um die Ladezeit zu optimieren.
 */
export async function load({ params }: LoadEvent) {
  const supplierId = Number(params.supplierId);
  if (isNaN(supplierId)) {
    throw error(400, 'Invalid Supplier ID');
  }

  log.info(`(SupplierDetailPage) loading all data for supplierId: ${supplierId}`);

  try {
    // Führe alle notwendigen Datenabrufe parallel aus.
    const [supplier, assignedCategories, availableCategories] = await Promise.all([
      loadSupplier(supplierId),
      loadCategoriesForSupplier(supplierId),
      loadAvailableCategoriesForSupplier(supplierId)
    ]);

    // Gib alle geladenen Daten an die UI-Komponente weiter.
    return {
      supplier,
      assignedCategories,
      availableCategories
    };

  } catch (err) {
    log.error(`(SupplierDetailPage) Failed to load data for supplierId: ${supplierId}`, { err });
    // Wenn der Lieferant nicht gefunden wird (oft ein 404), oder ein anderer Fehler auftritt.
    throw error(404, `Supplier with ID ${supplierId} not found.`);
  }
}