<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from "$lib/stores/confirmation";

  // Komponenten
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/grid-section.css";
  import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";
  import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";
  import CategoryAssignment from "$lib/components/domain/suppliers/CategoryAssignment.svelte";

  // API & Typen
  import {
    getSupplierApi,
    supplierLoadingState,
  } from "$lib/api/client/supplier";
  import type {
    Wholesaler,
    ProductCategory,
    WholesalerCategory_Category,
  } from "$lib/domain/types";
  import type {
    DeleteStrategy,
    RowActionStrategy,
    ID,
  } from "$lib/components/client/Datagrid.types";
  import { categoryLoadingState } from "$lib/api/client/category";
  import { ApiClient } from "$lib/api/client/ApiClient";

  // Die `load`-Funktion aus `supplierDetailPage.ts` übergibt ihre Daten hierher.
  type LoadData = {
    supplier: Wholesaler;
    assignedCategories: WholesalerCategory_Category[];
    availableCategories: ProductCategory[];
  };

  // 1. Create an ApiClient instance with client `fetch`.
  const client = new ApiClient(fetch);

  // 2. Get the supplier-specific API methods from the factory.
  const supplierApi = getSupplierApi(client);

  let { data } = $props<{ data: LoadData }>();

  /**
   * Handler für das Absenden des Lieferantenformulars.
   * Ruft die API zum Aktualisieren des Lieferanten auf.
   */
  async function handleSupplierUpdate(event: { data: Record<string, any> }) {
    const supplierId = data.supplier.wholesaler_id;
    try {
      log.info(`(SupplierDetailPage) Updating supplier`, {
        supplierId,
        data: event.data,
      });

      const updatedSupplier = await supplierApi.updateSupplier(
        supplierId,
        event.data as Partial<Wholesaler>,
      );
      addNotification(
        `Supplier "${updatedSupplier.name}" updated successfully.`,
        "success",
      );

      // Aktualisiere die lokalen Daten, um das Formular nicht neu laden zu müssen.
      data.supplier = updatedSupplier;
    } catch (error) {
      log.error(`(SupplierDetailPage) Failed to update supplier`, {
        supplierId,
        error,
      });
      addNotification("Failed to update supplier.", "error");
    }
  }

  /**
   * Handler für die Zuweisung einer neuen Kategorie.
   */
  async function handleCategoryAssigned(category: ProductCategory) {
    const supplierId = data.supplier.wholesaler_id;
    try {
      log.info(`(SupplierDetailPage) Assigning category`, {
        supplierId,
        categoryId: category.category_id,
      });
      await supplierApi.assignCategoryToSupplier({
        supplierId,
        categoryId: category.category_id,
      });
      addNotification(
        `Category "${category.name}" assigned successfully.`,
        "success",
      );

      // Seite neu laden, um die Gitter (zugewiesen & verfügbar) zu aktualisieren.
      await goto(`/suppliers/${supplierId}`, { invalidateAll: true });
    } catch (error) {
      log.error(`(SupplierDetailPage) Failed to assign category`, {
        supplierId,
        error,
      });
      addNotification("Failed to assign category.", "error");
    }
  }

  /**
   * Führt den Löschvorgang für eine Kategoriezuweisung durch.
   */
  
   async function handleCategoryDelete(ids: ID[]): Promise<void> {
    log.info(`(SupplierDetailPage) Removing category assignments`, { ids });
    let dataChanged = false;

    for (const id of ids) {
      const [supplierIdStr, categoryIdStr] = String(id).split("-");
      const supplierId = Number(supplierIdStr);
      const categoryId = Number(categoryIdStr);
      if (isNaN(supplierId) || isNaN(categoryId)) continue;

      // 1. Optimistischer erster Versuch ohne Kaskadierung
      const initialResult = await supplierApi.removeCategoryFromSupplier({
        supplierId,
        categoryId,
        cascade: false,
      });

      if (initialResult.success) {
        // HAPPY PATH: Keine Abhängigkeiten, Zuweisung erfolgreich entfernt.
        addNotification(`Category assignment removed.`, "success");
        dataChanged = true;
      } else if ("cascade_available" in initialResult && initialResult.cascade_available) {
        // CONFLICT PATH: Abhängigkeiten gefunden, zweites Dialogfenster anzeigen.
        const offeringCount = (initialResult.dependencies as any)?.offering_count ?? 0;
        const confirmed = await requestConfirmation(
          `This category has ${offeringCount} offerings for this supplier. Remove the assignment and all these offerings?`,
          "Confirm Cascade Delete",
        );
        
        if (confirmed) {
          // 2. Wenn bestätigt, den zweiten API-Aufruf mit cascade=true durchführen.
          const cascadeResult = await supplierApi.removeCategoryFromSupplier({
            supplierId,
            categoryId,
            cascade: true,
          });

          if (cascadeResult.success) {
            addNotification("Category assignment and its offerings removed.", "success");
            dataChanged = true;
          } else {
            addNotification(cascadeResult.message || "Failed to remove assignment.", "error");
          }
        }
        // Wenn der Benutzer hier "Abbrechen" wählt, passiert nichts weiter,
        // und die Funktion beendet sich sauber. Der `finally`-Block im DataGrid wird den "deleting" Status entfernen.
      } else {
         // UNEXPECTED ERROR PATH: Ein anderer Fehler ist aufgetreten.
        addNotification(initialResult.message || "Could not remove assignment.", "error");
      }
    }

    if (dataChanged) {
      // "Fire-and-forget" Neuladen, um die UI zu aktualisieren.
      // Nicht `await`-en, um dem DataGrid Zeit zum Aufräumen zu geben.
      goto(`/suppliers/${data.supplier.wholesaler_id}`, {
        invalidateAll: true,
      });
    }
  }


  /**
   * Navigiert zur nächsten Hierarchieebene (Angebote).
   */
  function handleCategorySelect(category: WholesalerCategory_Category) {
    log.info(
      `(SupplierDetailPage) Navigating to offerings for categoryId: ${category.category_id}`,
    );
    goto(
      `/suppliers/${category.wholesaler_id}/categories/${category.category_id}`,
    );
  }

  // Strategie-Objekte für das CategoryGrid
  const deleteStrategy: DeleteStrategy<WholesalerCategory_Category> = {
    execute: handleCategoryDelete,
  };
  const rowActionStrategy: RowActionStrategy<WholesalerCategory_Category> = {
    click: handleCategorySelect,
  };
</script>

<div class="detail-page-layout">
  <!-- Sektion 1: Formular für Lieferantendetails -->
  <div class="form-section">
    <SupplierForm
      initial={data.supplier}
      disabled={$supplierLoadingState}
      onSubmitted={handleSupplierUpdate}
      onCancelled={() => goto("/suppliers")}
    />
  </div>

  <!-- Sektion 2: Zuweisung neuer Kategorien -->
  <div class="assignment-section">
    <CategoryAssignment
      supplierId={data.supplier.wholesaler_id}
      availableCategories={data.availableCategories}
      loading={$categoryLoadingState}
      onAssigned={handleCategoryAssigned}
      onError={(msg) => addNotification(msg, "error")}
    />
  </div>

  <!-- Sektion 3: Gitter der zugewiesenen Kategorien -->
  <div class="grid-section">
    <h2>Assigned Categories</h2>
    <p>
      Products this supplier can offer are organized by these categories. Click
      a category to manage its product offerings.
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
  .form-section{
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
