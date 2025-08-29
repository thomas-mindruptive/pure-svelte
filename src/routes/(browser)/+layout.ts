// src/routes/(browser)/+layout.ts

import { log } from '$lib/utils/logger';
import type { LoadEvent } from '@sveltejs/kit';
import { loadSuppliers, loadCategoriesForSupplier } from '$lib/api/client/supplier';

/**
 * Lädt die Daten, die für das gesamte Browser-Layout (insb. die Sidebar) benötigt werden.
 * Diese Funktion wird bei jeder Navigation innerhalb der (browser)-Gruppe ausgeführt.
 */
export async function load({ url, params, depends }: LoadEvent) {
  log.info(`(Layout) Loading data for URL: ${url.pathname}`);
  
  // Wir verwenden 'depends' um SvelteKit mitzuteilen, dass diese load-Funktion
  // neu ausgeführt werden soll, wenn sich die angegebene URL ändert.
  depends('app:browser');

  const supplierId = params.supplierId ? Number(params.supplierId) : null;
  const categoryId = params.categoryId ? Number(params.categoryId) : null;

  // Bestimme das aktive "Level" basierend auf der URL-Struktur.
  let activeLevel = 'suppliers';
  if (supplierId && !categoryId) activeLevel = 'categories';
  if (supplierId && categoryId) activeLevel = 'offerings';
  
  // Lade die Daten für die Sidebar-Zähler parallel
  const [suppliers, assignedCategories] = await Promise.all([
    loadSuppliers({ select: ['wholesaler_id'] }), // Nur IDs für den Zähler laden
    supplierId ? loadCategoriesForSupplier(supplierId) : Promise.resolve([])
  ]);

  const sidebarItems = [
    { key: "suppliers", label: `Suppliers`, count: suppliers.length, level: 0 },
    { key: "categories", label: `Categories`, count: assignedCategories.length, disabled: !supplierId, level: 1 },
    // Platzhalter für zukünftige Level
    { key: "offerings", label: `Offerings`, count: 0, disabled: !categoryId, level: 2 }, 
  ];

  return {
    sidebarItems,
    activeLevel,
    context: { // Kontext an Kind-Seiten weitergeben
      supplierId,
      categoryId
    }
  };
}