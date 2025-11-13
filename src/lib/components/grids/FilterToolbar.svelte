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
  import type { ColumnDef, CustomFilterDef } from './Datagrid.types';
  import type { WhereCondition, WhereConditionGroup } from '$lib/backendQueries/queryGrammar';
  import TextFilter from './filters/TextFilter.svelte';
  import NumberFilter from './filters/NumberFilter.svelte';
  import BooleanFilter from './filters/BooleanFilter.svelte';

  type Props = {
    columns: ColumnDef<any>[];
    customFilters?: CustomFilterDef<any>[];  // NEW: Custom filter definitions
    combineMode: 'AND' | 'OR';
    activeFilterCount: number;  // Drives "Clear all" button disabled state
    filterResetKey: number;     // Increment to signal all filters to reset
    initialFilterValues: Map<string, {operator: any, value: any}> | null;  // For UI state restore
    filterExpanded: boolean;    // Controlled by parent (Datagrid), saved to localStorage
    onFilterChange: (key: string, condition: WhereCondition<any> | WhereConditionGroup<any> | null) => void;
    onCombineModeToggle: () => void;
    onClearAllFilters: () => void;
    onFilterToggle: (open: boolean) => void;  // Called when details opens/closes
    showSuperuserWhere?: boolean;  // Enable raw SQL WHERE clause input (SUPERUSER MODE)
    onRawWhereChange?: (rawWhere: string | null) => void;
  };

  let {
    columns,
    customFilters = [],  // NEW: Custom filters array
    combineMode,
    activeFilterCount,
    filterResetKey,
    initialFilterValues,
    filterExpanded,
    onFilterChange,
    onCombineModeToggle,
    onClearAllFilters,
    onFilterToggle,
    showSuperuserWhere = false,
    onRawWhereChange
  }: Props = $props();

  // Superuser raw WHERE state
  let rawWhereInput = $state("");
  let rawWhereActive = $state(false);

  // Custom filter state management
  let customFilterStates = $state<Map<string, any>>(new Map());

  // Determine if FilterToolbar should render (self-decision)
  const hasColumnFilters = $derived(
    columns.some(col => col.key !== '<computed>' && 'filterable' in col && col.filterable === true)
  );

  const hasQuickFilters = $derived(
    customFilters.some(f => f.placement.type === 'quickfilter')
  );

  const shouldRender = $derived(
    hasColumnFilters || hasQuickFilters
  );

  // Sort custom filters by placement
  const quickFilters = $derived(
    customFilters
      .filter(f => f.placement.type === 'quickfilter')
      .sort((a, b) => a.placement.pos - b.placement.pos)
  );

  // TODO: Implement column placement filters in future iteration
  // const columnInsertFilters = $derived(
  //   customFilters
  //     .filter(f => f.placement.type === 'column')
  //     .sort((a, b) => a.placement.pos - b.placement.pos)
  // );

  /**
   * Initialize custom filter states from initialFilterValues or defaults
   */
  $effect(() => {
    customFilters.forEach(filter => {
      const savedValue = initialFilterValues?.get(filter.id);
      if (savedValue !== undefined) {
        customFilterStates.set(filter.id, savedValue.value);
      } else if (filter.defaultValue !== undefined) {
        customFilterStates.set(filter.id, filter.defaultValue);
      }
    });
  });

  /**
   * Handle custom filter state changes
   */
  function handleCustomFilterChange(filterId: string, newValue: any) {
    customFilterStates.set(filterId, newValue);

    const filter = customFilters.find(f => f.id === filterId);
    if (!filter) return;

    const condition = filter.buildCondition(newValue);
    onFilterChange(filterId, condition);
  }

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

</script>

