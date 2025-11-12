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
    initialFilterValues: Map<string, {operator: any, value: any}> | null;  // For UI state restore
    onFilterChange: (key: string, condition: WhereCondition<any> | null) => void;
    onCombineModeToggle: () => void;
    onClearAllFilters: () => void;
    showSuperuserWhere?: boolean;  // Enable raw SQL WHERE clause input (SUPERUSER MODE)
    onRawWhereChange?: (rawWhere: string | null) => void;
  };

  let {
    columns,
    combineMode,
    activeFilterCount,
    filterResetKey,
    initialFilterValues,
    onFilterChange,
    onCombineModeToggle,
    onClearAllFilters,
    showSuperuserWhere = false,
    onRawWhereChange
  }: Props = $props();

  // Superuser raw WHERE state
  let rawWhereInput = $state("");
  let rawWhereActive = $state(false);

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

  /**
   * Apply raw SQL WHERE clause (SUPERUSER MODE)
   */
  function applyRawWhere() {
    const trimmed = rawWhereInput.trim();
    if (trimmed.length === 0) {
      rawWhereActive = false;
      onRawWhereChange?.(null);
      return;
    }

    rawWhereActive = true;
    onRawWhereChange?.(trimmed);
  }

  /**
   * Clear raw WHERE clause
   */
  function clearRawWhere() {
    rawWhereInput = "";
    rawWhereActive = false;
    onRawWhereChange?.(null);
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

  {#if showSuperuserWhere}
    <div class="superuser-where-section">
      <div class="superuser-where-header">
        <span class="superuser-label">⚠️ SUPERUSER MODE: Raw SQL WHERE</span>
        {#if rawWhereActive}
          <span class="active-indicator">ACTIVE</span>
        {/if}
      </div>
      <textarea
        bind:value={rawWhereInput}
        class="raw-where-input"
        placeholder="Example: wioPrice > 100 AND wsName LIKE '%ACME%'"
        rows="2"
      ></textarea>
      <div class="superuser-where-actions">
        <button onclick={applyRawWhere} class="apply-raw-where-btn">
          Apply Raw WHERE
        </button>
        <button onclick={clearRawWhere} class="clear-raw-where-btn" disabled={!rawWhereActive}>
          Clear
        </button>
      </div>
      <div class="superuser-where-help">
        Allowed columns: wioId, wioTitle, wioPrice, wsName, pdefTitle, catName, ptName, etc.
      </div>
    </div>
  {/if}

  <div class="filter-inputs">
    {#each columns as col (col.key)}
      {#if isFilterableColumn(col) && col.filterable}
        {@const filterType = detectFilterType(col)}
        {@const initialValues = initialFilterValues?.get(col.key)}

        <!-- CRITICAL: {#key} forces complete recreation on reset, no $effect needed in filters -->
        {#key filterResetKey}
          {#if filterType === 'text'}
            <TextFilter
              columnKey={col.key}
              columnHeader={col.header}
              initialValue={initialValues?.value}
              onChange={(condition) => onFilterChange(col.key, condition)}
            />
          {:else if filterType === 'number'}
            <NumberFilter
              columnKey={col.key}
              columnHeader={col.header}
              initialValue={initialValues?.value}
              initialOperator={initialValues?.operator}
              onChange={(condition) => onFilterChange(col.key, condition)}
            />
          {:else if filterType === 'boolean'}
            <BooleanFilter
              columnKey={col.key}
              columnHeader={col.header}
              initialValue={initialValues?.value}
              onChange={(condition) => onFilterChange(col.key, condition)}
            />
          {/if}
        {/key}
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

  /* Superuser Raw WHERE Section */
  .superuser-where-section {
    padding: 1rem;
    background: #fff8e1;
    border: 2px solid #ffc107;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .superuser-where-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .superuser-label {
    font-weight: 600;
    color: #f57c00;
    font-size: 0.875rem;
  }

  .active-indicator {
    padding: 0.25rem 0.5rem;
    background: #4caf50;
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .raw-where-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ffc107;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    resize: vertical;
  }

  .raw-where-input:focus {
    outline: none;
    border-color: #f57c00;
    box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.2);
  }

  .superuser-where-actions {
    display: flex;
    gap: 0.5rem;
  }

  .apply-raw-where-btn {
    padding: 0.5rem 1rem;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
  }

  .apply-raw-where-btn:hover {
    background: #f57c00;
  }

  .clear-raw-where-btn {
    padding: 0.5rem 1rem;
    background: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
  }

  .clear-raw-where-btn:hover:not(:disabled) {
    background: #d32f2f;
  }

  .clear-raw-where-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .superuser-where-help {
    font-size: 0.75rem;
    color: #666;
    font-style: italic;
  }
</style>
