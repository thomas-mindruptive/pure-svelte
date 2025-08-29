// src/lib/pages/categories/categoryDetailPage.ts

import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { getCategoryApi, type OfferingWithDetails } from '$lib/api/client/category';
import type { ProductCategory } from '$lib/domain/types';
import { ApiClient } from '$lib/api/client/ApiClient';

/**
 * Lädt die Daten für die Kategorie-Detailseite (Angebots-Ansicht).
 *
 * @param parent - Ermöglicht den Zugriff auf die bereits geladenen Daten aus dem Layout.
 */
export async function load({ params, parent, fetch:loadEventFetch }: LoadEvent) {
  const supplierId = Number(params.supplierId);
  const categoryId = Number(params.categoryId);

  if (isNaN(supplierId) || isNaN(categoryId)) {
    throw error(400, 'Invalid Supplier or Category ID');
  }

  // Daten vom übergeordneten Layout abrufen, um API-Aufrufe zu sparen.
  const layoutData = await parent();
  log.info(`(CategoryDetailPage) loading data for supplierId: ${supplierId}, categoryId: ${categoryId}`);

    // 1. Create an ApiClient instance with the context-aware `fetch`.
    const client = new ApiClient(loadEventFetch);
  
    // 2. Get the supplier-specific API methods from the factory.
    const categoryApi = getCategoryApi(client);

  try {
    // Führe die spezifischen API-Aufrufe für diese Seite parallel aus.
    const [category, offerings] = await Promise.all([
      categoryApi.loadCategory(categoryId),
      categoryApi.loadOfferingsForCategory(supplierId,categoryId)
    ]);

    // Finde die spezifische "Zuweisungsinformation" (Kommentar, Link) aus den Layout-Daten.
    const assignmentInfo = layoutData.assignedCategories?.find((c: ProductCategory) => c.category_id === categoryId);

    return {
      category,
      offerings: offerings as OfferingWithDetails[],
      assignmentComment: assignmentInfo?.comment,
      assignmentLink: assignmentInfo?.link
    };
  } catch (err) {
    log.error(`(CategoryDetailPage) Failed to load data`, { supplierId, categoryId, err });
    throw error(404, `Category or offerings not found for supplier ${supplierId} and category ${categoryId}.`);
  }
}