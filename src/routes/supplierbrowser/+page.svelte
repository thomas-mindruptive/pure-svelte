<script lang="ts">
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";

  // Dummy Data
  const wholesalers = [
    { wholesaler_id: 1, name: "Global Tech Supply", region: "USA", status: "active", dropship: true },
    { wholesaler_id: 2, name: "Euro Electronics", region: "Germany", status: "active", dropship: false },
    { wholesaler_id: 3, name: "Asia Components Ltd", region: "China", status: "inactive", dropship: true },
  ];

  const categories = [
    { category_id: 1, wholesaler_id: 1, name: "Laptops", description: "Portable computers" },
    { category_id: 2, wholesaler_id: 1, name: "Smartphones", description: "Mobile devices" },
    { category_id: 3, wholesaler_id: 1, name: "Accessories", description: "Tech accessories" },
    { category_id: 4, wholesaler_id: 2, name: "Tablets", description: "Tablet computers" },
    { category_id: 5, wholesaler_id: 2, name: "Gaming", description: "Gaming equipment" },
  ];

  const itemOfferings = [
    { offering_id: 1, category_id: 1, product_name: "MacBook Pro 14", price: 1999.99, stock: 25, status: "active" },
    { offering_id: 2, category_id: 1, product_name: "Dell XPS 13", price: 1299.99, stock: 15, status: "active" },
    { offering_id: 3, category_id: 2, product_name: "iPhone 15 Pro", price: 999.99, stock: 50, status: "active" },
    { offering_id: 4, category_id: 2, product_name: "Samsung Galaxy S24", price: 899.99, stock: 30, status: "active" },
    { offering_id: 5, category_id: 3, product_name: "USB-C Hub", price: 49.99, stock: 100, status: "active" },
  ];

  const attributes = [
    { attribute_id: 1, offering_id: 1, name: "Color", value: "Space Gray", category: "Physical" },
    { attribute_id: 2, offering_id: 1, name: "RAM", value: "16GB", category: "Technical" },
    { attribute_id: 3, offering_id: 1, name: "Storage", value: "512GB SSD", category: "Technical" },
    { attribute_id: 4, offering_id: 2, name: "Color", value: "Silver", category: "Physical" },
    { attribute_id: 5, offering_id: 3, name: "Color", value: "Natural Titanium", category: "Physical" },
  ];

  const offeringLinks = [
    { link_id: 1, offering_id: 1, url: "https://apple.com/macbook-pro", type: "Product Page", description: "Official product page" },
    { link_id: 2, offering_id: 1, url: "https://specs.apple.com/macbook", type: "Specifications", description: "Technical specifications" },
    { link_id: 3, offering_id: 2, url: "https://dell.com/xps13", type: "Product Page", description: "Dell official page" },
    { link_id: 4, offering_id: 3, url: "https://apple.com/iphone", type: "Product Page", description: "iPhone product page" },
  ];

  // Navigation State
  type HierarchyLevel = 'wholesalers' | 'categories' | 'offerings' | 'attributes' | 'links';
  
  let currentLevel: HierarchyLevel = 'wholesalers';
  let selectedWholesaler: any = null;
  let selectedCategory: any = null;
  let selectedOffering: any = null;
  let selectedAttribute: any = null;
  
  // Detail Form State
  let showDetailForm = false;
  let detailFormData: any = null;
  let detailFormType: string = '';
  let isEditing = false;

  // Master-Detail Logic: Master ist immer der Parent der aktuellen Detail-Ebene
  $: currentMaster = (() => {
    switch (currentLevel) {
      case 'wholesalers': return null; // Keine Parent-Ebene
      case 'categories': return selectedWholesaler;
      case 'offerings': return selectedCategory;
      case 'attributes': return selectedOffering;
      case 'links': return selectedOffering; // Links gehören auch zu Offering
      default: return null;
    }
  })();

  $: currentMasterType = (() => {
    switch (currentLevel) {
      case 'categories': return 'wholesaler';
      case 'offerings': return 'category';
      case 'attributes': return 'offering';
      case 'links': return 'offering';
      default: return null;
    }
  })();

  // Auto-show Master Form when level changes
  $: if (currentMaster && currentMasterType) {
    detailFormData = { ...currentMaster };
    detailFormType = currentMasterType;
    showDetailForm = true;
    isEditing = true;
  } else {
    showDetailForm = false;
    detailFormData = null;
    detailFormType = '';
  }

  // Column Definitions
  const wholesalerColumns: ColumnDefinition[] = [
    { key: "name", title: "Supplier Name", sortable: true, width: "3fr" },
    { key: "region", title: "Region", sortable: true, width: "1fr" },
    { key: "status", title: "Status", sortable: true, width: "1fr" },
    { key: "dropship", title: "Dropship", sortable: false, width: "1fr" },
  ];

  const categoryColumns: ColumnDefinition[] = [
    { key: "name", title: "Category", sortable: true, width: "2fr" },
    { key: "description", title: "Description", sortable: false, width: "3fr" },
  ];

  const offeringColumns: ColumnDefinition[] = [
    { key: "product_name", title: "Product", sortable: true, width: "3fr" },
    { key: "price", title: "Price", sortable: true, type: "number", width: "1fr" },
    { key: "stock", title: "Stock", sortable: true, type: "number", width: "1fr" },
    { key: "status", title: "Status", sortable: true, width: "1fr" },
  ];

  const attributeColumns: ColumnDefinition[] = [
    { key: "name", title: "Attribute", sortable: true, width: "1fr" },
    { key: "value", title: "Value", sortable: false, width: "2fr" },
    { key: "category", title: "Category", sortable: true, width: "1fr" },
  ];

  const linkColumns: ColumnDefinition[] = [
    { key: "url", title: "URL", sortable: false, width: "3fr" },
    { key: "type", title: "Type", sortable: true, width: "1fr" },
    { key: "description", title: "Description", sortable: false, width: "2fr" },
  ];

  // Computed Data
  $: filteredCategories = selectedWholesaler 
    ? categories.filter(c => c.wholesaler_id === selectedWholesaler.wholesaler_id)
    : [];

  $: filteredOfferings = selectedCategory 
    ? itemOfferings.filter(o => o.category_id === selectedCategory.category_id)
    : [];

  $: filteredAttributes = selectedOffering 
    ? attributes.filter(a => a.offering_id === selectedOffering.offering_id)
    : [];

  $: filteredLinks = selectedOffering 
    ? offeringLinks.filter(l => l.offering_id === selectedOffering.offering_id)
    : [];

  // Current Data for Display
  $: currentData = (() => {
    switch (currentLevel) {
      case 'wholesalers': return wholesalers;
      case 'categories': return filteredCategories;
      case 'offerings': return filteredOfferings;
      case 'attributes': return filteredAttributes;
      case 'links': return filteredLinks;
      default: return [];
    }
  })();

  $: currentColumns = (() => {
    switch (currentLevel) {
      case 'wholesalers': return wholesalerColumns;
      case 'categories': return categoryColumns;
      case 'offerings': return offeringColumns;
      case 'attributes': return attributeColumns;
      case 'links': return linkColumns;
      default: return [];
    }
  })();

  // Breadcrumb
  $: breadcrumb = (() => {
    const items: Array<{ text: string; level: HierarchyLevel }> = [];
    if (selectedWholesaler) items.push({ text: selectedWholesaler.name, level: 'wholesalers' as HierarchyLevel });
    if (selectedCategory) items.push({ text: selectedCategory.name, level: 'categories' as HierarchyLevel });
    if (selectedOffering) items.push({ text: selectedOffering.product_name, level: 'offerings' as HierarchyLevel });
    if (selectedAttribute && currentLevel === 'links') items.push({ text: selectedAttribute.name, level: 'attributes' as HierarchyLevel });
    return items;
  })();

  // Navigation Functions
  function navigateToLevel(level: HierarchyLevel) {
    currentLevel = level;
    // NICHT automatisch das Form verstecken - das wird separat gesteuert
    // hideDetailForm();
  }

  function navigateToBreadcrumb(level: HierarchyLevel) {
    currentLevel = level;
    // Reset deeper selections when going up
    if (level === 'wholesalers') {
      selectedCategory = null;
      selectedOffering = null;
      selectedAttribute = null;
    } else if (level === 'categories') {
      selectedOffering = null;
      selectedAttribute = null;
    } else if (level === 'offerings') {
      selectedAttribute = null;
    }
    // Breadcrumb-Navigation versteckt das Form (User will navigieren)
    hideDetailForm();
  }

  function selectWholesaler(wholesaler: any) {
    selectedWholesaler = wholesaler;
    selectedCategory = null;
    selectedOffering = null;
    selectedAttribute = null;
    navigateToLevel('categories');
  }

  function selectCategory(category: any) {
    selectedCategory = category;
    selectedOffering = null;
    selectedAttribute = null;
    navigateToLevel('offerings');
  }

  function selectOffering(offering: any) {
    selectedOffering = offering;
    selectedAttribute = null;
    navigateToLevel('attributes');
  }

  function selectAttribute(attribute: any) {
    selectedAttribute = attribute;
    navigateToLevel('links');
  }

  // Detail Form Functions (für manuelle Steuerung)
  function showDetailFormFor(item: any) {
    detailFormData = { ...item };
    detailFormType = currentLevel.slice(0, -1); // Remove 's' from plural
    showDetailForm = true;
    isEditing = true;
  }

  function showCreateForm() {
    const emptyData = (() => {
      switch (currentLevel) {
        case 'wholesalers': 
          return { name: '', region: '', status: 'active', dropship: false };
        case 'categories': 
          return { name: '', description: '', wholesaler_id: selectedWholesaler?.wholesaler_id };
        case 'offerings': 
          return { product_name: '', price: 0, stock: 0, status: 'active', category_id: selectedCategory?.category_id };
        case 'attributes': 
          return { name: '', value: '', category: 'Physical', offering_id: selectedOffering?.offering_id };
        case 'links': 
          return { url: '', type: 'Product Page', description: '', offering_id: selectedOffering?.offering_id };
        default: 
          return {};
      }
    })();
    
    // Override automatic master form to show create form
    detailFormData = emptyData;
    detailFormType = currentLevel.slice(0, -1);
    showDetailForm = true;
    isEditing = false;
  }

  function hideDetailForm() {
    // Wenn ein Auto-Master vorhanden ist, zurück zu dem
    if (currentMaster && currentMasterType) {
      detailFormData = { ...currentMaster };
      detailFormType = currentMasterType;
      showDetailForm = true;
      isEditing = true;
    } else {
      // Sonst komplett verstecken
      showDetailForm = false;
      detailFormData = null;
      detailFormType = '';
    }
  }

  function handleRowClick(event: { row: any }) {
    const item = event.row;
    
    // Zur nächsten Hierarchie-Ebene navigieren
    // Das Master-Form wird automatisch durch die reaktiven Statements gesetzt
    switch (currentLevel) {
      case 'wholesalers':
        selectWholesaler(item);
        break;
      case 'categories':
        selectCategory(item);
        break;
      case 'offerings':
        selectOffering(item);
        break;
      case 'attributes':
        selectAttribute(item);
        break;
    }
  }

  // Sidebar navigation items
  $: sidebarItems = [
    {
      level: 'wholesalers' as HierarchyLevel,
      text: 'Suppliers',
      count: wholesalers.length,
      active: currentLevel === 'wholesalers',
      enabled: true,
      depth: 0
    },
    {
      level: 'categories' as HierarchyLevel,
      text: 'Categories',
      count: filteredCategories.length,
      active: currentLevel === 'categories',
      enabled: !!selectedWholesaler,
      depth: 1
    },
    {
      level: 'offerings' as HierarchyLevel,
      text: 'Product Offerings',
      count: filteredOfferings.length,
      active: currentLevel === 'offerings',
      enabled: !!selectedCategory,
      depth: 2
    },
    {
      level: 'attributes' as HierarchyLevel,
      text: 'Attributes',
      count: filteredAttributes.length,
      active: currentLevel === 'attributes',
      enabled: !!selectedOffering,
      depth: 3
    },
    {
      level: 'links' as HierarchyLevel,
      text: 'Links',
      count: filteredLinks.length,
      active: currentLevel === 'links',
      enabled: !!selectedOffering,
      depth: 3
    }
  ];
