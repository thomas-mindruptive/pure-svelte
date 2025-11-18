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
    currentWhere?: WhereCondition<any> | WhereConditionGroup<any> | null; // Combined effective filters from Grid
    filterResetKey: number;     // Increment to signal all filters to reset
    initialFilterValues: Map<string, {operator: any, value: any}> | null;  // For UI state restore
    filterExpanded: boolean;    // Controlled by parent (Datagrid), saved to localStorage
    onFilterChange: (key: string, condition: WhereCondition<any> | WhereConditionGroup<any> | null) => void;
    onCombineModeToggle: () => void;
    onClearAllFilters: () => void;
    onFilterToggle: (open: boolean) => void;  // Called when details opens/closes
    showSuperuserWhere?: boolean;  // Enable raw SQL WHERE clause input (SUPERUSER MODE)
    onRawWhereChange?: (rawWhere: string | null) => void;
    onUpdateInitialFilterValues?: (updates: Map<string, {operator: any, value: any}>) => void;  // Update initialFilterValues for UI projection
    onIncrementFilterResetKey?: () => void;  // Increment filterResetKey to re-render filters
  };

  let {
    columns,
    customFilters = [],  // NEW: Custom filters array
    combineMode,
    activeFilterCount,
    currentWhere = null,
    filterResetKey,
    initialFilterValues,
    filterExpanded,
    onFilterChange,
    onCombineModeToggle,
    onClearAllFilters,
    onFilterToggle,
    showSuperuserWhere = false,
    onRawWhereChange,
    onUpdateInitialFilterValues,
    onIncrementFilterResetKey
  }: Props = $props();

  // Superuser raw WHERE state
  let rawWhereInput = $state("");
  let rawWhereActive = $state(false);

  // Custom filter state management
  let customFilterStates = $state<Map<string, any>>(new Map());

  // Popover element reference (for programmatic close via ✕)
  let wherePopoverEl = $state<HTMLDivElement | null>(null);

  function prettyWhere(): string {
    try {
      return JSON.stringify(currentWhere, null, 2) ?? 'null';
    } catch {
      return String(currentWhere);
    }
  }

  // Using native popover toggling via popovertarget on the button; no JS toggle needed

  async function copyWhereToClipboard() {
    try {
      await navigator.clipboard.writeText(prettyWhere());
    } catch {
      // no-op
    }
  }

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

  /**
   * Initialize custom filter states from initialFilterValues or defaults
   * Only runs once on mount - initialFilterValues is for column filters, not QuickFilters
   */
  $effect(() => {
    customFilters.forEach(filter => {
      // Only initialize if not already set (prevents overwriting QuickFilter state)
      if (customFilterStates.has(filter.id)) {
        return; // Skip - already has a value from QuickFilter
      }
      const savedValue = initialFilterValues?.get(filter.id);
      if (savedValue !== undefined) {
        customFilterStates.set(filter.id, savedValue.value);
      } else if (filter.defaultValue !== undefined) {
        customFilterStates.set(filter.id, filter.defaultValue);
      }
    });
  });

  /**
   * Recursively extracts all WhereCondition objects from a WhereConditionGroup
   * Handles nested structures like: { whereCondOp: 'AND', conditions: [ { whereCondOp: 'OR', conditions: [...] }, ... ] }
   */
  function extractAllWhereConditionsRecursive(
    condition: WhereCondition<any> | WhereConditionGroup<any>
  ): Array<{ key: string; operator: any; value: any }> {
    const results: Array<{ key: string; operator: any; value: any }> = [];
    
    // Base case: single WhereCondition
    if ('key' in condition && 'whereCondOp' in condition && 'val' in condition) {
      results.push({
        key: String(condition.key),
        operator: condition.whereCondOp,
        value: condition.val
      });
      return results;
    }
    
    // Recursive case: WhereConditionGroup
    if ('conditions' in condition && Array.isArray(condition.conditions)) {
      condition.conditions.forEach(cond => {
        results.push(...extractAllWhereConditionsRecursive(cond));
      });
    }
    
    return results;
  }

  /**
   * Handle custom filter state changes
   * Projects WhereConditionGroup to individual filter fields for UI display
   */
  function handleCustomFilterChange(filterId: string, newValue: any) {
    console.log('[FilterToolbar] handleCustomFilterChange', { filterId, newValue });
    customFilterStates.set(filterId, newValue);

    const filter = customFilters.find(f => f.id === filterId);
    if (!filter) return;

    const condition = filter.buildCondition(newValue);
    console.log('[FilterToolbar] buildCondition result', condition);
    
    // 1. Set the Quick-Filter condition → triggers API call (1x)
    onFilterChange(filterId, condition);

    // 2. Project WhereConditionGroup to initialFilterValues (no API calls)
    if (condition && onUpdateInitialFilterValues) {
      const updates = new Map<string, {operator: any, value: any}>();
      
      // Handle single WhereCondition
      if ('key' in condition) {
        updates.set(String(condition.key), {
          operator: condition.whereCondOp,
          value: condition.val
        });
      }
      // Handle WhereConditionGroup
      else if ('conditions' in condition && condition.conditions) {
        // ✅ Recursively extract ALL WhereConditions from nested structure
        const allConditions = extractAllWhereConditionsRecursive(condition);
        allConditions.forEach(cond => {
          updates.set(cond.key, {
            operator: cond.operator,
            value: cond.value
          });
        });
      }
      
      // Update initialFilterValues (triggers UI update, no API calls)
      if (updates.size > 0) {
        onUpdateInitialFilterValues(updates);
      }
      // DON'T increment filterResetKey here - it destroys and recreates the component,
      // causing focus loss. Only increment on actual reset operations.
    }
    // If condition is null (filter cleared), clear the projected values
    else if (!condition && onUpdateInitialFilterValues) {
      // Clear all projected values for this filter
      // We need to know which columns were affected - for now, clear all if condition is null
      // This could be improved by tracking which columns were set by this quick filter
      const updates = new Map<string, {operator: any, value: any}>();
      onUpdateInitialFilterValues(updates);
      if (onIncrementFilterResetKey) {
        onIncrementFilterResetKey();
      }
    }
  }

  /**
   * Handle column filter changes
   * No reverse sync to Quick-Filter (simpler, avoids conflicts)
   */
  function handleColumnFilterChange(columnKey: string, condition: WhereCondition<any> | WhereConditionGroup<any> | null) {
    // Always call the original handler to update the filter
    onFilterChange(columnKey, condition);
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

  /**
   * Ensure "Clear all filters" also clears local quick-filter UI state.
   * We keep the centralized clear (Datagrid) as the single source of truth
   * and additionally reset our local customFilterStates so custom components
   * like QuickTwoTextFilter are visually cleared.
   */
  function handleClearAllClick(e: Event) {
    e.preventDefault();
    // Reset all quick filter UI states (they read from this Map)
    customFilterStates = new Map();
    // Delegate to parent to clear backend filters and trigger re-render
    onClearAllFilters();
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
        type="button"
        onclick={(e) => { e.preventDefault(); onCombineModeToggle(); }}
        class="combine-toggle"
      >
        {combineMode === 'AND' ? 'All match' : 'Any match'}
      </button>
      <button
        type="button"
        onclick={handleClearAllClick}
        class="clear-all-btn"
        disabled={activeFilterCount === 0}
        title="Clear all filters"
      >
        Clear all filters
      </button>
      <button
        type="button"
        class="where-json-btn"
        id="where-json-button"
        popovertarget="where-json-popover"
        popovertargetaction="toggle"
        title="Show effective filter JSON"
        aria-haspopup="true"
      >
        ℹ Filters
      </button>
    </div>
  </summary>

  <div class="filter-toolbar-content">
    <!-- Native HTML Popover for effective Where JSON -->
    <div
      id="where-json-popover"
      popover="auto"
      bind:this={wherePopoverEl}
      class="where-popover"
      role="dialog"
      aria-label="Effective filters (JSON)"
    >
      <div class="where-popover__header">
        <strong>Effective filters (JSON)</strong>
        <div class="where-popover__actions">
          <button type="button" onclick={copyWhereToClipboard} class="copy-btn">Copy</button>
          <button
            type="button"
            class="close-btn"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // @ts-ignore
              wherePopoverEl?.hidePopover?.();
            }}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <pre class="where-popover__content">{prettyWhere()}</pre>
    </div>

    {#if showSuperuserWhere}
    <details class="superuser-where-details">
      <summary>
        <span class="superuser-label">⚠️Raw SQL WHERE</span>
        {#if rawWhereActive}
          <span class="active-indicator">ACTIVE</span>
        {/if}
      </summary>
      <div class="superuser-where-section">
        <textarea
          bind:value={rawWhereInput}
          class="raw-where-input"
          placeholder="Example: wioPrice > 100 AND wsName LIKE '%ACME%'"
          rows="2"
        ></textarea>
        <div class="superuser-where-actions">
          <button type="button" onclick={applyRawWhere} class="apply-raw-where-btn">
            Apply
          </button>
          <div class="superuser-where-help">
            <strong>Allowed columns:</strong>
            wioId, wioTitle, wioPrice, wioSize, wioDimensions, wioWeightGrams, wioComment, wioQuality, wioMaterialName, wioFormName, wioConstrTypeName, wioSurfFinishName, wsId, wsName, pdefId, pdefTitle, pdefMatName, pdefFormName, pdConstrTypeName, pdSurfFinName, pcId, catName, ptId, ptName
          </div>
        </div>
      </div>
    </details>
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

  <details class="field-filters-details">
    <summary>Field filters</summary>
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
                onChange={(condition: WhereCondition<any> | null) => handleColumnFilterChange(col.key, condition)}
              />
            {:else if filterType === 'number'}
              <NumberFilter
                columnKey={col.key}
                columnHeader={col.header}
                initialValue={initialValues?.value}
                initialOperator={initialValues?.operator}
                onChange={(condition: WhereCondition<any> | null) => handleColumnFilterChange(col.key, condition)}
              />
            {:else if filterType === 'boolean'}
              <BooleanFilter
                columnKey={col.key}
                columnHeader={col.header}
                initialValue={initialValues?.value}
                onChange={(condition: WhereCondition<any> | null) => handleColumnFilterChange(col.key, condition)}
              />
            {/if}
          {/key}
        {/if}
      {/each}
    </div>
  </details>
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
    margin-left: 1rem;
    float: none;
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

  .where-json-btn {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    background: #eef5ff;
    color: #0b5fff;
    cursor: pointer;
    border-radius: 4px;
    font-weight: 600;
    /* Anchor for CSS anchor positioning of popover */
    anchor-name: --filters-json-btn;
  }

  .where-json-btn:hover {
    background: #dbe9ff;
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

  /* Where JSON Popover */
  .where-popover {
    width: min(800px, 92vw);
    max-height: 70vh;
    overflow: auto;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    background: var(--color-surface, #fff);
    box-shadow: 0 6px 16px rgba(0,0,0,0.15);
    /* Position directly under the button using CSS anchor positioning */
    position-anchor: --filters-json-btn;
    inset: anchor(bottom) auto auto anchor(left);
    margin-top: 8px;
  }

  .where-popover__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .where-popover__actions {
    display: inline-flex;
    gap: 0.5rem;
  }

  .copy-btn, .close-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border, #ddd);
    background: #f8f9fa;
    border-radius: 4px;
    cursor: pointer;
  }

  .copy-btn:hover, .close-btn:hover {
    background: #eef1f4;
  }

  .where-popover__content {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    margin: 0;
  }
</style>
