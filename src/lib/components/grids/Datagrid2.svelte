<script
  lang="ts"
  generics="T"
>
  /**
   * DataGrid2 Component
   *
   * Extends DataGrid with filtering capabilities using QueryGrammar (WhereCondition/WhereConditionGroup).
   * Follows the Composition Pattern: wraps DataGrid + FilterToolbar without modifying the base grid.
   *
   * Key Features:
   * - Text, Number, Boolean filters with auto-type detection
   * - AND/OR filter combination modes
   * - Clear all filters functionality
   * - Server-side filtering via onFilter callback
   * - Filter state reset coordination across all filter components
   */
  import Datagrid from './Datagrid.svelte';
  import type { DataGridProps } from './Datagrid.svelte';
  import FilterToolbar from './FilterToolbar.svelte';
  import type { FilterFunc } from './Datagrid.types';
  import type { WhereCondition, WhereConditionGroup } from '$lib/backendQueries/queryGrammar';
  import { log } from '$lib/utils/logger';
  import { SvelteMap } from 'svelte/reactivity';

  // DataGrid2 Props - extends DataGrid with filter functionality
  export type DataGrid2Props<T> = DataGridProps<T> & {
    onFilter?: FilterFunc<T>;
    filterCombineMode?: 'AND' | 'OR';
  };

  const {
    onFilter,
    filterCombineMode = 'AND',
    columns,
    ...datagridProps
  }: DataGrid2Props<T> = $props();

  // ========== Filter State Management ==========

  /**
   * IMPORTANT: We use SvelteMap (not regular Map) for reactivity.
   *
   * Why SvelteMap?
   * - Regular Map wrapped in $state does NOT track mutations (.set(), .delete())
   * - SvelteMap from 'svelte/reactivity' provides deep reactivity
   * - Reading .size, .get(), .has() in $derived or $effect automatically subscribes to changes
   * - Without SvelteMap, activeFilterCount would not update when filters change
   *
   * See: https://svelte.dev/docs/svelte/svelte-reactivity
   */
  let activeFilters = new SvelteMap<string, WhereCondition<T>>();

  /**
   * Filter combination mode: AND (all filters must match) or OR (any filter matches)
   */
  let combineMode = $state<'AND'|'OR'>(filterCombineMode);

  /**
   * Reset signal: Increment this to tell all filter components to clear their local state.
   * Each filter component watches this via $effect and resets when it changes.
   * This ensures UI inputs clear when "Clear all filters" is clicked.
   */
  let filterResetKey = $state(0);

  /**
   * Active filter count - derived reactively from SvelteMap.size
   * This powers the disabled state of the "Clear all filters" button.
   */
  const activeFilterCount = $derived(activeFilters.size);

  // ========== Filter Logic ==========

  /**
   * Builds the QueryGrammar WhereCondition structure from active filters.
   *
   * Returns:
   * - null if no filters active
   * - Single WhereCondition if only one filter active
   * - WhereConditionGroup with AND/OR operator for multiple filters
   */
  function buildWhereGroup(): WhereConditionGroup<T> | WhereCondition<T> | null {
    const conditions = Array.from(activeFilters.values());
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];  // Single condition - no group needed

    return {
      whereCondOp: combineMode,
      conditions
    };
  }

  /**
   * Handles filter changes from individual filter components.
   * Called when user types in text field, selects number operator, or changes boolean dropdown.
   *
   * Flow:
   * 1. Update activeFilters Map (add if condition, remove if null)
   * 2. Build WhereCondition/WhereConditionGroup from all active filters
   * 3. Call onFilter callback (typically triggers backend query)
   */
  async function handleFilterChange(columnKey: string, condition: WhereCondition<T> | null) {
    log.debug(`[DataGrid2] Filter change for key: ${columnKey}`, condition);

    if (condition) {
      activeFilters.set(columnKey, condition);
    } else {
      activeFilters.delete(columnKey);
    }

    const whereGroup = buildWhereGroup();
    log.debug(`[DataGrid2] Built where group (${activeFilters.size} active filters):`, whereGroup);

    await onFilter?.(whereGroup);
  }

  /**
   * Toggles between AND/OR filter combination modes.
   * Immediately re-applies filters with the new mode (triggers backend query).
   */
  function handleCombineModeToggle() {
    log.debug(`[DataGrid2] Toggling combine mode from ${combineMode} to ${combineMode === 'AND' ? 'OR' : 'AND'}`);
    combineMode = combineMode === 'AND' ? 'OR' : 'AND';
    const whereGroup = buildWhereGroup();
    log.debug(`[DataGrid2] Reapplying filters with new mode:`, whereGroup);
    onFilter?.(whereGroup);
  }

  /**
   * Clears all active filters.
   *
   * Important: This does THREE things:
   * 1. Clears the activeFilters Map (backend state)
   * 2. Increments filterResetKey (signals UI filter components to reset via $effect)
   * 3. Calls onFilter(null) to reload data without filters
   *
   * Without step 2, the UI inputs would still show old values even though filters are cleared.
   */
  function handleClearAllFilters() {
    log.debug(`[DataGrid2] Clearing all ${activeFilters.size} filters`);
    activeFilters.clear();
    filterResetKey++; // Signal filter components to reset their local state
    onFilter?.(null);
  }
</script>

<div class="datagrid2-container">
  <FilterToolbar
    {columns}
    {combineMode}
    {activeFilterCount}
    {filterResetKey}
    onFilterChange={handleFilterChange}
    onCombineModeToggle={handleCombineModeToggle}
    onClearAllFilters={handleClearAllFilters}
  />

  <Datagrid {...datagridProps} {columns} />
</div>

<style>
  .datagrid2-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
