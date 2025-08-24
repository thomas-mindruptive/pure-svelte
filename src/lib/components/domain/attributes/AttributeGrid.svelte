<script lang="ts">
  // AttributeGrid.svelte (Svelte 5 + Runes)
  // 
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component specifically for displaying
  // WholesalerOfferingAttribute data with joined attribute details. This component 
  // handles attribute-specific column definitions, formatting, and interactions while 
  // delegating all grid functionality to the base Datagrid component.
  //
  // CONTEXT: 
  // Used on Level 4-5 of the SupplierBrowser hierarchy to show attributes
  // for a specific Product Offering. Each attribute represents a key-value pair
  // that describes specific properties of the offering (e.g., Color: Red, Size: Large).
  //
  // ARCHITECTURE:
  // - Pure presentation wrapper - no business logic
  // - Uses callback props for Svelte 5 pattern  
  // - Integrates with existing CSS grid system
  // - Type-safe with extended domain types from types.ts (with JOIN data)

  import Datagrid, {

  } from '$lib/components/client/Datagrid.svelte';
    import type { ColumnDef, DeleteStrategy, RowActionStrategy } from '$lib/components/client/Datagrid.types';
  import type { AttributeWithDetails } from '$lib/domain/types';

  // Universal ID type for consistency across grid components
  type ID = string | number;

  // ===== COMPONENT PROPS =====

  const {
    // Core data
    rows = [] as AttributeWithDetails[],    // Array of attribute objects with JOIN data (name, description)
    loading = false,                        // Whether grid is in loading state
    
    // Delete handling (required by Datagrid)
    executeDelete,                         // Function to execute delete operations: (ids) => Promise<void>
    
    // Row interaction (optional)
    onRowClick                             // Handler for row clicks (typically navigation to edit form)
  } = $props<{
    rows?: AttributeWithDetails[];
    loading?: boolean;
    executeDelete: (ids: ID[]) => Promise<void>;
    onRowClick?: (attribute: AttributeWithDetails) => void;
  }>();

  // ===== COLUMN DEFINITIONS =====
  
  // Define how attribute data should be displayed in the grid
  // Column order optimized for attribute key-value display patterns
  // Uses JOIN data (attribute_name, attribute_description)
  const columns: ColumnDef<AttributeWithDetails>[] = [
    // Attribute name - primary identification, makes first column clickable
    { 
      key: 'attribute_name', 
      header: 'Attribute', 
      sortable: true, 
      width: '2fr',
      accessor: (attr: AttributeWithDetails) => 
        attr.attribute_name || `Attribute #${attr.attribute_id}`
    },
    
    // Attribute value - the specific value for this offering
    { 
      key: 'value', 
      header: 'Value', 
      sortable: true, 
      width: '2fr',
      accessor: (attr: AttributeWithDetails) => 
        attr.value || '—'
    },
    
    // Attribute description - helpful context from the attribute definition
    { 
      key: 'attribute_description', 
      header: 'Description', 
      sortable: false, 
      width: '3fr',
      accessor: (attr: AttributeWithDetails) => 
        attr.attribute_description || '—'
    },
    
    // Attribute ID - useful for debugging/admin purposes
    { 
      key: 'attribute_id', 
      header: 'ID', 
      sortable: true, 
      width: '0.5fr',
      accessor: (attr: AttributeWithDetails) => 
        attr.attribute_id.toString()
    }
  ];

  // ===== ID EXTRACTION =====
  
  /**
   * Extracts unique identifier from an attribute object.
   * Since WholesalerOfferingAttribute uses composite key (offering_id + attribute_id),
   * we create a compound ID for grid operations.
   * 
   * @param attribute - The attribute object to extract ID from
   * @returns Compound ID as string: "offering_id-attribute_id"
   */
  const getId = (attribute: AttributeWithDetails): ID => 
    `${attribute.offering_id}-${attribute.attribute_id}`;

  // ===== DELETE STRATEGY =====
  
  /**
   * Configure delete behavior for attributes.
   * Delegates actual deletion logic to parent component via executeDelete callback.
   * This keeps the grid component pure and allows parent to handle business logic.
   * Parent will need to parse compound IDs back to offering_id + attribute_id.
   */
  const deleteStrategy: DeleteStrategy<AttributeWithDetails> = {
    execute: async (ids: ID[]) => {
      await executeDelete(ids);
    }
  };

  // ===== ROW ACTION STRATEGY =====
  
  /**
   * Configure row interaction behavior.
   * Primary click typically opens attribute edit form or detail view.
   * Uses optional callback pattern to avoid forcing interaction behavior.
   */
  const rowActionStrategy: RowActionStrategy<AttributeWithDetails> = {
    click: onRowClick
  };

  // Silence TypeScript "declared but never read" warnings for reactive variables
  // These are used in the template via Svelte's reactivity system
  void rows; void loading; void columns; void getId; void deleteStrategy;
</script>

<!-- 
  ATTRIBUTE GRID COMPONENT
  
  This is a pure wrapper that configures the generic Datagrid component
  for attribute-specific display requirements. All grid functionality
  (sorting, selection, deletion, loading states) is handled by Datagrid.
  
  The component is designed to be self-contained and reusable wherever
  attribute data needs to be displayed in a tabular format.
-->
<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="attributes"
  entity="attribute"
  {deleteStrategy}
  {rowActionStrategy}
/>

<!-- 
  OPTIONAL CUSTOM SNIPPETS
  
  Uncomment and customize these snippets if you need attribute-specific UI
  that differs from the default Datagrid presentation:

{#snippet toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
  <div style="display:flex; gap:.5rem; align-items:center;">
    <button class="pc-grid__btn" type="button" onclick={() => openCreateAttribute()}>
      Add Attribute
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
  {#if col.key === 'value'}
    <div class="attribute-value">
      {#if row.value}
        <strong>{row.value}</strong>
      {:else}
        <em style="color: var(--pc-grid-muted, #64748b);">No value set</em>
      {/if}
    </div>
  {:else if col.key === 'attribute_name'}
    <div class="attribute-name">
      <strong>{row.attribute_name || `Attribute #${row.attribute_id}`}</strong>
      {#if row.attribute_id}
        <small class="attribute-id-badge">#{row.attribute_id}</small>
      {/if}
    </div>
  {:else if col.key === 'attribute_description'}
    <div class="attribute-description" title={row.attribute_description}>
      {row.attribute_description || '—'}
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
      onclick={() => editAttribute(id)} 
      disabled={!id}
      title="Edit attribute value"
    >
      Edit
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => id && deleteAttribute(row)}
      disabled={!id}
      aria-busy={id ? isDeleting(id) : false}
      title="Remove this attribute from the offering"
    >
      Remove
    </button>
  </div>
{/snippet}

{#snippet empty()}
  <div style="text-align:center; padding:2rem;">
    <h4>No attributes defined</h4>
    <p>This offering doesn't have any specific attributes yet.</p>
    <button class="pc-grid__btn" type="button" onclick={() => openCreateAttribute()}>
      Add First Attribute
    </button>
  </div>
{/snippet}

<style>
  .attribute-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .attribute-id-badge {
    background: var(--pc-grid-accent, #0ea5e9);
    color: white;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }
  
  .attribute-value strong {
    color: var(--pc-grid-fg, #0f172a);
  }
  
  .attribute-description {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
-->