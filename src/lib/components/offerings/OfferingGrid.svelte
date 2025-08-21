<script lang="ts">
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  import { log } from "$lib/utils/logger";
  
  // Props - Component API
  export let offerings: Array<{
    offering_id: number;
    product_name: string;
    price?: number;
    stock?: number;
    status: 'active' | 'inactive' | 'discontinued' | 'pending';
    category_id?: number;
    wholesaler_id?: number;
    sku?: string;
    last_updated?: string;
  }> = [];
  
  export let height: string = '400px';
  export let loading: boolean = false;
  export let currency: string = '$';
  export let lowStockThreshold: number = 10;
  
  // Event callbacks - Svelte 5 style
  export let onrowclick: ((offering: any) => void) | undefined = undefined;
  export let ondelete: ((offering: any) => void) | undefined = undefined;
  export let onsort: ((event: { key: string }) => void) | undefined = undefined;

  // Internal state for delete operations
  let deletingOfferingIds = new Set<number>();

  // Column definitions for offering data
  const offeringColumns: ColumnDefinition[] = [
    { key: 'product_name', title: 'Product Name', sortable: true, width: '4fr' },
    { key: 'price', title: 'Price', sortable: true, type: 'number', width: '1.5fr' },
    { key: 'stock', title: 'Stock', sortable: true, type: 'number', width: '1fr' },
    { key: 'status', title: 'Status', sortable: true, width: '1.5fr' },
    { key: 'sku', title: 'SKU', sortable: false, width: '1.5fr' }
  ];

  // Handle row click for navigation to attributes
  function handleRowClick(event: { row: any }) {
    const offering = event.row;
    log.info("Offering row clicked for navigation", { 
      offeringId: offering.offering_id, 
      productName: offering.product_name,
      status: offering.status,
      stock: offering.stock
    });
    
    onrowclick?.(offering);
  }

  // Handle delete with loading state management
  function handleDelete(event: { row: any }) {
    const offering = event.row;
    const offeringId = offering.offering_id;
    
    // Prevent multiple concurrent deletes of same offering
    if (deletingOfferingIds.has(offeringId)) {
      log.warn("Delete already in progress for offering", { offeringId });
      return;
    }

    log.info("Offering delete initiated", { 
      offeringId, 
      productName: offering.product_name,
      status: offering.status,
      hasStock: (offering.stock || 0) > 0
    });

    // Add to deleting set for UI feedback
    deletingOfferingIds.add(offeringId);
    deletingOfferingIds = deletingOfferingIds; // Trigger reactivity

    // Delegate to parent with cleanup callback
    ondelete?.({
      ...offering,
      onComplete: () => {
        deletingOfferingIds.delete(offeringId);
        deletingOfferingIds = deletingOfferingIds;
        log.info("Offering delete completed", { offeringId });
      }
    });
  }

  // Check if delete is disabled for an offering
  function isDeleteDisabled(offering: any): boolean {
    return deletingOfferingIds.has(offering.offering_id) || loading;
  }

  // Get delete tooltip text
  function getDeleteTooltip(offering: any): string {
    if (loading) return "Grid is loading...";
    if (deletingOfferingIds.has(offering.offering_id)) {
      return "Deleting offering...";
    }
    
    const stock = offering.stock || 0;
    if (stock > 0) {
      return `Delete offering "${offering.product_name}" (${stock} items in stock)`;
    }
    
    return `Delete offering "${offering.product_name}"`;
  }

  // Check if stock is low
  function isLowStock(stock: number): boolean {
    return stock > 0 && stock <= lowStockThreshold;
  }

  // Format price with currency
  function formatPrice(price: number | undefined): string {
    if (price === undefined || price === null) return '-';
    return `${currency}${price.toFixed(2)}`;
  }

  // Handle sort events from datagrid
  function handleSort(event: { key: string }) {
    log.info("Offering grid sort requested", { sortKey: event.key });
    onsort?.(event);
  }

  // Reactive data for display
  $: displayOfferings = loading ? [] : offerings;
  $: showDelete = !!ondelete;

  // Calculate statistics
  $: stats = {
    total: offerings.length,
    active: offerings.filter(o => o.status === 'active').length,
    lowStock: offerings.filter(o => isLowStock(o.stock || 0)).length,
    outOfStock: offerings.filter(o => (o.stock || 0) === 0).length,
    totalValue: offerings.reduce((sum, o) => sum + ((o.price || 0) * (o.stock || 0)), 0)
  };

  // Log when offerings data changes
  $: if (offerings.length >= 0) {
    log.info("OfferingGrid data updated", { 
      offeringCount: stats.total,
      activeCount: stats.active,
      lowStockCount: stats.lowStock,
      totalValue: stats.totalValue,
      loading 
    });
  }
</script>

<!-- 
  Offering Grid: Thin wrapper around generic Datagrid
  Handles product offering-specific display logic and navigation to attributes
-->
<Datagrid
  rows={displayOfferings}
  columns={offeringColumns}
  {height}
  onsort={handleSort}
  ondelete={showDelete ? handleDelete : undefined}
  showDelete={showDelete}
  deleteDisabled={isDeleteDisabled}
  deleteTooltip={getDeleteTooltip}