{#if shouldRender}
<details class="filter-details" open={filterExpanded} ontoggle={(e) => onFilterToggle((e.target as HTMLDetailsElement).open)}>
  <summary class="filter-summary">
    <span class="filter-summary-text">
      Filters {activeFilterCount > 0 ? `(${activeFilterCount} active)` : ''}
    </span>
    <div class="filter-summary-buttons">
      <button
        onclick={(e) => { e.preventDefault(); onCombineModeToggle(); }}
        class="combine-toggle"
      >
        {combineMode === 'AND' ? 'All match' : 'Any match'}
      </button>
      <button
        onclick={(e) => { e.preventDefault(); onClearAllFilters(); }}
        class="clear-all-btn"
        disabled={activeFilterCount === 0}
        title="Clear all filters"
      >
        Clear all filters
      </button>
    </div>
  </summary>

  <div class="filter-toolbar-content">
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
          Apply
        </button>
        <div class="superuser-where-help">
          <strong>Allowed columns:</strong>
          wioId, wioTitle, wioPrice, wioSize, wioDimensions, wioWeightGrams, wioComment, wioQuality, wioMaterialName, wioFormName, wioConstrTypeName, wioSurfFinishName, wsId, wsName, pdefId, pdefTitle, pdefMatName, pdefFormName, pdConstrTypeName, pdSurfFinName, pcId, catName, ptId, ptName
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Filters Section -->
  {#if quickFilters.length > 0}
    <div class="quick-filters-section">
      <span class="quick-filter-label">Quick Filters:</span>
      {#each quickFilters as filter (filter.id)}
        {#key filterResetKey}
          {#if filter.type === 'checkbox'}
            <label class="quick-filter-checkbox">
              <input
                type="checkbox"
                checked={customFilterStates.get(filter.id) ?? filter.defaultValue ?? false}
                onchange={(e) => handleCustomFilterChange(filter.id, (e.target as HTMLInputElement).checked)}
              />
              <span>{filter.label}</span>
            </label>
          {:else if filter.type === 'select'}
            <div class="quick-filter-select">
              <label for="quick-filter-{filter.id}">{filter.label}:</label>
              <select
                id="quick-filter-{filter.id}"
                value={customFilterStates.get(filter.id) ?? filter.defaultValue ?? ''}
                onchange={(e) => handleCustomFilterChange(filter.id, (e.target as HTMLSelectElement).value)}
              >
                <option value="">All</option>
                {#each filter.options ?? [] as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          {:else if filter.type === 'radio'}
            <div class="quick-filter-radio">
              <span>{filter.label}:</span>
              {#each filter.options ?? [] as option}
                <label>
                  <input
                    type="radio"
                    name={filter.id}
                    value={option.value}
                    checked={(customFilterStates.get(filter.id) ?? filter.defaultValue) === option.value}
                    onchange={() => handleCustomFilterChange(filter.id, option.value)}
                  />
                  {option.label}
                </label>
              {/each}
            </div>
          {:else if filter.type === 'custom' && filter.component}
            {@const Component = filter.component}
            <Component
              value={customFilterStates.get(filter.id) ?? filter.defaultValue}
              onChange={(newValue: any) => handleCustomFilterChange(filter.id, newValue)}
            />
          {/if}
        {/key}
      {/each}
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
</details>
{/if}

<style>
  .filter-details {
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    margin-bottom: 1rem;
    background: var(--color-surface, #fff);
  }

  .filter-summary {
    padding: 0.75rem 1rem;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    background: var(--color-surface-alt, #f8f9fa);
    border-radius: 4px;
  }

  .filter-summary:hover {
    background: var(--color-surface-hover, #e9ecef);
  }

  .filter-summary-text {
    display: inline-block;
    margin-right: 1rem;
  }

  .filter-summary-buttons {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    float: right;
  }

  .filter-toolbar-content {
    padding: 1rem;
    background: var(--color-background-secondary);
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 1rem;
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

  /* Quick Filters Styles */
  .quick-filters-section {
    padding: 0.75rem 1rem;
    background: var(--color-surface-alt, #f8f9fa);
    border-bottom: 1px solid var(--color-border, #dee2e6);
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .quick-filter-label {
    font-weight: 600;
    color: var(--color-text-muted, #6c757d);
    margin-right: 0.5rem;
  }

  .quick-filter-checkbox {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    user-select: none;
  }

  .quick-filter-checkbox input {
    cursor: pointer;
  }

  .quick-filter-select {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .quick-filter-select label {
    font-weight: 500;
  }

  .quick-filter-select select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 3px;
    background: var(--color-surface, #fff);
  }

  .quick-filter-radio {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .quick-filter-radio > span {
    font-weight: 500;
  }

  .quick-filter-radio label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
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
    align-items: center;
    gap: 1rem;
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

  .superuser-where-help {
    font-size: 0.75rem;
    color: #666;
    flex: 1;
  }

  .superuser-where-help strong {
    font-weight: 600;
  }
</style>
