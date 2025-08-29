<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { log } from '$lib/utils/logger';
  import { addNotification } from '$lib/stores/notifications';
  import { requestConfirmation } from '$lib/stores/confirmation';

  // Komponenten
  import SupplierForm from '$lib/components/domain/suppliers/SupplierForm.svelte';
  import CategoryGrid from '$lib/components/domain/categories/CategoryGrid.svelte';
  import CategoryAssignment from '$lib/components/domain/suppliers/CategoryAssignment.svelte';
  
  // API & Typen
  import { 
    supplierLoadingState, 
    updateSupplier,
    assignCategoryToSupplier,
    removeCategoryFromSupplier
  } from '$lib/api/client/supplier';
  import type { Wholesaler, ProductCategory, WholesalerCategory_Category } from '$lib/domain/types';
  import type { DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';
    import { categoryLoadingState } from '$lib/api/client/category';

  // Die `load`-Funktion aus `supplierDetailPage.ts` übergibt ihre Daten hierher.
  type LoadData = {
    supplier: Wholesaler;
    assignedCategories: WholesalerCategory_Category[];
    availableCategories: ProductCategory[];
  };

  let { data } = $props<{ data: LoadData }>();

  /**
   * Handler für das Absenden des Lieferantenformulars.
   * Ruft die API zum Aktualisieren des Lieferanten auf.
   */
  async function handleSupplierUpdate(event: { data: Record<string, any> }) {
    const supplierId = data.supplier.wholesaler_id;
    try {
      log.info(`(SupplierDetailPage) Updating supplier`, { supplierId, data: event.data });
      const updatedSupplier = await updateSupplier(supplierId, event.data as Partial<Wholesaler>);
      addNotification(`Supplier "${updatedSupplier.name}" updated successfully.`, 'success');
      
      // Aktualisiere die lokalen Daten, um das Formular nicht neu laden zu müssen.
      data.supplier = updatedSupplier;

    } catch (error) {
      log.error(`(SupplierDetailPage) Failed to update supplier`, { supplierId, error });
      addNotification('Failed to update supplier.', 'error');
    }
  }

  /**
   * Handler für die Zuweisung einer neuen Kategorie.
   */
  async function handleCategoryAssigned(category: ProductCategory) {
    const supplierId = data.supplier.wholesaler_id;
    try {
      log.info(`(SupplierDetailPage) Assigning category`, { supplierId, categoryId: category.category_id });
      await assignCategoryToSupplier({ supplierId, categoryId: category.category_id });
      addNotification(`Category "${category.name}" assigned successfully.`, 'success');

      // Seite neu laden, um die Gitter (zugewiesen & verfügbar) zu aktualisieren.
      await goto(`/suppliers/${supplierId}`, { invalidateAll: true });

    } catch (error) {
      log.error(`(SupplierDetailPage) Failed to assign category`, { supplierId, error });
      addNotification('Failed to assign category.', 'error');
    }
  }

  /**
   * Führt den Löschvorgang für eine Kategoriezuweisung durch.
   */
  async function handleCategoryDelete(ids: ID[]): Promise<void> {
    log.info(`(SupplierDetailPage) Removing category assignments`, { ids });

    for (const id of ids) {
      const [supplierIdStr, categoryIdStr] = String(id).split('-');
      const supplierId = Number(supplierIdStr);
      const categoryId = Number(categoryIdStr);
      if (!supplierId || !categoryId) continue;

      const result = await removeCategoryFromSupplier({ supplierId, categoryId, cascade: false });

      if (result.success) {
        addNotification(`Category assignment removed.`, 'success');
      } else if ('cascade_available' in result) {
        const offeringCount = (result.dependencies as any)?.offering_count ?? 0;
        const confirmed = await requestConfirmation(
          `This category has ${offeringCount} offerings. Remove them as well?`,
          'Confirm Cascade Delete'
        );
        if (confirmed) {
          await removeCategoryFromSupplier({ supplierId, categoryId, cascade: true });
          addNotification('Category and its offerings removed.', 'success');
        }
      }
    }
    // Seite neu laden, um die Gitter zu aktualisieren.
    await goto(`/suppliers/${data.supplier.wholesaler_id}`, { invalidateAll: true });
  }

  /**
   * Navigiert zur nächsten Hierarchieebene (Angebote).
   */
  function handleCategorySelect(category: WholesalerCategory_Category) {
    log.info(`(SupplierDetailPage) Navigating to offerings for categoryId: ${category.category_id}`);
    goto(`/suppliers/${category.wholesaler_id}/categories/${category.category_id}`);
  }

  // Strategie-Objekte für das CategoryGrid
  const deleteStrategy: DeleteStrategy<WholesalerCategory_Category> = {
    execute: handleCategoryDelete
  };
  const rowActionStrategy: RowActionStrategy<WholesalerCategory_Category> = {
    click: handleCategorySelect
  };
</script>

<div class="page-layout">
  <!-- Sektion 1: Formular für Lieferantendetails -->
  <div class="form-section">
    <SupplierForm
      initial={data.supplier}
      disabled={$supplierLoadingState}
      onSubmitted={handleSupplierUpdate}
      onCancelled={() => goto('/suppliers')}
    />
  </div>

  <!-- Sektion 2: Zuweisung neuer Kategorien -->
  <div class="assignment-section">
    <CategoryAssignment
      supplierId={data.supplier.wholesaler_id}
      availableCategories={data.availableCategories}
      loading={$categoryLoadingState}
      onAssigned={handleCategoryAssigned}
      onError={(msg) => addNotification(msg, 'error')}
    />
  </div>

  <!-- Sektion 3: Gitter der zugewiesenen Kategorien -->
  <div class="grid-section">
    <h2>Assigned Categories</h2>
    <p>
      Products this supplier can offer are organized by these categories. 
      Click a category to manage its product offerings.
    </p>
    <CategoryGrid
      rows={data.assignedCategories}
      loading={$categoryLoadingState}
      {deleteStrategy}
      {rowActionStrategy}
    />
  </div>
</div>

<style>
  .page-layout {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .form-section, .assignment-section, .grid-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
  .grid-section {
    padding: 1.5rem;
  }
  h2 {
    margin-top: 0;
  }
  p {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--color-muted);
  }
</style>