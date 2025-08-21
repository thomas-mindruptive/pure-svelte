<!-- src/lib/components/grids/SupplierGrid.svelte -->
<script lang="ts">
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  import { log } from "$lib/utils/logger";
  
  // Props - Component API
  export let suppliers: Array<{
    wholesaler_id: number;
    name: string;
    region?: string;
    status: 'active' | 'inactive' | 'new';
    dropship: boolean;
    website?: string;
  }> = [];
  
  export let height: string = '400px';
  export let loading: boolean = false;
  
  // Event callbacks - Svelte 5 style
  export let onrowclick: ((supplier: any) => void) | undefined = undefined;
  export let ondelete: ((supplier: any) => void) | undefined = undefined;
  export let onsort: ((event: { key: string }) => void) | undefined = undefined;

  // Internal state for delete operations
  let deletingSupplierIds = new Set<number>();

  // Column definitions for supplier data
  const supplierColumns: ColumnDefinition[] = [
    { key: 'name', title: 'Supplier Name', sortable: true, width: '3fr' },
    { key: 'region', title: 'Region', sortable: true, width: '2fr' },
    { key: 'status', title: 'Status', sortable: true, width: '1fr' },
    { key: 'dropship', title: 'Dropship', sortable: false, width: '1fr' },
    { key: 'website', title: 'Website', sortable: false, width: '2fr' }
  ];

  // Handle row click for navigation to categories
  function handleRowClick(event: { row: any }) {
    const supplier = event.row;
    log.info("Supplier row clicked for navigation", { 
      supplierId: supplier.wholesaler_id, 
      supplierName: supplier.name 
    });
    
    onrowclick?.(supplier);
  }

  // Handle delete with loading state management
  function handleDelete(event: { row: any }) {
    const supplier = event.row;
    const supplierId = supplier.wholesaler_id;
    
    // Prevent multiple concurrent deletes of same supplier
    if (deletingSupplierIds.has(supplierId)) {
      log.warn("Delete already in progress for supplier", { supplierId });
      return;
    }

    log.info("Supplier delete initiated", { 
      supplierId, 
      supplierName: supplier.name 
    });

    // Add to deleting set for UI feedback
    deletingSupplierIds.add(supplierId);
    deletingSupplierIds = deletingSupplierIds; // Trigger reactivity

    // Delegate to parent with cleanup callback
    ondelete?.({
      ...supplier,
      onComplete: () => {
        deletingSupplierIds.delete(supplierId);
        deletingSupplierIds = deletingSupplierIds;
        log.info("Supplier delete completed", { supplierId });
      }
    });
  }

  // Check if delete is disabled for a supplier
  function isDeleteDisabled(supplier: any): boolean {
    return deletingSupplierIds.has(supplier.wholesaler_id) || loading;
  }

  // Get delete tooltip text
  function getDeleteTooltip(supplier: any): string {
    if (loading) return "Grid is loading...";
    if (deletingSupplierIds.has(supplier.wholesaler_id)) {
      return "Deleting supplier...";
    }
    return `Delete supplier "${supplier.name}"`;
  }

  // Handle sort events from datagrid
  function handleSort(event: { key: string }) {
    log.info("Supplier grid sort requested", { sortKey: event.key });
    onsort?.(event);
  }

  // Reactive data for display
  $: displaySuppliers = loading ? [] : suppliers;
  $: showDelete = !!ondelete;

  // Log when suppliers data changes
  $: if (suppliers.length >= 0) {
    log.info("SupplierGrid data updated", { 
      supplierCount: suppliers.length,
      loading 
    });
  }
</script>

<!-- 
  Supplier Grid: Thin wrapper around generic Datagrid
  Handles supplier-specific display logic and navigation
-->
<Datagrid
  rows={displaySuppliers}
  columns={supplierColumns}
  {height}
  onsort={handleSort}
  ondelete={showDelete ? handleDelete : undefined}
  showDelete={showDelete}
  deleteDisabled={isDeleteDisabled}
  deleteTooltip={getDeleteTooltip}
>
  <!-- Custom cell rendering for supplier-specific fields -->
  <div slot="cell" let:row let:column let:value>
    {#if column.key === 'name'}
      <!-- Clickable supplier name for navigation -->
      <button 
        class="supplier-name-button"
        class:loading
        disabled={loading}
        on:click={() => handleRowClick({ row })}
        title="View supplier details and categories"
      >
        {value || 'Unnamed Supplier'}
      </button>
      
    {:else if column.key === 'status'}
      <!-- Status with color coding -->
      <span class="status-badge status-{value}">
        {value || 'unknown'}
      </span>
      
    {:else if column.key === 'dropship'}
      <!-- Boolean as icon -->
      <span class="dropship-indicator" title={value ? 'Offers dropshipping' : 'No dropshipping'}>
        {value ? '✅' : '❌'}
      </span>
      
    {:else if column.key === 'website' && value}
      <!-- Website as external link -->
      <a 
        href={value} 
        target="_blank" 
        rel="noopener noreferrer"
        class="website-link"
        on:click|stopPropagation
        title="Visit supplier website"
      >
        {value}
      </a>
      
    {:else}
      <!-- Default display for other fields -->
      {value || '-'}
    {/if}
  </div>

  <!-- Custom delete button with enhanced loading state -->
  <div slot="delete" let:row>
    <button
      class="supplier-delete-button"
      class:deleting={deletingSupplierIds.has(row.wholesaler_id)}
      disabled={isDeleteDisabled(row)}
      title={getDeleteTooltip(row)}
      on:click={() => handleDelete({ row })}
    >
      {#if deletingSupplierIds.has(row.wholesaler_id)}
        <span class="delete-spinner">⏳</span>
      {:else}
        🗑️
      {/if}
    </button>
  </div>
</Datagrid>

<style>
  /* Supplier name button for navigation */
  .supplier-name-button {
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
  }

  .supplier-name-button:hover:not(:disabled) {
    color: #4338ca;
    text-decoration: underline;
  }

  .supplier-name-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .supplier-name-button.loading {
    color: var(--color-muted, #64748b);
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
    background-color: #fee2e2;
    color: #dc2626;
  }

  .status-badge.status-new {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .status-badge.status-unknown {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  /* Dropship indicator */
  .dropship-indicator {
    font-size: 1rem;
    cursor: help;
  }

  /* Website link styling */
  .website-link {
    color: var(--color-primary, #4f46e5);
    text-decoration: none;
    transition: color 0.2s ease;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }

  .website-link:hover {
    color: #4338ca;
    text-decoration: underline;
  }

  /* Enhanced delete button */
  .supplier-delete-button {
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

  .supplier-delete-button:hover:not(:disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
    transform: scale(1.05);
  }

  .supplier-delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .supplier-delete-button.deleting {
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