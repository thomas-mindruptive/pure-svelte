<script lang="ts">
  // LinkGrid.svelte (Svelte 5 + Runes)
  // 
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component specifically for displaying
  // WholesalerOfferingLink data. This component handles link-specific column 
  // definitions, formatting, and interactions while delegating all grid functionality
  // to the base Datagrid component.
  //
  // CONTEXT: 
  // Used on Level 4-5 of the SupplierBrowser hierarchy to show external links
  // for a specific Product Offering. Each link represents a URL reference to
  // external resources like product pages, documentation, or related content.
  //
  // ARCHITECTURE:
  // - Pure presentation wrapper - no business logic
  // - Uses callback props for Svelte 5 pattern  
  // - Integrates with existing CSS grid system
  // - Type-safe with domain types from types.ts

  import Datagrid, {

  } from '$lib/components/client/Datagrid.svelte';
  import type { WholesalerOfferingLink } from '$lib/domain/types';
    import type { ColumnDef, DeleteStrategy, RowActionStrategy } from '../client/Datagrid.types';

  // Universal ID type for consistency across grid components
  type ID = string | number;

  // ===== COMPONENT PROPS =====

  const {
    // Core data
    rows = [] as WholesalerOfferingLink[],  // Array of link objects
    loading = false,                        // Whether grid is in loading state
    
    // Delete handling (required by Datagrid)
    executeDelete,                         // Function to execute delete operations: (ids) => Promise<void>
    
    // Row interaction (optional)
    onRowClick                             // Handler for row clicks (typically navigation to edit form)
  } = $props<{
    rows?: WholesalerOfferingLink[];
    loading?: boolean;
    executeDelete: (ids: ID[]) => Promise<void>;
    onRowClick?: (link: WholesalerOfferingLink) => void;
  }>();

  // ===== COLUMN DEFINITIONS =====
  
  // Define how link data should be displayed in the grid
  // Column order optimized for link display patterns with clickable URLs
  const columns: ColumnDef<WholesalerOfferingLink>[] = [
    // URL - primary content, clickable external link
    { 
      key: 'url', 
      header: 'URL', 
      sortable: true, 
      width: '4fr',
      accessor: (link: WholesalerOfferingLink) => link.url
    },
    
    // Notes - description or context about the link
    { 
      key: 'notes', 
      header: 'Description', 
      sortable: false, 
      width: '3fr',
      accessor: (link: WholesalerOfferingLink) => 
        link.notes || '—'
    },
    
    // Created date - when the link was added
    { 
      key: 'created_at', 
      header: 'Added', 
      sortable: true, 
      width: '2fr',
      accessor: (link: WholesalerOfferingLink) => {
        if (!link.created_at) return '—';
        try {
          return new Date(link.created_at).toLocaleDateString();
        } catch {
          return link.created_at;
        }
      }
    },
    
    // Link ID - useful for debugging/admin purposes
    { 
      key: 'link_id', 
      header: 'ID', 
      sortable: true, 
      width: '0.5fr',
      accessor: (link: WholesalerOfferingLink) => 
        link.link_id.toString()
    }
  ];

  // ===== ID EXTRACTION =====
  
  /**
   * Extracts unique identifier from a link object.
   * Uses link_id as the primary key for grid operations like selection and deletion.
   * 
   * @param link - The link object to extract ID from
   * @returns The unique link ID
   */
  const getId = (link: WholesalerOfferingLink): ID => 
    link.link_id;

  // ===== DELETE STRATEGY =====
  
  /**
   * Configure delete behavior for links.
   * Delegates actual deletion logic to parent component via executeDelete callback.
   * This keeps the grid component pure and allows parent to handle business logic.
   */
  const deleteStrategy: DeleteStrategy<WholesalerOfferingLink> = {
    execute: async (ids: ID[]) => {
      await executeDelete(ids);
    }
  };

  // ===== ROW ACTION STRATEGY =====
  
  /**
   * Configure row interaction behavior.
   * Primary click typically opens link edit form or detail view.
   * Uses optional callback pattern to avoid forcing interaction behavior.
   */
  const rowActionStrategy: RowActionStrategy<WholesalerOfferingLink> = {
    click: onRowClick
  };

  // ===== HELPER FUNCTIONS =====
  
  /**
   * Extracts domain name from URL for display purposes
   * @param url - Full URL string
   * @returns Domain name or original URL if parsing fails
   */
  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  extractDomain;

  /**
   * Validates if URL is well-formed
   * @param url - URL string to validate
   * @returns true if URL is valid
   */
  function isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  isValidUrl;

  // Silence TypeScript "declared but never read" warnings for reactive variables
  // These are used in the template via Svelte's reactivity system
  void rows; void loading; void columns; void getId; void deleteStrategy;
