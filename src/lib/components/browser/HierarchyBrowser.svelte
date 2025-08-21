<!-- src/lib/components/browser/HierarchyBrowser.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { log } from '$lib/utils/logger';
  
  // SVELTE 5 FIX: DO NOT import runes. They are globally available.
  // import { derived } from 'svelte/compiler'; // <-- REMOVED THIS LINE

  // Import entity components
  import SupplierGrid from '$lib/components/suppliers/SupplierGrid.svelte';
  import CategoryGrid from '$lib/components/categories/CategoryGrid.svelte';
  import OfferingGrid from '$lib/components/offerings/OfferingGrid.svelte';
  import AttributeGrid from '$lib/components/attributes/AttributeGrid.svelte';
  import LinkGrid from '$lib/components/links/LinkGrid.svelte';
  import SupplierForm from '$lib/components/suppliers/SupplierForm.svelte';
  import OfferingForm from '$lib/components/offerings/OfferingForm.svelte';

  // --- Component API ---
  
  type NavigationDetail = {
    level: string;
    supplierId?: number;
    categoryId?: number;
    offeringId?: number;
  };
  
  type FormSubmitDetail = {
    type: string;
    data: any;
  };

  let {
    level,
    suppliers,
    categories,
    offerings,
    attributes,
    links,
    selectedSupplier,
    selectedCategory,
    selectedOffering,
    onnavigate,
    onsubmit
  } = $props<{
    level: 'wholesalers' | 'categories' | 'offerings' | 'attributes' | 'links';
    suppliers: any[];
    categories: any[];
    offerings: any[];
    attributes: any[];
    links: any[];
    selectedSupplier: any | null;
    selectedCategory: any | null;
    selectedOffering: any | null;
    onnavigate?: (detail: NavigationDetail) => void;
    onsubmit?: (detail: FormSubmitDetail) => void;
  }>();

  // --- Internal Logic ---

  onMount(() => {
    log.info('HierarchyBrowser component mounted', { level: level, selectedSupplier: selectedSupplier?.name });
  });

  function requestNavigation(detail: NavigationDetail) {
    try {
      log.info('Requesting navigation', detail);
      onnavigate?.(detail);
    } catch (e) {
      log.error('Failed to call onnavigate handler', { error: e, detail });
    }
  }

  function handleSupplierSelect({ row }: {row: any}) {
    requestNavigation({ level: 'categories', supplierId: row.wholesaler_id });
  }

  function handleCategorySelect({ row }: {row: any}) {
    requestNavigation({
      level: 'offerings',
      supplierId: selectedSupplier?.wholesaler_id,
      categoryId: row.category_id
    });
  }

  function handleOfferingSelect({ row }: {row: any}) {
    requestNavigation({
      level: 'attributes',
      supplierId: selectedSupplier?.wholesaler_id,
      categoryId: selectedCategory?.category_id,
      offeringId: row.offering_id
    });
  }
  
  function handleFormSubmit(formType: string, formData: any) {
      const detail = { type: formType, data: formData };
      log.info(`Calling onsubmit handler for '${formType}' form`, { data: formData });
      onsubmit?.(detail);
  }

  // --- Derived Data using $derived rune ---

  const counts = $derived({
    wholesalers: suppliers.length,
    categories: categories.length,
    offerings: offerings.length,
    attributes: attributes.length,
    links: links.length
  });

  const categoriesDisabled = $derived(!selectedSupplier);
  const offeringsDisabled = $derived(!selectedCategory);
  const attributesLinksDisabled = $derived(!selectedOffering);

  const pageTitle = $derived(
    level === 'wholesalers' ? 'Suppliers' :
    level === 'categories' ? 'Categories' :
    level === 'offerings' ? 'Product Offerings' :
    level === 'attributes' ? 'Attributes' : 'Links'
  );

  const mainCount = $derived(
    level === 'wholesalers' ? `${counts.wholesalers} items` :
    level === 'categories' ? `${counts.categories} items` :
    level === 'offerings' ? `${counts.offerings} items` :
    level === 'attributes' ? `${counts.attributes} items` : `${counts.links} items`
  );
</script>

