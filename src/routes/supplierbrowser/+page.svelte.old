<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { onMount } from "svelte";

  // Import CSS styles
  import "$lib/components/styles/grid.css";
  import "$lib/components/styles/form.css";

  // Import components
  import HierarchySidebar from "$lib/components/browser/HierarchySidebar.svelte";
  import SupplierGrid from "$lib/components/domain/suppliers/SupplierGrid.svelte";
  import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";
  import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";
  import CategoryAssignment from "$lib/components/domain/suppliers/CategoryAssignment.svelte";
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";

  // Import types
  import type {
    Level,
    ProductCategory,
    Wholesaler,
    WholesalerCategory_Category,
    WholesalerItemOffering_ProductDef_Category,
  } from "$lib/domain/types";

  // Import API client functions - CORRECTED IMPORTS
  import {
    loadSuppliers,
    loadSupplier,
    updateSupplier,
    deleteSupplier,
    DEFAULT_SUPPLIER_QUERY,
    // CORRECTED: These functions are in supplier.ts, not category.ts
    loadCategoriesForSupplier,
    assignCategoryToSupplier,
    removeCategoryFromSupplier,
    loadAvailableCategoriesForSupplier,
    supplierLoadingState,
  } from "$lib/api/client/supplier";

  import { categoryLoadingState } from "$lib/api/client/category";

  import { addNotification } from "$lib/stores/notifications";

  // Mock data only for Level 3-5 (offerings, attributes, links)
  import { mockData as constMockData } from "./mockData";
  import { requestConfirmation } from "$lib/stores/confirmation";
    import type { DeleteStrategy, RowActionStrategy } from "$lib/components/client/Datagrid.types";

  // ===== STATE (Svelte 5 Runes) =====

  // Real data from API
  let suppliers = $state<Wholesaler[] | null>(null);
  let selectedSupplierData = $state<Wholesaler | null>(null);
  let supplierCategories = $state<WholesalerCategory_Category[]>([]);
  let availableCategories = $state<ProductCategory[]>([]);

  // Mock data for Level 3-5 (still using mocks)
  const mockOfferingsData = constMockData.wholesalerItemOfferings;

  // ===== URL-DRIVEN STATE =====
  const currentLevel = $derived(
    ($page.url.searchParams.get("level") as Level) || "wholesalers",
  );
  const selectedSupplierId = $derived(
    Number($page.url.searchParams.get("supplierId")) || null,
  );
  const selectedCategoryId = $derived(
    Number($page.url.searchParams.get("categoryId")) || null,
  );

  // ===== DERIVED STATE =====
  const selectedSupplier = $derived(
    selectedSupplierId && suppliers
      ? suppliers.find((s) => s.wholesaler_id === selectedSupplierId) ||
          selectedSupplierData
      : selectedSupplierData,
  );

  const selectedCategory = $derived(
    selectedCategoryId
      ? supplierCategories.find((c) => c.category_id === selectedCategoryId) ||
          null
      : null,
  );

  const offeringsForSupplierAndCategory = $derived(
    selectedSupplier && selectedCategoryId
      ? mockOfferingsData.filter(
          (o: WholesalerItemOffering_ProductDef_Category) =>
            o.wholesaler_id === selectedSupplier.wholesaler_id &&
            o.category_id === selectedCategoryId,
        )
      : [],
  );

  // Sidebar data with real counts
  const counts = $derived({
    wholesalers: suppliers?.length || 0,
    categories: supplierCategories.length,
    offerings: offeringsForSupplierAndCategory.length,
    attributes: 0, // Not implemented yet
    links: 0, // Not implemented yet
  });

  const sidebarItems = $derived([
    {
      key: "wholesalers",
      label: `Suppliers (${counts.wholesalers})`,
      disabled: false,
      level: 0,
    },
    {
      key: "categories",
      label: `Categories (${counts.categories})`,
      disabled: !selectedSupplier,
      level: 1,
    },
    {
      key: "offerings",
      label: `Product Offerings (${counts.offerings})`,
      disabled: !selectedCategory,
      level: 2,
    },
    {
      key: "attributes",
      label: "Attributes (0)",
      disabled: true, // Not implemented yet
      level: 3,
    },
    {
      key: "links",
      label: "Links (0)",
      disabled: true, // Not implemented yet
      level: 3,
    },
  ]);

  // ===== API LOADING FUNCTIONS =====

  /**
   * Load all suppliers from API
   */
  async function loadSuppliersData() {
    try {
      log.info("Loading suppliers from API");

      suppliers = await loadSuppliers({
        ...DEFAULT_SUPPLIER_QUERY,
        orderBy: [{ key: "name", direction: "asc" }],
      });

      log.info("Suppliers loaded successfully", { count: suppliers.length });
    } catch (error) {
      log.error("Failed to load suppliers", { error });
      addNotification("Failed to load suppliers", "error");
      suppliers = [];
    }
  }

  /**
   * Load detailed supplier data when selected
   */
  async function loadSupplierData(supplierId: number) {
    try {
      // REMOVED: Manual loading state management
      // loadingSupplierData = true;
      log.info("Loading supplier details", { supplierId });

      selectedSupplierData = await loadSupplier(supplierId);

      log.info("Supplier details loaded", {
        supplierId,
        name: selectedSupplierData.name,
      });
    } catch (error) {
      log.error("Failed to load supplier details", { supplierId, error });
      addNotification("Failed to load supplier details", "error");
      selectedSupplierData = null;
    }
    // REMOVED: Manual loading state management
    // finally {
    //   loadingSupplierData = false;
    // }
  }

  /**
   * Load supplier categories when supplier is selected
   */
  async function loadSupplierCategoriesData(supplierId: number) {
    try {
      // REMOVED: Manual loading state management
      // loadingCategories = true;
      log.info("Loading supplier categories", { supplierId });

      // CORRECTED: Function name and removed includeOfferingCounts parameter
      supplierCategories = await loadCategoriesForSupplier(supplierId);

      log.info("Supplier categories loaded", {
        supplierId,
        count: supplierCategories.length,
      });
    } catch (error) {
      log.error("Failed to load supplier categories", { supplierId, error });
      addNotification("Failed to load supplier categories", "error");
      supplierCategories = [];
    }
    // REMOVED: Manual loading state management
    // finally {
    //   loadingCategories = false;
    // }
  }

  /**
   * Load available categories for assignment
   */
  async function loadAvailableCategoriesData(supplierId: number) {
    try {
      // REMOVED: Manual loading state management
      // loadingAvailableCategories = true;
      log.info("Loading available categories", { supplierId });

      // CORRECTED: Function name
      availableCategories =
        await loadAvailableCategoriesForSupplier(supplierId);

      log.info("Available categories loaded", {
        supplierId,
        count: availableCategories.length,
      });
    } catch (error) {
      log.error("Failed to load available categories", { supplierId, error });
      addNotification("Failed to load available categories", "error");
      availableCategories = [];
    }
    // REMOVED: Manual loading state management
    // finally {
    //   loadingAvailableCategories = false;
    // }
  }

  // ===== REACTIVE DATA LOADING =====

  // Load suppliers on mount
  onMount(() => {
    loadSuppliersData();
  });

  // Load supplier data when supplier is selected
  $effect(() => {
    if (selectedSupplierId && currentLevel !== "wholesalers") {
      // Load detailed supplier data if not already loaded or different supplier
      if (
        !selectedSupplierData ||
        selectedSupplierData.wholesaler_id !== selectedSupplierId
      ) {
        loadSupplierData(selectedSupplierId);
      }

      // Load supplier categories
      loadSupplierCategoriesData(selectedSupplierId);

      // Load available categories for assignment
      loadAvailableCategoriesData(selectedSupplierId);
    } else {
      // Clear data when no supplier selected
      selectedSupplierData = null;
      supplierCategories = [];
      availableCategories = [];
    }
  });

  // ===== URL NAVIGATION =====
  function updateURL(params: {
    level?: Level;
    supplierId?: number | null | undefined;
    categoryId?: number | null | undefined;
    offeringId?: number | null | undefined;
  }) {
    const searchParams = new URLSearchParams($page.url.searchParams);

    if (params.level !== undefined) searchParams.set("level", params.level);
    if (params.supplierId !== undefined) {
      if (params.supplierId) {
        searchParams.set("supplierId", params.supplierId.toString());
      } else {
        searchParams.delete("supplierId");
      }
    }
    if (params.categoryId !== undefined) {
      if (params.categoryId) {
        searchParams.set("categoryId", params.categoryId.toString());
      } else {
        searchParams.delete("categoryId");
      }
    }
    if (params.offeringId !== undefined) {
      if (params.offeringId) {
        searchParams.set("offeringId", params.offeringId.toString());
      } else {
        searchParams.delete("offeringId");
      }
    }

    goto(`?${searchParams.toString()}`, { replaceState: true, noScroll: true });
  }

  // ===== NAVIGATION HANDLERS =====
  function handleSidebarNavigation(event: CustomEvent<{ key: string }>) {
    const level = event.detail.key as Level;
    log.info("Sidebar navigation", { from: currentLevel, to: level });

    switch (level) {
      case "wholesalers":
        updateURL({ level, supplierId: null, categoryId: null });
        break;
      case "categories":
        if (!selectedSupplier) return;
        updateURL({ level, categoryId: null });
        break;
      case "offerings":
        if (!selectedCategory) return;
        updateURL({ level });
        break;
    }
  }

  // ===== ROW SELECTION HANDLERS =====
  function handleSupplierSelect(supplier: Wholesaler) {
    log.info("Supplier selected", {
      supplierId: supplier.wholesaler_id,
      name: supplier.name,
    });
    updateURL({
      level: "categories",
      supplierId: supplier.wholesaler_id,
      categoryId: null,
    });
  }

  function handleCategorySelect(category: WholesalerCategory_Category) {
    log.info("Category selected", {
      categoryId: category.category_id,
      category_name: category.category_name,
    });
    updateURL({
      level: "offerings",
      categoryId: category.category_id,
    });
  }

  function handleOfferingSelect(
    offering: WholesalerItemOffering_ProductDef_Category,
  ) {
    log.info("Offering selected", {
      offeringId: offering.offering_id,
      offering_name: offering.product_def_title,
    });
    updateURL({
      level: "attributes",
      offeringId: offering.offering_id,
    });
  }

  // ===== STRATEGY DEFINITIONS (NEW) =====

  // Define strategies once, making the template cleaner
  const supplierDeleteStrategy: DeleteStrategy<Wholesaler> = {
    execute: handleSupplierDelete,
  };

  const supplierRowActionStrategy: RowActionStrategy<Wholesaler> = {
    click: handleSupplierSelect,
  };

  const categoryDeleteStrategy: DeleteStrategy<WholesalerCategory_Category> = {
    execute: handleCategoryDelete,
  };

  const categoryRowActionStrategy: RowActionStrategy<WholesalerCategory_Category> =
    {
      click: handleCategorySelect,
    };


  // ===== DELETE HANDLERS (Real API) =====

  /**
   * Handle supplier deletion via API
   */
  async function handleSupplierDelete(ids: (string | number)[]) {
    log.info("Deleting suppliers via API", { ids });
    let dataChanged = false;

    for (const id of ids) {
      try {
        const result = await deleteSupplier(Number(id), false);

        if (
          !result.success &&
          "cascade_available" in result &&
          result.cascade_available
        ) {
          // Supplier has dependencies, ask for cascade delete
          // NOTE: The first confirmation, if user wants to delete in the first place, is done
          // by the DataGrid id we don't provide a "deleteStrategy.confirm" callback.
          const dependencies = (result.dependencies as string[]) || [];
          const confirmed = await requestConfirmation(
            `Supplier has dependencies: ${dependencies.join(", ")}. Delete anyway with all related data?`,
            "Delete with Dependencies",
          );

          if (confirmed) {
            const cascadeResult = await deleteSupplier(Number(id), true);
            if (cascadeResult.success) {
              dataChanged = true;
              addNotification(
                "Supplier and all related data deleted successfully",
                "success",
              );
            }
          }
        } else if (result.success) {
          addNotification(
            `Supplier "${result.data.deleted_resource.name}" deleted successfully`,
            "success",
          );
        }
      } catch (error) {
        log.error("Failed to delete supplier", { id, error });
        addNotification("Failed to delete supplier", "error");
      }
    }

    // --- Race Condition Fix: Decoupling Data Reload from Deletion Completion ---
    // Problem: Previously, 'await loadSuppliersData()' here created a race condition.
    // The `orchestrateDelete` function in DataGrid.svelte was blocked, preventing
    // its `finally` block from clearing the `deletingObjectIds` state immediately.
    // Meanwhile, `loadSuppliersData` would trigger a re-render of the grid
    // with the `deletingObjectIds` still active, causing the row to visually stick
    // in the 'deleting' state even after the operation was effectively done.
    //
    // Solution: We now use a "Fire and Forget" pattern for data reloading.
    // By removing 'await', this function returns immediately to the `DataGrid`'s
    // `orchestrateDelete` function. This allows `orchestrateDelete` to execute
    // its `finally` block and clear the `deletingObjectIds` state *before*
    // the `loadSuppliersData` (running in the background) can trigger a new render.
    // This ensures the UI state is cleaned up first, then data is refreshed reactively.
    // The `then()` block handles any post-reload navigation or actions.
    if (dataChanged) {
      loadSuppliersData().then(() => {
        // Diese Logik wird ausgeführt, NACHDEM die Daten neu geladen wurden.
        if (selectedSupplierId && ids.includes(selectedSupplierId)) {
          updateURL({
            level: "wholesalers",
            supplierId: null,
            categoryId: null,
          });
        }
      });
    }

    // Clear selection if current supplier was deleted
    if (selectedSupplierId && ids.includes(selectedSupplierId)) {
      updateURL({ level: "wholesalers", supplierId: null, categoryId: null });
    }
  }

  /**
   * Handle category assignment removal via API
   */
  async function handleCategoryDelete(ids: (string | number)[]) {
    if (!selectedSupplierId) return;

    log.info("Removing category assignments via API", { ids });

    for (const id of ids) {
      // Parse compound ID: "supplierId-categoryId"
      const [supplierIdStr, categoryIdStr] = String(id).split("-");
      const supplierId = Number(supplierIdStr);
      const categoryId = Number(categoryIdStr);

      if (!supplierId || !categoryId) continue;

      try {
        const result = await removeCategoryFromSupplier({
          supplierId,
          categoryId,
          cascade: false,
        });

        if (
          !result.success &&
          "cascade_available" in result &&
          result.cascade_available
        ) {
          // Category has offerings, ask for cascade delete
          const offeringCount =
            "dependencies" in result &&
            result.dependencies &&
            typeof result.dependencies === "object" &&
            "offering_count" in result.dependencies
              ? (result.dependencies.offering_count as number)
              : 0;

          const confirmed = await requestConfirmation(
            `Category has ${offeringCount} offerings. Delete them too?`,
            "Delete Category with Offerings",
          );

          if (confirmed) {
            const cascadeResult = await removeCategoryFromSupplier({
              supplierId,
              categoryId,
              cascade: true,
            });
            if (cascadeResult.success) {
              addNotification(
                `Category and ${cascadeResult.data.dependencies_cleared || 0} offerings removed successfully`,
                "success",
              );
            }
          }
        } else if (result.success) {
          addNotification(
            `Category "${result.data.deleted_resource.category_name}" removed successfully`,
            "success",
          );
        }
      } catch (error) {
        log.error("Failed to remove category assignment", { id, error });
        addNotification("Failed to remove category assignment", "error");
      }
    }

    // Reload supplier categories
    if (selectedSupplierId) {
      await loadSupplierCategoriesData(selectedSupplierId);
      await loadAvailableCategoriesData(selectedSupplierId);
    }
  }

  /**
   * Handle offering deletion (still mock)
   */
  async function handleOfferingDelete(ids: (string | number)[]) {
    log.info("Mock: Delete offerings", { ids });
    addNotification(
      `MOCK: Would delete offerings with IDs: ${ids.join(", ")}`,
      "info",
    );
  }

  // ===== CATEGORY ASSIGNMENT HANDLERS =====

  /**
   * Handle supplier form submission via API
   */
  async function handleSupplierUpdate(p: {
    data: Record<string, any>;
    result: unknown;
  }) {
    if (!selectedSupplierId) return;

    try {
      log.info("Updating supplier via API", {
        supplierId: selectedSupplierId,
        data: p.data,
      });

      const updatedSupplier = await updateSupplier(selectedSupplierId, p.data);

      addNotification(
        `Supplier "${updatedSupplier.name}" updated successfully`,
        "success",
      );

      // Update local data
      selectedSupplierData = updatedSupplier;

      // Update suppliers list if needed
      if (suppliers) {
        const supplierIndex = suppliers.findIndex(
          (s) => s.wholesaler_id === selectedSupplierId,
        );
        if (supplierIndex >= 0) {
          suppliers[supplierIndex] = {
            ...suppliers[supplierIndex],
            ...updatedSupplier,
          };
        }
      }
    } catch (error) {
      log.error("Failed to update supplier", {
        supplierId: selectedSupplierId,
        error,
      });
      addNotification("Failed to update supplier", "error");
    }
  }

  /**
   * Handle supplier form cancellation
   */
  function handleFormCancel(p: { data: Record<string, any>; reason?: string }) {
    log.info("Supplier form cancelled", { reason: p.reason });
    // Could navigate away or reset form, but for now just log
  }

  /**
   * Handle category assignment via API
   */
  async function handleCategoryAssigned(category: ProductCategory) {
    if (!selectedSupplierId) return;

    try {
      log.info("Assigning category via API", {
        supplierId: selectedSupplierId,
        categoryId: category.category_id,
      });

      await assignCategoryToSupplier({
        supplierId: selectedSupplierId,
        categoryId: category.category_id,
        comment: "",
        link: "",
      });

      addNotification(
        `Category "${category.name}" assigned successfully`,
        "success",
      );

      // Reload data
      await loadSupplierCategoriesData(selectedSupplierId);
      await loadAvailableCategoriesData(selectedSupplierId);
    } catch (error) {
      log.error("Failed to assign category", {
        supplierId: selectedSupplierId,
        categoryId: category.category_id,
        error,
      });
      addNotification("Failed to assign category", "error");
    }
  }

  function handleCategoryError(error: string) {
    addNotification(error, "error", 5000);
  }

  // ===== COMPUTED PROPS =====
  const pageTitle = $derived(() => {
    if (currentLevel === "wholesalers") return "Suppliers";
    if (currentLevel === "categories" && selectedSupplier)
      return `Categories for ${selectedSupplier.name}`;
    if (currentLevel === "offerings" && selectedCategory)
      return `Offerings in ${selectedCategory.category_name}`;
    return "Supplier Browser";
  });

  const isLoading = $derived($supplierLoadingState || $categoryLoadingState);