>
  <!-- Custom cell rendering for offering-specific fields -->
  <div slot="cell" let:row let:column let:value>
    {#if column.key === 'product_name'}
      <!-- Clickable product name for navigation -->
      <button 
        class="product-name-button"
        class:loading
        class:out-of-stock={row.stock === 0}
        class:low-stock={isLowStock(row.stock || 0)}
        disabled={loading}
        on:click={() => handleRowClick({ row })}
        title="View product attributes and details"
      >
        <span class="product-name">{value || 'Unnamed Product'}</span>
        {#if row.status === 'discontinued'}
          <span class="status-indicator discontinued">DISC</span>
        {:else if row.stock === 0}
          <span class="status-indicator out-of-stock">OOS</span>
        {:else if isLowStock(row.stock || 0)}
          <span class="status-indicator low-stock">LOW</span>
        {/if}
      </button>
      
    {:else if column.key === 'price'}
      <!-- Formatted price with currency -->
      <div class="price-display" class:no-price={!value}>
        {formatPrice(value)}
      </div>
      
    {:else if column.key === 'stock'}
      <!-- Stock with visual indicators -->
      <div class="stock-display" 
           class:out-of-stock={value === 0}
           class:low-stock={isLowStock(value || 0)}
           class:good-stock={value > lowStockThreshold}>
        <span class="stock-number">{value ?? 0}</span>
        {#if value === 0}
          <span class="stock-icon">❌</span>
        {:else if isLowStock(value || 0)}
          <span class="stock-icon">⚠️</span>
        {:else if value > lowStockThreshold}
          <span class="stock-icon">✅</span>
        {/if}
      </div>
      
    {:else if column.key === 'status'}
      <!-- Status with color coding -->
      <span class="status-badge status-{value}">
        {value || 'unknown'}
      </span>
      
    {:else if column.key === 'sku'}
      <!-- SKU with copy-to-clipboard functionality -->
      <div class="sku-display" title={value ? `SKU: ${value}` : 'No SKU assigned'}>
        {#if value}
          <code class="sku-code">{value}</code>
        {:else}
          <span class="no-sku">-</span>
        {/if}
      </div>
      
    {:else}
      <!-- Default display for other fields -->
      {value || '-'}
    {/if}
  </div>

  <!-- Custom delete button for offerings -->
  <div slot="delete" let:row>
    <button
      class="offering-delete-button"
      class:deleting={deletingOfferingIds.has(row.offering_id)}
      class:has-stock={row.stock > 0}
      disabled={isDeleteDisabled(row)}
      title={getDeleteTooltip(row)}
      on:click={() => handleDelete({ row })}
    >
      {#if deletingOfferingIds.has(row.offering_id)}
        <span class="delete-spinner">⏳</span>
      {:else if row.stock > 0}
        📦
      {:else}
        🗑️
      {/if}
    </button>
  </div>
</Datagrid>

<style>
  /* Product name button for navigation */
  .product-name-button {
    background: transparent;
    border: none;
    color: var(--color-primary, #4f46e5);
    cursor: pointer;
    font: inherit;
    text-align: left;
    padding: 0;
    width: 100%;
    transition: all 0.2s ease;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .product-name-button:hover:not(:disabled) {
    color: #4338ca;
  }

  .product-name-button:hover .product-name {
    text-decoration: underline;
  }

  .product-name-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .product-name-button.loading {
    color: var(--color-muted, #64748b);
  }

  .product-name-button.out-of-stock {
    opacity: 0.7;
  }

  .product-name-button.low-stock {
    color: #f59e0b;
  }

  .product-name {
    flex: 1;
  }

  .status-indicator {
    padding: 0.125rem 0.25rem;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-indicator.discontinued {
    background: #fee2e2;
    color: #dc2626;
  }

  .status-indicator.out-of-stock {
    background: #fef2f2;
    color: #b91c1c;
  }

  .status-indicator.low-stock {
    background: #fef3c7;
    color: #d97706;
  }

  /* Price display */
  .price-display {
    font-weight: 500;
    color: var(--color-text, #1e293b);
  }

  .price-display.no-price {
    color: var(--color-muted, #64748b);
    font-style: italic;
  }

  /* Stock display with indicators */
  .stock-display {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 500;
  }

  .stock-display.out-of-stock {
    color: #dc2626;
  }

  .stock-display.low-stock {
    color: #f59e0b;
  }

  .stock-display.good-stock {
    color: #059669;
  }

  .stock-number {
    min-width: 2rem;
    text-align: right;
  }

  .stock-icon {
    font-size: 0.875rem;
  }

  /* Status badges with color coding */
  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .status-badge.status-active {
    background-color: #dcfce7;
    color: #166534;
  }

  .status-badge.status-inactive {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  .status-badge.status-discontinued {
    background-color: #fee2e2;
    color: #dc2626;
  }

  .status-badge.status-pending {
    background-color: #fef3c7;
    color: #d97706;
  }

  .status-badge.status-unknown {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  /* SKU display */
  .sku-display {
    font-family: var(--font-mono, 'Monaco', 'Consolas', monospace);
  }

  .sku-code {
    background: #f1f5f9;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.875rem;
    border: 1px solid #e2e8f0;
  }

  .no-sku {
    color: var(--color-muted, #64748b);
    font-style: italic;
  }

  /* Enhanced delete button for offerings */
  .offering-delete-button {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    color: #dc3545;
    min-width: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .offering-delete-button:hover:not(:disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
    transform: scale(1.05);
  }

  .offering-delete-button.has-stock {
    color: #f59e0b;
    border-color: #fbbf24;
  }

  .offering-delete-button.has-stock:hover:not(:disabled) {
    background-color: #fef3c7;
    border-color: #f59e0b;
  }

  .offering-delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .offering-delete-button.deleting {
    animation: deleteProgress 2s infinite;
    border-color: #f59e0b;
    background-color: #fef3c7;
    cursor: wait;
  }

  .delete-spinner {
    animation: spin 1s linear infinite;
  }

  /* Delete button animations */
  @keyframes deleteProgress {
    0%, 100% {
      opacity: 1;
      border-color: #f59e0b;
    }
    50% {
      opacity: 0.6;
      border-color: #dc3545;
    }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>