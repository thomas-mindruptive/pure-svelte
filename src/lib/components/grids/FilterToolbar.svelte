<script lang="ts">
  /**
   * FilterToolbar Component
   *
   * Renders all filter input components based on column definitions.
   * Automatically detects filter types (text/number/boolean) from column keys.
   *
   * Features:
   * - Auto-type detection: "_id" -> number, "is_" -> boolean, default -> text
   * - AND/OR toggle button for filter combination
   * - "Clear all filters" button (disabled when no filters active)
   * - Passes resetKey to all filter components for synchronized reset
   *
   * Filter Type Detection:
   * - Explicit: Use col.filterType if specified
   * - Implicit: Parse column key for patterns (_id, price, is_, has_)
   * - Fallback: text filter
   */
  import type { ColumnDef } from './Datagrid.types';
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import TextFilter from './filters/TextFilter.svelte';
  import NumberFilter from './filters/NumberFilter.svelte';
  import BooleanFilter from './filters/BooleanFilter.svelte';

  type Props = {
    columns: ColumnDef<any>[];
    combineMode: 'AND' | 'OR';
    activeFilterCount: number;  // Drives "Clear all" button disabled state
    filterResetKey: number;     // Increment to signal all filters to reset
    onFilterChange: (key: string, condition: WhereCondition<any> | null) => void;
    onCombineModeToggle: () => void;
    onClearAllFilters: () => void;
  };

  let {
    columns,
    combineMode,
    activeFilterCount,
    filterResetKey,
    onFilterChange,
    onCombineModeToggle,
    onClearAllFilters
  }: Props = $props();

  /**
   * Type guard: Filters out computed columns (key === '<computed>').
   * Computed columns (e.g., action buttons) don't have filterable data.
   */
  function isFilterableColumn(col: ColumnDef<any>): col is Extract<ColumnDef<any>, { filterable?: boolean }> {
    return col.key !== '<computed>';
  }

  /**
   * Auto-detects filter type from column key naming conventions.
   *
   * Priority:
   * 1. Explicit: col.filterType if defined
   * 2. Pattern matching:
   *    - Contains "_id", "price", "count" -> number
   *    - Contains "is_", "has_" -> boolean
   * 3. Default: text
   *
   * Examples:
   * - "wio.offering_id" -> number
   * - "wio.is_assortment" -> boolean
   * - "wio.title" -> text
   */
  function detectFilterType(col: Extract<ColumnDef<any>, { filterable?: boolean }>): 'text' | 'number' | 'boolean' | 'select' {
    if ('filterType' in col && col.filterType) return col.filterType;

    const key = col.key.toString().toLowerCase();
    if (key.includes('_id') || key.includes('price') || key.includes('count')) return 'number';
    if (key.includes('is_') || key.includes('has_')) return 'boolean';

    return 'text';  // Default
  }
</script>

<div class="filter-toolbar">
  <div class="filter-controls">
    <button onclick={onCombineModeToggle} class="combine-toggle">
      {combineMode === 'AND' ? 'All match (AND)' : 'Any match (OR)'}
    </button>

    <button
      onclick={onClearAllFilters}
      class="clear-all-btn"
      disabled={activeFilterCount === 0}
      title="Clear all filters"
    >
      Clear all filters ({activeFilterCount})
    </button>
  </div>

  <div class="filter-inputs">
    {#each columns as col}
      {#if isFilterableColumn(col) && col.filterable}
        {@const filterType = detectFilterType(col)}

        {#if filterType === 'text'}
          <TextFilter
            columnKey={col.key}
            columnHeader={col.header}
            resetKey={filterResetKey}
            onChange={(condition) => onFilterChange(col.key, condition)}
          />
        {:else if filterType === 'number'}
          <NumberFilter
            columnKey={col.key}
            columnHeader={col.header}
            resetKey={filterResetKey}
            onChange={(condition) => onFilterChange(col.key, condition)}
          />
        {:else if filterType === 'boolean'}
          <BooleanFilter
            columnKey={col.key}
            columnHeader={col.header}
            resetKey={filterResetKey}
            onChange={(condition) => onFilterChange(col.key, condition)}
          />
        {/if}
      {/if}
    {/each}
  </div>
</div>

<style>
  .filter-toolbar {
    padding: 1rem;
    background: var(--color-background-secondary);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .filter-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .combine-toggle {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    background: white;
    cursor: pointer;
    border-radius: 4px;
  }

  .combine-toggle:hover {
    background: var(--color-background-secondary);
  }

  .clear-all-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    background: white;
    cursor: pointer;
    border-radius: 4px;
  }

  .clear-all-btn:hover:not(:disabled) {
    background: #fee;
    border-color: #f66;
  }

  .clear-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .filter-inputs {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
</style>