</script>

<svelte:head>
  <title>Supplier Browser - {pageTitle()}</title>
</svelte:head>

<div class="browser-layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <HierarchySidebar
      items={sidebarItems}
      active={currentLevel}
      ariaLabel="Supplier Browser Navigation"
      onselect={handleSidebarNavigation}
    />
  </aside>

  <!-- Main Content -->
  <main class="main-content">
    <div class="content-header">
      <h1>{pageTitle()}</h1>
      <div class="header-badges">
        {#if selectedSupplier}
          <span class="badge">Supplier: {selectedSupplier.name}</span>
        {/if}
        {#if selectedCategory}
          <span class="badge">Category: {selectedCategory.category_name}</span>
        {/if}
        {#if isLoading}
          <span class="badge loading">Loading...</span>
        {/if}
      </div>
    </div>

    <div class="content-body">
      <!-- LEVEL 2: SupplierForm + CategoryGrid + CategoryAssignment -->
      {#if currentLevel === "categories" && selectedSupplier}
        <div class="master-form-section">
          <SupplierForm
            initial={selectedSupplier}
            disabled={$supplierLoadingState}
            onSubmitted={handleSupplierUpdate}
            onCancelled={handleFormCancel}
          />
        </div>

        <CategoryAssignment
          supplierId={selectedSupplier.wholesaler_id}
          {availableCategories}
          loading={$categoryLoadingState}
          onAssigned={handleCategoryAssigned}
          onError={handleCategoryError}
        />
      {/if}

      <!-- GRIDS -->
      <div class="grid-section">
        {#if currentLevel === "wholesalers"}
          <SupplierGrid
            rows={suppliers || []}
            loading={$supplierLoadingState}
            deleteStrategy={supplierDeleteStrategy}
            rowActionStrategy={supplierRowActionStrategy}
          />
        {:else if currentLevel === "categories"}
          <CategoryGrid
            rows={supplierCategories}
            loading={$categoryLoadingState}
            showOfferingCount={true}
            deleteStrategy={categoryDeleteStrategy}
            rowActionStrategy={categoryRowActionStrategy}
          />
        {:else if currentLevel === "offerings"}
          <div class="mock-notice">
            <p>
              <strong>🚧 Mock Data:</strong> Offerings are still using mock data
            </p>
          </div>
          <OfferingGrid
            rows={offeringsForSupplierAndCategory}
            loading={false}
            executeDelete={handleOfferingDelete}
            onRowClick={handleOfferingSelect}
          />
        {:else}
          <div class="empty-state">
            <h3>Level {currentLevel}</h3>
            <p>This level is not implemented yet.</p>
          </div>
        {/if}
      </div>
    </div>
  </main>
</div>

<style>
  .browser-layout {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    font-family: var(
      --font-sans,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      sans-serif
    );
  }

  .sidebar {
    flex-shrink: 0;
    width: 300px;
    background: var(--pc-grid-header-bg, #f8fafc);
    border-right: 1px solid var(--pc-grid-border, #e2e8f0);
    padding: 0;
  }

  .main-content {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--pc-grid-bg, #ffffff);
  }

  .content-header {
    padding: 1.5rem 2rem;
    border-bottom: 1px solid var(--pc-grid-border, #e2e8f0);
    background: var(--pc-grid-bg, #fff);
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .content-header h1 {
    font-size: 1.75rem;
    margin: 0;
    color: var(--pc-grid-fg, #0f172a);
    font-weight: 700;
  }

  .header-badges {
    display: flex;
    gap: 0.5rem;
  }

  .badge {
    background: var(--pc-grid-accent, #0ea5e9);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .badge.loading {
    background: var(--pc-grid-warning, #d97706);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .content-body {
    flex-grow: 1;
    overflow-y: auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: var(--pc-grid-header-bg, #f8fafc);
  }

  .master-form-section {
    background: var(--pc-grid-bg, #fff);
    border-radius: 8px;
    border: 1px solid var(--pc-grid-border, #e2e8f0);
    flex-shrink: 0;
    box-shadow: var(--pc-grid-shadow, 0 1px 2px rgba(0, 0, 0, 0.05));
  }

  .grid-section {
    flex-grow: 1;
    min-height: 300px;
    background: var(--pc-grid-bg, #fff);
    border-radius: 8px;
    border: 1px solid var(--pc-grid-border, #e2e8f0);
    box-shadow: var(--pc-grid-shadow, 0 1px 2px rgba(0, 0, 0, 0.05));
    overflow: hidden;
  }

  .mock-notice {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    color: #92400e;
  }

  .mock-notice p {
    margin: 0;
    font-size: 0.875rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    background: var(--pc-grid-header-bg, #f8fafc);
    border: 1px solid var(--pc-grid-border, #e2e8f0);
    border-radius: 8px;
    color: var(--pc-grid-muted, #64748b);
    text-align: center;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    color: var(--pc-grid-fg, #0f172a);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>
