<!-- src/lib/pages/suppliers/SupplierListPage.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { log } from '$lib/utils/logger';
  import { addNotification } from '$lib/stores/notifications';
  import { requestConfirmation } from '$lib/stores/confirmation';
  
  // Komponenten
  import SupplierGrid from '$lib/components/domain/suppliers/SupplierGrid.svelte';

  // API & Typen
  import { supplierLoadingState, deleteSupplier } from '$lib/api/client/supplier';
  import type { Wholesaler } from '$lib/domain/types';
  import type { DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';

  // Die `load`-Funktion aus `supplierListPage.ts` übergibt ihre Daten hierher.
  let { data } = $props<{ data: { suppliers: Wholesaler[] } }>();

  /**
   * Navigiert zur Detailansicht eines ausgewählten Lieferanten.
   * Dies wird durch die `rowActionStrategy` des Grids aufgerufen.
   */
  function handleSupplierSelect(supplier: Wholesaler) {
    log.info(`(SupplierListPage) Navigating to detail for supplierId: ${supplier.wholesaler_id}`);
    goto(`/suppliers/${supplier.wholesaler_id}`);
  }

  /**
   * Führt den Löschvorgang für einen oder mehrere Lieferanten durch.
   * Implementiert den im README beschriebenen 2-stufigen Löschprozess.
   * Dies wird durch die `deleteStrategy` des Grids aufgerufen.
   */
  async function handleSupplierDelete(ids: ID[]): Promise<void> {
    log.info(`(SupplierListPage) Deleting suppliers`, { ids });
    let dataChanged = false;

    for (const id of ids) {
      const numericId = Number(id);
      
      // 1. Optimistischer Versuch ohne Kaskadierung
      const result = await deleteSupplier(numericId, false);

      if (result.success) {
        addNotification(`Supplier "${result.data.deleted_resource.name}" deleted.`, 'success');
        dataChanged = true;
      } else if ('cascade_available' in result && result.cascade_available) {
        // 2. Konflikt erhalten, nach Kaskadierung fragen
        const dependencies = (result.dependencies as string[]).join(', ');
        const confirmed = await requestConfirmation(
          `Supplier has dependencies: ${dependencies}. Delete with all related data?`,
          'Confirm Cascade Delete'
        );

        if (confirmed) {
          const cascadeResult = await deleteSupplier(numericId, true);
          if (cascadeResult.success) {
            addNotification('Supplier and related data deleted.', 'success');
            dataChanged = true;
          }
        }
      } else {
        // Anderer Fehler
        addNotification(`Could not delete supplier (ID: ${id}).`, 'error');
      }
    }

    if (dataChanged) {
      // "Fire and Forget": Neu laden, ohne auf das Ergebnis zu warten,
      // um Race Conditions im UI zu vermeiden.
      goto('/suppliers', { invalidateAll: true });
    }
  }

  // Strategie-Objekte für das Datagrid
  const deleteStrategy: DeleteStrategy<Wholesaler> = {
    execute: handleSupplierDelete
  };

  const rowActionStrategy: RowActionStrategy<Wholesaler> = {
    click: handleSupplierSelect
  };
</script>

<div class="page-content-wrapper">
  <h1>Suppliers</h1>
  <p>Select a supplier to view their details and manage their product categories.</p>

  <SupplierGrid
    rows={data.suppliers}
    loading={$supplierLoadingState}
    {deleteStrategy}
    {rowActionStrategy}
  />
</div>

<style>
  .page-content-wrapper {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }
  h1 {
    margin: 0;
  }
  p {
    margin: 0;
    color: var(--color-muted);
  }
</style>