<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { log } from '$lib/utils/logger';
  
  // Import CSS styles
  import '$lib/components/styles/grid.css';
  import '$lib/components/styles/form.css';
  
  // Import components
  import HierarchySidebar from '$lib/components/browser/HierarchySidebar.svelte';
  import SupplierGrid from '$lib/components/suppliers/SupplierGrid.svelte';
  import SupplierForm from '$lib/components/suppliers/SupplierForm.svelte';
  import CategoryGrid from '$lib/components/categories/CategoryGrid.svelte';
  
  // Import types
  import type { Level, Wholesaler, WholesalerCategory } from '$lib/domain/types';

  // ===== EXTENDED TYPES FOR MOCK DATA =====
  type WholesalerCategoryWithCount = WholesalerCategory & {
    offering_count?: number;
  };

  // ===== MOCK DATA =====
  const mockData: {
    wholesalers: Wholesaler[];
    categories: { [key: number]: WholesalerCategoryWithCount[] };
  } = {
    wholesalers: [
      { 
        wholesaler_id: 1, 
        name: 'Global Tech Supply', 
        region: 'USA', 
        status: 'active', 
        dropship: true, 
        website: 'https://globaltech.example',
        created_at: '2024-01-15T10:00:00Z'
      },
      { 
        wholesaler_id: 2, 
        name: 'Euro Electronics', 
        region: 'Germany', 
        status: 'new', 
        dropship: false, 
        website: 'https://euroelec.example',
        created_at: '2024-02-20T14:30:00Z'
      },
      { 
        wholesaler_id: 3, 
        name: 'Asia Components Ltd', 
        region: 'China', 
        status: 'inactive', 
        dropship: true, 
        website: 'https://asiacomp.example',
        created_at: '2024-01-05T08:15:00Z'
      }
    ],
    
    categories: {
      1: [
        { 
          wholesaler_id: 1, 
          category_id: 1, 
          name: 'Laptops', 
          comment: 'High demand products',
          link: 'https://example.com/laptops',
          created_at: '2024-01-16T10:00:00Z',
          offering_count: 15
        },
        { 
          wholesaler_id: 1, 
          category_id: 2, 
          name: 'Smartphones', 
          comment: 'Fast moving inventory',
          created_at: '2024-01-17T10:00:00Z',
          offering_count: 25
        }
      ],
      2: [
        { 
          wholesaler_id: 2, 
          category_id: 4, 
          name: 'Tablets', 
          comment: 'European market focus',
          created_at: '2024-02-21T14:30:00Z',
          offering_count: 8
        },
        { 
          wholesaler_id: 2, 
          category_id: 5, 
          name: 'Gaming Equipment', 
          comment: 'Growing segment',
          link: 'https://example.com/gaming',
          created_at: '2024-02-22T14:30:00Z',
          offering_count: 12
        }
      ],
      3: [
        { 
          wholesaler_id: 3, 
          category_id: 3, 
          name: 'Accessories', 
          comment: 'Various tech accessories',
          created_at: '2024-01-06T08:15:00Z',
          offering_count: 45
        }
      ]
    }
  };

  // ===== URL-DRIVEN STATE (Svelte 5 Runes) =====
  const currentLevel = $derived(($page.url.searchParams.get('level') as Level) || 'wholesalers');
  const selectedSupplierId = $derived(Number($page.url.searchParams.get('supplierId')) || null);
  const selectedCategoryId = $derived(Number($page.url.searchParams.get('categoryId')) || null);

  // ===== DERIVED STATE =====
  const selectedSupplier = $derived(
    selectedSupplierId ? mockData.wholesalers.find(s => s.wholesaler_id === selectedSupplierId) || null : null
  );
  
  const selectedCategory = $derived(
    selectedCategoryId && selectedSupplier && selectedSupplier.wholesaler_id ? 
    (mockData.categories[selectedSupplier.wholesaler_id] || []).find((c: WholesalerCategoryWithCount) => c.category_id === selectedCategoryId) || null : null
  );
  
  const categoriesForSupplier = $derived(
    selectedSupplier && selectedSupplier.wholesaler_id ? mockData.categories[selectedSupplier.wholesaler_id] ?? [] : []
  );

  // Sidebar data
  const counts = $derived({
    wholesalers: mockData.wholesalers.length,
    categories: categoriesForSupplier.length,
    offerings: 0, // Not implemented yet
    attributes: 0, // Not implemented yet
    links: 0 // Not implemented yet
  });

  const sidebarItems = $derived([
    {
      key: 'wholesalers',
      label: `Suppliers (${counts.wholesalers})`,
      disabled: false,
      level: 0
    },
    {
      key: 'categories',
      label: `Categories (${counts.categories})`,
      disabled: !selectedSupplier,
      level: 1
    },
    {
      key: 'offerings',
      label: 'Product Offerings (0)',
      disabled: !selectedCategory,
      level: 2
    },
    {
      key: 'attributes',
      label: 'Attributes (0)',
      disabled: true, // Not implemented yet
      level: 3
    },
    {
      key: 'links',
      label: 'Links (0)',
      disabled: true, // Not implemented yet
      level: 3
    }
  ]);

  // ===== URL UPDATE FUNCTION =====
  function updateURL(params: { 
    level?: Level, 
    supplierId?: number | null | undefined, 
    categoryId?: number | null | undefined
  }) {
    const searchParams = new URLSearchParams($page.url.searchParams);
    
    if (params.level !== undefined) searchParams.set('level', params.level);
    if (params.supplierId !== undefined) {
      if (params.supplierId) {
        searchParams.set('supplierId', params.supplierId.toString());
      } else {
        searchParams.delete('supplierId');
      }
    }
    if (params.categoryId !== undefined) {
      if (params.categoryId) {
        searchParams.set('categoryId', params.categoryId.toString());
      } else {
        searchParams.delete('categoryId');
      }
    }

    goto(`?${searchParams.toString()}`, { replaceState: true, noScroll: true });
  }

  // ===== NAVIGATION HANDLERS =====
  function handleSidebarNavigation(event: CustomEvent<{ key: string }>) {
    const level = event.detail.key as Level;
    log.info('Sidebar navigation', { from: currentLevel, to: level });
    
    switch (level) {
      case 'wholesalers':
        updateURL({ level, supplierId: null, categoryId: null });
        break;
      case 'categories':
        if (!selectedSupplier) return;
        updateURL({ level, categoryId: null });
        break;
      case 'offerings':
        if (!selectedCategory) return;
        updateURL({ level });
        break;
    }
  }

  // ===== ROW SELECTION HANDLERS =====
  function handleSupplierSelect(supplier: Wholesaler) {
    log.info('Supplier selected', { supplierId: supplier.wholesaler_id, name: supplier.name });
    updateURL({
      level: 'categories',
      supplierId: supplier.wholesaler_id ?? null,
      categoryId: null
    });
  }

  function handleCategorySelect(category: WholesalerCategoryWithCount) {
    log.info('Category selected', { categoryId: category.category_id, name: category.name });
    updateURL({
      level: 'offerings',
      categoryId: category.category_id
    });
  }

  // Silence unused warnings (handlers will be used when Grid components support rowclick)
  void handleSupplierSelect; void handleCategorySelect;

  // ===== DELETE HANDLERS =====
  async function handleSupplierDelete(ids: (string | number)[]) {
    log.info('Mock: Delete suppliers', { ids });
    alert(`MOCK: Would delete suppliers with IDs: ${ids.join(', ')}`);
  }

  async function handleCategoryDelete(ids: (string | number)[]) {
    log.info('Mock: Remove categories', { ids });
    alert(`MOCK: Would remove category assignments with IDs: ${ids.join(', ')}`);
  }

  // // ===== FORM HANDLERS =====
  // function handleSupplierSubmit(p: { data: Record<string, any>; result: unknown }) {
  //   log.info('Mock: Supplier form submitted', p);
  //   alert('MOCK: Supplier saved successfully!');
  // }

  // function handleSupplierCancel(p: { data: Record<string, any>; reason?: string }) {
  //   log.info('Mock: Supplier form cancelled', p);
  // }

  // ===== COMPUTED PROPS =====
  const pageTitle = $derived(() => {
    if (currentLevel === 'wholesalers') return 'Suppliers';
    if (currentLevel === 'categories' && selectedSupplier) return `Categories for ${selectedSupplier.name}`;
    if (currentLevel === 'offerings' && selectedCategory) return `Offerings in ${selectedCategory.name}`;
    return 'Supplier Browser';
  });

  // Loading state (mock)
  let loading = $state(false);
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
      on:select={handleSidebarNavigation}
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
          <span class="badge">Category: {selectedCategory.name}</span>
        {/if}
      </div>
    </div>
    
    <div class="content-body">
      <!-- EBENE 2: SupplierForm oben + CategoryGrid unten -->
      {#if currentLevel === 'categories' && selectedSupplier}
        <div class="master-form-section">
          <SupplierForm 
            initial={selectedSupplier}
            disabled={false}
          />
        </div>
      {/if}

      <!-- GRIDS -->
      <div class="grid-section">
        {#if currentLevel === 'wholesalers'}
          <SupplierGrid 
            rows={mockData.wholesalers} 
            {loading}
            executeDelete={handleSupplierDelete}
            onRowClick={handleSupplierSelect}
          />
          
        {:else if currentLevel === 'categories'}
          <CategoryGrid 
            rows={categoriesForSupplier} 
            {loading}
            showOfferingCount={true}
            executeDelete={handleCategoryDelete}
          />
          
        {:else if currentLevel === 'offerings'}
          <div class="empty-state">
            <h3>Offerings Grid</h3>
            <p>Not implemented yet - coming in next phase!</p>
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
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }

  .sidebar {
    flex-shrink: 0;
    width: 300px;
    background: var(--pc-grid-header-bg, #f8fafc);
    border-right: 1px solid var(--pc-grid-border, #e2e8f0);
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
    box-shadow: var(--pc-grid-shadow, 0 1px 2px rgba(0,0,0,.05));
  }

  .grid-section {
    flex-grow: 1;
    min-height: 300px;
    background: var(--pc-grid-bg, #fff);
    border-radius: 8px;
    border: 1px solid var(--pc-grid-border, #e2e8f0);
    box-shadow: var(--pc-grid-shadow, 0 1px 2px rgba(0,0,0,.05));
    overflow: hidden;
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
</style>