<script lang="ts">
  // OfferingGrid.svelte (Svelte 5 + Runes)
  // 
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component specifically for displaying
  // WholesalerItemOffering_ProductDef_Category data. This component handles offering-specific 
  // column definitions, formatting, and interactions while delegating all grid functionality
  // to the base Datagrid component.
  //
  // CONTEXT: 
  // Used on Level 3 of the SupplierBrowser hierarchy to show product offerings
  // for a specific Supplier + Category combination. Each offering represents a
  // product that the supplier offers within that category.
  //
  // ARCHITECTURE:
  // - Pure presentation wrapper - no business logic
  // - Uses callback props for Svelte 5 pattern  
  // - Integrates with existing CSS grid system
  // - Type-safe with extended domain types from types.ts (with JOIN data)

  import Datagrid, {

  } from '$lib/components/client/Datagrid.svelte';
    import type { ColumnDef, DeleteStrategy, RowActionStrategy } from '$lib/components/client/Datagrid.types';
  import type { WholesalerItemOffering_ProductDef_Category } from '$lib/domain/types';

  // Universal ID type for consistency across grid components
  type ID = string | number;

  // ===== COMPONENT PROPS =====

  const {
    // Core data
    rows = [] as WholesalerItemOffering_ProductDef_Category[], // Array of offering objects with JOIN data
    loading = false,                                          // Whether grid is in loading state
    
    // Delete handling (required by Datagrid)
    executeDelete,                                            // Function to execute delete operations: (ids) => Promise<void>
    
    // Row interaction (optional)
    onRowClick                                               // Handler for row clicks (typically navigation to detail)
  } = $props<{
    rows?: WholesalerItemOffering_ProductDef_Category[];
    loading?: boolean;
    executeDelete: (ids: ID[]) => Promise<void>;
    onRowClick?: (offering: WholesalerItemOffering_ProductDef_Category) => void;
  }>();

  // ===== COLUMN DEFINITIONS =====
  
  // Define how offering data should be displayed in the grid
  // Column order and widths optimized for typical offering data patterns
  // Uses JOIN data from mockData (product_def_title, etc.)
  const columns: ColumnDef<WholesalerItemOffering_ProductDef_Category>[] = [
    // Product title - primary identification, makes first column clickable
    { 
      key: 'product_def_title', 
      header: 'Product', 
      sortable: true, 
      width: '3fr',
      accessor: (offering: WholesalerItemOffering_ProductDef_Category) => 
        offering.product_def_title || 'Unnamed Product'
    },
    
    // Price information - formatted with currency
    { 
      key: 'price', 
      header: 'Price', 
      sortable: true, 
      width: '1.5fr',
      accessor: (offering: WholesalerItemOffering_ProductDef_Category) => {
        if (!offering.price) return '—';
        const currency = offering.currency || 'USD';
        return `${currency} ${offering.price.toFixed(2)}`;
      }
    },
    
    // Size and dimensions - combined for space efficiency  
    {
      key: 'size',
      header: 'Size / Dimensions',
      sortable: false,
      width: '2fr',
      accessor: (offering: WholesalerItemOffering_ProductDef_Category) => {
        const size = offering.size || '';
        const dimensions = offering.dimensions || '';
        if (size && dimensions) return `${size} (${dimensions})`;
        return size || dimensions || '—';
      }
    },
    
    // Comment/notes - helpful for additional context
    { 
      key: 'comment', 
      header: 'Notes', 
      sortable: false, 
      width: '2fr',
      accessor: (offering: WholesalerItemOffering_ProductDef_Category) => 
        offering.comment || '—'
    }
  ];

  // ===== ID EXTRACTION =====
  
  /**
   * Extracts unique identifier from an offering object.
   * Uses offering_id as the primary key for grid operations like selection and deletion.
   * 
   * @param offering - The offering object to extract ID from
   * @returns The unique offering ID
   */
  const getId = (offering: WholesalerItemOffering_ProductDef_Category): ID => 
    offering.offering_id;

  // ===== DELETE STRATEGY =====
  
  /**
   * Configure delete behavior for offerings.
   * Delegates actual deletion logic to parent component via executeDelete callback.
   * This keeps the grid component pure and allows parent to handle business logic.
   */
  const deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category> = {
    execute: async (ids: ID[]) => {
      await executeDelete(ids);
    }
  };

  // ===== ROW ACTION STRATEGY =====
  
  /**
   * Configure row interaction behavior.
   * Primary click typically navigates to offering detail view (Level 4).
   * Uses optional callback pattern to avoid forcing navigation behavior.
   */
  const rowActionStrategy: RowActionStrategy<WholesalerItemOffering_ProductDef_Category> = {
    click: onRowClick
  };

  // Silence TypeScript "declared but never read" warnings for reactive variables
  // These are used in the template via Svelte's reactivity system
  void rows; void loading; void columns; void getId; void deleteStrategy;
</script>

<!-- 
  OFFERING GRID COMPONENT
  
  This is a pure wrapper that configures the generic Datagrid component
  for offering-specific display requirements. All grid functionality
  (sorting, selection, deletion, loading states) is handled by Datagrid.
  
  The component is designed to be self-contained and reusable wherever
  offering data needs to be displayed in a tabular format.
-->
<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="offerings"
  entity="offering"
  {deleteStrategy}
  {rowActionStrategy}
/>

<!-- 
  OPTIONAL CUSTOM SNIPPETS
  
  Uncomment and customize these snippets if you need offering-specific UI
  that differs from the default Datagrid presentation:

{#snippet toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
  <div style="display:flex; gap:.5rem; align-items:center;">
    <button class="pc-grid__btn" type="button" onclick={() => openCreateOffering()}>
      Add Offering
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => deleteSelected()}
      disabled={selectedIds.size === 0}
      aria-busy={Array.from(selectedIds).some((id) => deletingObjectIds.has(id))}
    >
      Delete selected ({selectedIds.size})
    </button>
  </div>
{/snippet}

{#snippet cell({ row, col })}
  {#if col.key === 'price'}
    <span class="price-display">
      {#if row.price}
        <strong>{row.currency || 'USD'} {row.price.toFixed(2)}</strong>
      {:else}
        <em>Price TBD</em>
      {/if}
    </span>
  {:else if col.key === 'product_def_title'}
    <div class="product-title">
      <strong>{row.product_def_title || 'Unnamed Product'}</strong>
      {#if row.product_def_id}
        <small class="product-id">#{row.product_def_id}</small>
      {/if}
    </div>
  {:else}
    {row[col.key] || '—'}
  {/if}
{/snippet}

{#snippet rowActions({ row, id, isDeleting })}
  <div style="display:flex; gap:.5rem; justify-content:end;">
    <button 
      class="pc-grid__btn" 
      type="button"
      onclick={() => editOffering(id)} 
      disabled={!id}
    >
      Edit
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => id && deleteOffering(row)}
      disabled={!id}
      aria-busy={id ? isDeleting(id) : false}
    >
      Delete
    </button>
  </div>
{/snippet}

{#snippet empty()}
  <div style="text-align:center; padding:2rem;">
    <h4>No product offerings yet</h4>
    <p>This supplier hasn't added any products in this category.</p>
    <button class="pc-grid__btn" type="button" onclick={() => openCreateOffering()}>
      Add First Offering
    </button>
  </div>
{/snippet}
-->