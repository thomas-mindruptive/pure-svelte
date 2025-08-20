<!-- src/lib/components/Datagrid.svelte -->
<script lang="ts" context="module">
  // This "module" script block runs once and is used to export types.
</script>

<script lang="ts">
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  
  export let rows: Record<string, any>[] = [];
  export let columns: ColumnDefinition[] = [];
  export let height = '500px';
  
  // NEW: Optional delete functionality
  export let showDelete = false;
  export let deleteDisabled: (row: Record<string, any>) => boolean = () => false;
  export let deleteTooltip: (row: Record<string, any>) => string = () => 'Delete this item';

  // Svelte 5: Event callbacks instead of createEventDispatcher
  export let ondelete: ((event: { row: Record<string, any> }) => void) | undefined = undefined;
  export let onsort: ((event: { key: string }) => void) | undefined = undefined;

  let sortKey: string | null = null;
  let sortDirection: 1 | -1 = 1;

  $: sortedRows = (() => {
    if (!sortKey) return rows;
    const columnToSort = columns.find(c => c.key === sortKey);
    const type = columnToSort?.type || 'string';
    return [...rows].sort((a, b) => {
      const valA = a[sortKey!];
      const valB = b[sortKey!];
      if (valA == null) return 1 * sortDirection;
      if (valB == null) return -1 * sortDirection;
      if (type === 'number') return (Number(valA) - Number(valB)) * sortDirection;
      if (type === 'date') return (new Date(valA).getTime() - new Date(valB).getTime()) * sortDirection;
      return String(valA).localeCompare(String(valB)) * sortDirection;
    });
  })();

  function sortBy(key: string, sortable?: boolean) {
    if (!sortable) return;
    if (sortKey === key) {
      sortDirection = sortDirection === 1 ? -1 : 1;
    } else {
      sortKey = key;
      sortDirection = 1;
    }
    
    // Notify parent component about the sort change
    onsort?.({ key });
  }

  // Include delete column in grid template if needed
  $: gridTemplateColumns = [
    ...columns.map(c => c.width || '1fr'),
    ...(showDelete ? ['auto'] : [])
  ].join(' ');

  // Handle delete action - Svelte 5 style with callback
  function handleDelete(row: Record<string, any>) {
    ondelete?.({ row });
  }
</script>

<div class="datagrid-container" style="height: {height};">
  
  <div class="datagrid-header" style="--grid-template-columns: {gridTemplateColumns};">
    {#each columns as column}
      <button 
        class="header-cell"
        class:sortable={column.sortable}
        class:sorted={sortKey === column.key}
        on:click={() => sortBy(column.key, column.sortable)}
      >
        {column.title}
        {#if sortKey === column.key}
          <span class="sort-arrow">{sortDirection === 1 ? '▲' : '▼'}</span>
        {/if}
      </button>
    {/each}
    
    <!-- Delete column header -->
    {#if showDelete}
      <div class="header-cell">Action</div>
    {/if}
  </div>

  <div class="datagrid-body">
    {#if sortedRows.length > 0}
      {#each sortedRows as row (row.id ?? JSON.stringify(row))}
        <div class="datagrid-row" style="--grid-template-columns: {gridTemplateColumns};">
          {#each columns as column}
            <div class="body-cell">
              <slot name="cell" {row} {column} value={row[column.key]}>
                {row[column.key]}
              </slot>
            </div>
          {/each}
          
          <!-- Delete button cell -->
          {#if showDelete}
            <div class="body-cell delete-cell">
              <slot name="delete" {row}>
                <button
                  class="delete-button"
                  class:disabled={deleteDisabled(row)}
                  disabled={deleteDisabled(row)}
                  title={deleteTooltip(row)}
                  on:click={() => handleDelete(row)}
                >
                  🗑️
                </button>
              </slot>
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      <div class="empty-message">No data available.</div>
    {/if}
  </div>
</div>

<style>
  /* --- NEW LAYOUT: CSS GRID for fixed header --- */
  .datagrid-container {
    display: grid; 
    grid-template-rows: auto 1fr; 
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
    background-color: var(--color-background, #fff);
  }

  .datagrid-body {
    overflow-y: auto; 
  }

  /* --- Column Alignment --- */
  .datagrid-header, .datagrid-row {
    display: grid;
    grid-template-columns: var(--grid-template-columns);
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }
  
  .datagrid-header {
    background-color: #f8fafc;
    position: relative;
    z-index: 1;
  }

  /* --- Cell Styling --- */
  .header-cell {
    padding: 0.75rem 1rem;
    text-align: left;
    background: none;
    border: none;
    font: inherit;
    font-weight: 600;
    color: var(--color-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .header-cell.sortable {
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .header-cell.sortable:hover {
    background-color: #f1f5f9;
  }

  .header-cell.sorted {
    color: var(--color-primary, #4f46e5);
  }

  .sort-arrow {
    font-size: 0.8em;
  }
  
  .datagrid-row:last-child {
    border-bottom: none;
  }
  
  .body-cell {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* --- Delete Button Styling --- */
  .delete-cell {
    justify-content: center;
    padding: 0.5rem;
  }

  .delete-button {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    color: #dc3545;
  }

  .delete-button:hover:not(.disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
  }

  .delete-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .empty-message {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 2rem;
    color: var(--color-muted, #64748b);
  }
</style>