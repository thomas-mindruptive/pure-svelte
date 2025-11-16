<script lang="ts">
  /**
   * BooleanFilter Component
   *
   * Provides boolean/checkbox filtering with three states: All, Yes (true), No (false).
   * No debounce needed - dropdown changes are deliberate user actions.
   *
   * Key Features:
   * - Three-state dropdown: All (no filter), Yes (true), No (false)
   * - Instant filtering: No debounce needed (unlike text input)
   * - Auto-reset: Returns to "All" when resetKey changes
   *
   * Use Cases:
   * - is_assortment: Filter by assortment status
   * - is_active: Filter by active/inactive items
   * - has_image: Filter by image presence
   *
   * Why No Debounce?
   * - Dropdown selection is a single, deliberate action (not continuous input)
   * - User expects immediate response when selecting Yes/No
   * - Unlike typing, there's no "partial state" to debounce
   */
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import { ComparisonOperator } from '$lib/backendQueries/queryGrammar';
  import { log } from '$lib/utils/logger';
  import "$lib/components/styles/form-elements.css";

  export type Props = {
    columnKey: string;
    columnHeader: string;
    initialValue?: any;  // For UI state restore from localStorage
    onChange: (condition: WhereCondition<any> | null) => void;
  };

  let { columnKey, columnHeader, initialValue, onChange }: Props = $props();

  let value = $state<'all' | 'true' | 'false'>('all');
  const selectId = `filter-boolean-${columnKey}`;

  // Set initial value ONCE during initialization - NO event triggered
  if (initialValue === true) {
    value = 'true';
  } else if (initialValue === false) {
    value = 'false';
  }

  function handleChange(event: Event) {
    // 1. Update state from DOM
    value = (event.target as HTMLSelectElement).value as 'all' | 'true' | 'false';

    // 2. Notify parent
    if (value === 'all') {
      log.debug(`[BooleanFilter] ${columnKey}: Clearing filter`);
      onChange(null);
    } else {
      const condition: WhereCondition<any> = {
        key: columnKey,
        whereCondOp: ComparisonOperator.EQUALS,
        val: value === 'true'  // Convert string to boolean
      };
      log.debug(`[BooleanFilter] ${columnKey}: Setting filter`, condition);
      onChange(condition);
    }
  }
</script>

<div class="filter-input">
  <label for={selectId}>{columnHeader}</label>
  <select id={selectId} {value} onchange={handleChange}>
    <option value="all">All</option>
    <option value="true">Yes</option>
    <option value="false">No</option>
  </select>
</div>

<style>
  .filter-input {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 180px;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
  }
</style>
