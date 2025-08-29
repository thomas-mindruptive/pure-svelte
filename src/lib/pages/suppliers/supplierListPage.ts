// src/lib/pages/suppliers/supplierListPage.ts

import { log } from '$lib/utils/logger';
import { loadSuppliers, DEFAULT_SUPPLIER_QUERY } from '$lib/api/client/supplier';
import { error } from '@sveltejs/kit';

/**
 * Lädt die für die Supplier-Listenseite erforderlichen Daten.
 * Diese Funktion wird von SvelteKit aufgerufen, wenn die Route /suppliers geladen wird.
 */
export async function load() {
  log.info(`(SupplierListPage) loading suppliers...`);
  try {
    // Ruft die API-Client-Funktion auf, um die Lieferantendaten zu laden.
    const suppliers = await loadSuppliers({
      ...DEFAULT_SUPPLIER_QUERY,
      orderBy: [{ key: 'name', direction: 'asc' }],
    });

    // Die zurückgegebenen Daten sind im UI über die 'data'-Prop verfügbar.
    return {
      suppliers
    };
  } catch (err) {
    log.error(`(SupplierListPage) Failed to load suppliers`, { err });
    // Wirft einen SvelteKit-spezifischen Fehler, der eine passende Fehlerseite anzeigt.
    throw error(500, 'Could not load suppliers. Please try again later.');
  }
}