<div class="browser-container">
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Hierarchy Browser</h2>
    </div>
    <div class="sidebar-content">
      <!-- SVELTE 5 FIX: Use onclick instead of on:click -->
      <button type="button" class="sidebar-item" class:active={level === 'wholesalers'} 
        onclick={() => requestNavigation({ level: 'wholesalers' })}>
        <span>Suppliers</span>
        <span class="item-count">{counts.wholesalers}</span>
      </button>

      <button type="button" class="sidebar-item depth-1" class:active={level === 'categories'} 
        disabled={categoriesDisabled} onclick={() => requestNavigation({ level: 'categories', supplierId: selectedSupplier?.wholesaler_id })}>
        <span>Categories</span>
        <span class="item-count">{counts.categories}</span>
      </button>

      <button type="button" class="sidebar-item depth-2" class:active={level === 'offerings'} 
        disabled={offeringsDisabled} onclick={() => requestNavigation({ level: 'offerings', supplierId: selectedSupplier?.wholesaler_id, categoryId: selectedCategory?.category_id })}>
        <span>Product Offerings</span>
        <span class="item-count">{counts.offerings}</span>
      </button>
      
      <button type="button" class="sidebar-item depth-3" class:active={level === 'attributes'} 
        disabled={attributesLinksDisabled} onclick={() => requestNavigation({ level: 'attributes', supplierId: selectedSupplier?.wholesaler_id, categoryId: selectedCategory?.category_id, offeringId: selectedOffering?.offering_id })}>
        <span>Attributes</span>
        <span class="item-count">{counts.attributes}</span>
      </button>

      <button type="button" class="sidebar-item depth-3" class:active={level === 'links'} 
        disabled={attributesLinksDisabled} onclick={() => requestNavigation({ level: 'links', supplierId: selectedSupplier?.wholesaler_id, categoryId: selectedCategory?.category_id, offeringId: selectedOffering?.offering_id })}>
        <span>Links</span>
        <span class="item-count">{counts.links}</span>
      </button>
    </div>
  </div>

  <div class="main-content">
    <div class="content-header">
      <div>
        <h1>{pageTitle}</h1>
        <span class="count-badge">{mainCount}</span>
      </div>
    </div>

    <div class="content-layout">
      {#if selectedSupplier && (level === 'categories' || level === 'offerings' || level === 'attributes' || level === 'links')}
        <div class="master-form-section">
          {#if level === 'categories' && selectedSupplier}
            <SupplierForm 
              supplier={selectedSupplier}
              isEditing={true}
              mode="client"
              onsubmit={(e) => handleFormSubmit('supplier', e.supplier)}
              oncancel={() => log.info('Supplier form cancelled.')}
            />
          {/if}

          {#if level === 'offerings' && selectedCategory}
            <div class="category-header">
                <h3>Category: {selectedCategory.name}</h3>
                <p>{selectedCategory.description}</p>
            </div>
          {/if}

          {#if (level === 'attributes' || level === 'links') && selectedOffering}
            <OfferingForm 
              offering={selectedOffering}
              isEditing={true}
              mode="client"
              onsubmit={(e) => handleFormSubmit('offering', e.offering)}
              oncancel={() => log.info('Offering form cancelled.')}
            />
          {/if}
        </div>
      {/if}

      <div class="grid-section">
        {#if level === 'wholesalers'}
          <SupplierGrid suppliers={suppliers} onrowclick={handleSupplierSelect} height="100%" />
        {/if}
        
        {#if level === 'categories'}
          {#if selectedSupplier}
            <CategoryGrid categories={categories} onrowclick={handleCategorySelect} height="100%" />
          {:else}
            <div class="empty-state"><h3>No Supplier selected</h3><p>Please select a supplier from the list.</p></div>
          {/if}
        {/if}

        {#if level === 'offerings'}
          {#if selectedCategory}
            <OfferingGrid offerings={offerings} onrowclick={handleOfferingSelect} height="100%" />
          {:else}
            <div class="empty-state"><h3>No Category selected</h3><p>Please select a category to view its offerings.</p></div>
          {/if}
        {/if}

        {#if level === 'attributes'}
          {#if selectedOffering}
            <AttributeGrid attributes={attributes} height="100%" />
          {:else}
            <div class="empty-state"><h3>No Offering selected</h3><p>Please select an offering to view its attributes.</p></div>
          {/if}
        {/if}

        {#if level === 'links'}
          {#if selectedOffering}
            <LinkGrid links={links} height="100%" />
          {:else}
            <div class="empty-state"><h3>No Offering selected</h3><p>Please select an offering to view its links.</p></div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .browser-container { display: flex; height: 100vh; }
  .sidebar { width: 300px; background: #f8fafc; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
  .sidebar-header { padding: 1.5rem; border-bottom: 1px solid #e2e8f0; }
  .sidebar-header h2 { font-size: 1.25rem; color: #0f172a; }
  .sidebar-content { flex: 1; padding: 1rem 0; }
  .sidebar-item { width: 100%; padding: 0.75rem 1.5rem; border: none; background: transparent; text-align: left; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center; color: #1e293b; }
  .sidebar-item.depth-1 { padding-left: 2.5rem; }
  .sidebar-item.depth-2 { padding-left: 3.5rem; }
  .sidebar-item.depth-3 { padding-left: 4.5rem; }
  .sidebar-item:hover:not(:disabled) { background: #e2e8f0; }
  .sidebar-item.active { background: #4f46e5; color: white; }
  
  /* SVELTE 5 FIX: Use :disabled pseudo-class selector */
  .sidebar-item:disabled { 
    opacity: 0.5; 
    cursor: not-allowed; 
    color: #64748b; 
  }

  .item-count { background: rgba(0,0,0,0.1); padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
  .sidebar-item.active .item-count { background: rgba(255,255,255,0.2); }
  .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .content-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; border-bottom: 1px solid #e2e8f0; background: white; }
  .content-header h1 { font-size: 1.75rem; color: #0f172a; margin: 0; }
  .count-badge { background: #4f46e5; color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.875rem; font-weight: 500; margin-left: 1rem; }
  .content-layout { flex: 1; display: flex; flex-direction: column; overflow: hidden; background-color: #f1f5f9; }
  .master-form-section { background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
  .category-header { padding: 1.5rem 2rem; }
  .category-header h3 { margin: 0 0 0.5rem 0; }
  .category-header p { margin: 0; color: var(--color-muted); }
  .grid-section { flex: 1; overflow-y: auto; padding: 2rem; display: flex; flex-direction: column; min-height: 0; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; text-align: center; background-color: #f8fafc; border-radius: 8px; border: 1px dashed var(--color-border); }
  .empty-state h3 { margin: 0 0 0.5rem 0; }
  .empty-state p { margin: 0; }
</style>