</script>

<!-- 
  LINK GRID COMPONENT
  
  This is a pure wrapper that configures the generic Datagrid component
  for link-specific display requirements. All grid functionality
  (sorting, selection, deletion, loading states) is handled by Datagrid.
  
  The component is designed to be self-contained and reusable wherever
  link data needs to be displayed in a tabular format.
-->
<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="links"
  entity="link"
  {deleteStrategy}
  {rowActionStrategy}
/>

<!-- 
  OPTIONAL CUSTOM SNIPPETS
  
  Uncomment and customize these snippets if you need link-specific UI
  that differs from the default Datagrid presentation:

{#snippet toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
  <div style="display:flex; gap:.5rem; align-items:center;">
    <button class="pc-grid__btn" type="button" onclick={() => openCreateLink()}>
      Add Link
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
  {#if col.key === 'url'}
    <div class="link-url">
      {#if isValidUrl(row.url)}
        <a 
          href={row.url} 
          target="_blank" 
          rel="noopener noreferrer"
          class="external-link"
          title={row.url}
          onclick={(e) => e.stopPropagation()}
        >
          {extractDomain(row.url)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="external-icon">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15,3 21,3 21,9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      {:else}
        <span class="invalid-url" title="Invalid URL: {row.url}">
          {row.url}
          <small class="url-warning">⚠️ Invalid</small>
        </span>
      {/if}
    </div>
  {:else if col.key === 'notes'}
    <div class="link-notes" title={row.notes}>
      {row.notes || '—'}
    </div>
  {:else if col.key === 'created_at'}
    <div class="link-date">
      {#if row.created_at}
        <time datetime={row.created_at} title={row.created_at}>
          {new Date(row.created_at).toLocaleDateString()}
        </time>
      {:else}
        —
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
      onclick={() => editLink(id)} 
      disabled={!id}
      title="Edit link details"
    >
      Edit
    </button>
    {#if isValidUrl(row.url)}
      <a
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        class="pc-grid__btn"
        title="Open link in new tab"
        onclick={(e) => e.stopPropagation()}
      >
        Open
      </a>
    {/if}
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => id && deleteLink(row)}
      disabled={!id}
      aria-busy={id ? isDeleting(id) : false}
      title="Remove this link from the offering"
    >
      Delete
    </button>
  </div>
{/snippet}

{#snippet empty()}
  <div style="text-align:center; padding:2rem;">
    <h4>No links added yet</h4>
    <p>This offering doesn't have any external links or references.</p>
    <button class="pc-grid__btn" type="button" onclick={() => openCreateLink()}>
      Add First Link
    </button>
  </div>
{/snippet}


<style>
  .link-url {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .external-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--pc-grid-accent, #0ea5e9);
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
  }
  
  .external-link:hover {
    background: color-mix(in srgb, var(--pc-grid-accent, #0ea5e9) 10%, transparent);
    text-decoration: none;
  }
  
  .external-icon {
    flex-shrink: 0;
    opacity: 0.7;
  }
  
  .invalid-url {
    color: var(--pc-grid-danger, #dc2626);
    font-family: monospace;
    font-size: 0.875rem;
  }
  
  .url-warning {
    margin-left: 0.5rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }
  
  .link-notes {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .link-date time {
    font-size: 0.875rem;
    color: var(--pc-grid-muted, #64748b);
  }
  
  /* Override pc-grid__btn for "Open" link button */
  a.pc-grid__btn {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
-->