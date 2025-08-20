<script lang="ts" context="module">
  // This "module" script block runs once and is used to export types.
</script>

<script lang="ts">
  // This "instance" script runs for every component instance.
  // The logic for props, sorting, etc. remains unchanged.
  
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  
  export let rows: Record<string, any>[] = [];
  export let columns: ColumnDefinition[] = [];
  export let height = '500px';

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
  }

  $: gridTemplateColumns = columns.map(c => c.width || '1fr').join(' ');
</script>

<!-- The HTML structure is unchanged -->
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
        </div>
      {/each}
    {:else}
      <div class="empty-message">No data available.</div>
    {/if}
  </div>
</div>


<!-- The CSS has been updated for a more robust layout -->
<style>
  /* --- NEW LAYOUT: CSS GRID for fixed header --- */
  .datagrid-container {
    /* We define the container as a grid with two rows */
    display: grid; 
    /* Header gets its natural height, body takes all remaining space (1 fraction) */
    grid-template-rows: auto 1fr; 
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    overflow: hidden; /* Crucial for containing the grid layout */
    background-color: var(--color-background, #fff);
  }

  .datagrid-body {
    /* This is now the ONLY element that scrolls */
    overflow-y: auto; 
  }

  /* --- Column Alignment (Unchanged) --- */
  /* This CSS still controls the layout INSIDE the header and rows */
  .datagrid-header, .datagrid-row {
    display: grid;
    grid-template-columns: var(--grid-template-columns);
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }
  
  .datagrid-header {
    background-color: #f8fafc;
    position: relative; /* For z-index to work reliably */
    z-index: 1; /* Ensures header is above body content during scroll */
  }

  /* --- Cell Styling (Largely Unchanged) --- */
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

  .empty-message {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 2rem;
    color: var(--color-muted, #64748b);
  }
</style>