</script>

<svelte:head>
  <title>Supplier Browser</title>
</svelte:head>

<div class="browser-container">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Navigation</h2>
    </div>
    
    <div class="sidebar-content">
      {#each sidebarItems as item}
        <button
          class="sidebar-item"
          class:active={item.active}
          class:disabled={!item.enabled}
          style="--depth: {item.depth}"
          disabled={!item.enabled}
          on:click={() => navigateToLevel(item.level)}
        >
          <span class="item-text">{item.text}</span>
          <span class="item-count">{item.count}</span>
        </button>
      {/each}
    </div>

    <!-- Current Selection Info -->
    <div class="sidebar-footer">
      <div class="selection-info">
        {#if selectedWholesaler}
          <div class="selection-item">
            <strong>Supplier:</strong> {selectedWholesaler.name}
          </div>
        {/if}
        {#if selectedCategory}
          <div class="selection-item">
            <strong>Category:</strong> {selectedCategory.name}
          </div>
        {/if}
        {#if selectedOffering}
          <div class="selection-item">
            <strong>Offering:</strong> {selectedOffering.product_name}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="main-content">
    <!-- Breadcrumb -->
    <div class="breadcrumb">
      <button class="breadcrumb-item" on:click={() => navigateToBreadcrumb('wholesalers')}>
        Suppliers
      </button>
      {#each breadcrumb as item, index}
        <span class="breadcrumb-separator">›</span>
        <button class="breadcrumb-item" on:click={() => navigateToBreadcrumb(item.level)}>
          {item.text}
        </button>
      {/each}
    </div>

    <!-- Content Header -->
    <div class="content-header">
      <h1>
        {currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1)}
      </h1>
      <!-- Create button nur für Wholesalers, da andere Levels Create-Form unten haben -->
      {#if currentLevel === 'wholesalers'}
        <button class="primary-button" on:click={showCreateForm}>
          + Add {detailFormType || currentLevel.slice(0, -1)}
        </button>
      {/if}
    </div>

    <!-- Main Content Layout: Master oben, Detail mitte, Create unten -->
    <div class="content-layout">
      <!-- Master Form Section (oben) -->
      {#if showDetailForm && detailFormData && isEditing}
        <div class="master-form-section">
          <div class="form-header">
            <h3>Edit {detailFormType.charAt(0).toUpperCase() + detailFormType.slice(1)}</h3>
            <button class="close-button" on:click={hideDetailForm}>×</button>
          </div>

          <form class="master-form" on:submit|preventDefault>
            <div class="form-grid">
              {#if detailFormType === 'wholesaler'}
                <div class="form-group">
                  <label for="name">Name</label>
                  <input id="name" bind:value={detailFormData.name} type="text" required />
                </div>
                <div class="form-group">
                  <label for="region">Region</label>
                  <input id="region" bind:value={detailFormData.region} type="text" />
                </div>
                <div class="form-group">
                  <label for="status">Status</label>
                  <select id="status" bind:value={detailFormData.status}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div class="form-group checkbox-group">
                  <input id="dropship" bind:checked={detailFormData.dropship} type="checkbox" />
                  <label for="dropship">Offers Dropshipping</label>
                </div>

              {:else if detailFormType === 'category'}
                <div class="form-group">
                  <label for="name">Category Name</label>
                  <input id="name" bind:value={detailFormData.name} type="text" required />
                </div>
                <div class="form-group span-2">
                  <label for="description">Description</label>
                  <input id="description" bind:value={detailFormData.description} type="text" />
                </div>

              {:else if detailFormType === 'offering'}
                <div class="form-group">
                  <label for="product_name">Product Name</label>
                  <input id="product_name" bind:value={detailFormData.product_name} type="text" required />
                </div>
                <div class="form-group">
                  <label for="price">Price</label>
                  <input id="price" bind:value={detailFormData.price} type="number" step="0.01" />
                </div>
                <div class="form-group">
                  <label for="stock">Stock</label>
                  <input id="stock" bind:value={detailFormData.stock} type="number" />
                </div>
                <div class="form-group">
                  <label for="status">Status</label>
                  <select id="status" bind:value={detailFormData.status}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              {/if}
            </div>

            <div class="form-actions">
              <button type="submit" class="primary-button">
                Update {detailFormType.charAt(0).toUpperCase() + detailFormType.slice(1)}
              </button>
            </div>
          </form>
        </div>
      {/if}

      <!-- Detail Grid Section (mitte) -->
      <div class="detail-grid-section" class:full-height={!showDetailForm}>
        {#if currentData.length > 0}
          <Datagrid
            rows={currentData}
            columns={currentColumns}
            onsort={() => {}}
            ondelete={() => {}}
            showDelete={false}
            height="100%"
          >
            <div slot="cell" let:row let:column let:value>
              {#if column.key === "price"}
                ${value.toFixed(2)}
              {:else if column.key === "dropship"}
                {value ? "✅" : "❌"}
              {:else if column.key === "url"}
                <a href={value} target="_blank" rel="noopener">{value}</a>
              {:else}
                <button class="cell-button" on:click={() => handleRowClick({ row })}>
                  {value || "-"}
                </button>
              {/if}
            </div>
          </Datagrid>
        {:else}
          <div class="empty-state">
            <h3>No {currentLevel} found</h3>
            <p>
              {#if currentLevel === 'categories' && !selectedWholesaler}
                Please select a supplier first.
              {:else if currentLevel === 'offerings' && !selectedCategory}
                Please select a category first.
              {:else if (currentLevel === 'attributes' || currentLevel === 'links') && !selectedOffering}
                Please select a product offering first.
              {:else}
                No data available. Use the form below to create the first entry.
              {/if}
            </p>
          </div>
        {/if}
      </div>

      <!-- Create Form Section (unten) -->
      {#if currentLevel !== 'wholesalers'}
        <div class="create-form-section">
          <div class="form-header">
            <h3>Add New {currentLevel.slice(0, -1).charAt(0).toUpperCase() + currentLevel.slice(0, -1).slice(1)}</h3>
          </div>

          <form class="create-form" on:submit|preventDefault>
            <div class="form-grid">
              {#if currentLevel === 'categories'}
                <div class="form-group">
                  <label for="new_name">Category Name</label>
                  <input id="new_name" type="text" placeholder="Enter category name..." required />
                </div>
                <div class="form-group span-2">
                  <label for="new_description">Description</label>
                  <input id="new_description" type="text" placeholder="Enter description..." />
                </div>

              {:else if currentLevel === 'offerings'}
                <div class="form-group">
                  <label for="new_product_name">Product Name</label>
                  <input id="new_product_name" type="text" placeholder="Enter product name..." required />
                </div>
                <div class="form-group">
                  <label for="new_price">Price</label>
                  <input id="new_price" type="number" step="0.01" placeholder="0.00" />
                </div>
                <div class="form-group">
                  <label for="new_stock">Stock</label>
                  <input id="new_stock" type="number" placeholder="0" />
                </div>
                <div class="form-group">
                  <label for="new_status">Status</label>
                  <select id="new_status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

              {:else if currentLevel === 'attributes'}
                <div class="form-group">
                  <label for="new_attr_name">Attribute Name</label>
                  <input id="new_attr_name" type="text" placeholder="e.g., Color, RAM..." required />
                </div>
                <div class="form-group">
                  <label for="new_value">Value</label>
                  <input id="new_value" type="text" placeholder="e.g., Red, 16GB..." />
                </div>
                <div class="form-group">
                  <label for="new_category">Category</label>
                  <select id="new_category">
                    <option value="Physical">Physical</option>
                    <option value="Technical">Technical</option>
                    <option value="Marketing">Marketing</option>
                  </select>
                </div>

              {:else if currentLevel === 'links'}
                <div class="form-group span-2">
                  <label for="new_url">URL</label>
                  <input id="new_url" type="url" placeholder="https://..." required />
                </div>
                <div class="form-group">
                  <label for="new_type">Type</label>
                  <select id="new_type">
                    <option value="Product Page">Product Page</option>
                    <option value="Specifications">Specifications</option>
                    <option value="Documentation">Documentation</option>
                    <option value="Support">Support</option>
                  </select>
                </div>
                <div class="form-group span-2">
                  <label for="new_description">Description</label>
                  <input id="new_description" type="text" placeholder="Brief description..." />
                </div>
              {/if}
            </div>

            <div class="form-actions">
              <button type="submit" class="primary-button">
                Add {currentLevel.slice(0, -1).charAt(0).toUpperCase() + currentLevel.slice(0, -1).slice(1)}
              </button>
            </div>
          </form>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .browser-container {
    display: flex;
    height: 100vh;
    background: var(--color-background, #fff);
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    background: #f8fafc;
    border-right: 1px solid var(--color-border, #e2e8f0);
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--color-heading, #0f172a);
  }

  .sidebar-content {
    flex: 1;
    padding: 1rem 0;
  }

  .sidebar-item {
    width: 100%;
    padding: 0.75rem 1.5rem;
    padding-left: calc(1.5rem + var(--depth, 0) * 1rem);
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--color-text, #1e293b);
  }

  .sidebar-item:hover:not(.disabled) {
    background: #e2e8f0;
  }

  .sidebar-item.active {
    background: var(--color-primary, #4f46e5);
    color: white;
  }

  .sidebar-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: var(--color-muted, #64748b);
  }

  .item-text {
    font-weight: 500;
  }

  .item-count {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .sidebar-item.active .item-count {
    background: rgba(255, 255, 255, 0.2);
  }

  .sidebar-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border, #e2e8f0);
    background: #f1f5f9;
  }

  .selection-info {
    font-size: 0.875rem;
  }

  .selection-item {
    margin-bottom: 0.5rem;
    color: var(--color-text, #1e293b);
  }

  .selection-item:last-child {
    margin-bottom: 0;
  }

  /* Main Content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    padding: 1rem 2rem;
    background: #f8fafc;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    font-size: 0.875rem;
  }

  .breadcrumb-item {
    background: transparent;
    border: none;
    color: var(--color-primary, #4f46e5);
    cursor: pointer;
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .breadcrumb-item:hover {
    background: rgba(79, 70, 229, 0.1);
  }

  .breadcrumb-separator {
    margin: 0 0.5rem;
    color: var(--color-muted, #64748b);
  }

  .content-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }

  .content-header h1 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--color-heading, #0f172a);
  }

  /* Content Layout: Master oben, Detail mitte, Create unten */
  .content-layout {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Master Form Section (oben) */
  .master-form-section {
    background: #f8fafc;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    flex-shrink: 0;
  }

  /* Create Form Section (unten) */
  .create-form-section {
    background: #fefefe;
    border-top: 1px solid var(--color-border, #e2e8f0);
    flex-shrink: 0;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    background: white;
  }

  .form-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--color-heading, #0f172a);
  }

  .close-button {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--color-muted, #64748b);
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: #e2e8f0;
    color: var(--color-text, #1e293b);
  }

  .master-form,
  .create-form {
    padding: 1.5rem 2rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .form-group.span-2 {
    grid-column: span 2;
  }

  .form-group.checkbox-group {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .form-group.checkbox-group input {
    width: auto;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--color-heading, #0f172a);
    font-size: 0.875rem;
  }

  .form-group input,
  .form-group select {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary, #4f46e5);
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  /* Detail Grid Section (mitte) */
  .detail-grid-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 2rem;
    min-height: 0; /* Wichtig für Flex-Shrinking */
  }

  .detail-grid-section.full-height {
    /* Wenn keine Master-Form sichtbar ist, nimmt das Grid die ganze Höhe */
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--color-muted, #64748b);
  }

  .empty-state h3 {
    margin-bottom: 0.5rem;
    color: var(--color-heading, #0f172a);
  }

  .empty-state p {
    max-width: 400px;
  }

  .cell-button {
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    color: inherit;
    padding: 0;
    width: 100%;
    transition: color 0.2s ease;
  }

  .cell-button:hover {
    color: var(--color-primary, #4f46e5);
  }

  /* Buttons */
  .primary-button {
    padding: 0.5rem 1.25rem;
    background-color: var(--color-primary, #4f46e5);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .primary-button:hover {
    background-color: #4338ca;
  }

  .secondary-button {
    padding: 0.5rem 1rem;
    background: var(--color-background, #fff);
    color: var(--color-text, #1e293b);
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .secondary-button:hover {
    background: #f8fafc;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .browser-container {
      flex-direction: column;
      height: auto;
    }

    .sidebar {
      width: 100%;
      height: auto;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-group.span-2 {
      grid-column: span 1;
    }

    .detail-grid-section {
      padding: 1rem;
    }

    .master-form,
    .create-form {
      padding: 1rem;
    }
  }
</style>