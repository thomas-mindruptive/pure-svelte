<script lang="ts">
  /**
   * TextFilter Component
   *
   * Provides text search filtering with debounced input to reduce backend queries.
   * Uses SQL LIKE operator with wildcards (%value%) for partial matching.
   *
   * Key Features:
   * - Debounced input (300ms): Waits for user to stop typing before triggering filter
   * - LIKE operator: Searches for partial matches (e.g., "kugel" matches "Kugelschreiber")
   * - Auto-reset: Clears input when resetKey changes (via "Clear all filters")
   *
   * Why Debounce?
   * - Without debounce, every keystroke triggers a backend query
   * - 300ms delay means query only fires after user pauses typing
   * - Reduces server load and improves UX (fewer partial result flashes)
   * - Uses Lodash debounce (stable, well-tested implementation)
   */
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import { ComparisonOperator } from '$lib/backendQueries/queryGrammar';
  import { debounce } from 'lodash-es';
  import { log } from '$lib/utils/logger';

  type Props = {
    columnKey: string;
    columnHeader: string;
    resetKey: number;  // Increment to clear this filter
    initialValue?: any;  // For UI state restore from localStorage
    onChange: (condition: WhereCondition<any> | null) => void;
  };

  let { columnKey, columnHeader, resetKey, initialValue, onChange }: Props = $props();

  let value = $state('');
  const inputId = `filter-text-${columnKey}`;
  let hasInitialized = false;

  /**
   * Mount effect: Set initial value from localStorage restore.
   * This runs once on mount to populate the input with saved filter value.
   */
  $effect(() => {
    if (!hasInitialized && initialValue !== undefined) {
      // Convert %value% back to value (remove LIKE wildcards)
      const cleanValue = typeof initialValue === 'string'
        ? initialValue.replace(/^%|%$/g, '')
        : String(initialValue);

      value = cleanValue;
      hasInitialized = true;
    }
  });

  /**
   * Reset effect: Clears input when resetKey changes.
   * This is triggered by the "Clear all filters" button in DataGrid2.
   *
   * Why $effect?
   * - Svelte 5's $effect runs whenever tracked dependencies change
   * - Simply reading resetKey inside $effect subscribes to it
   * - When resetKey increments, this effect re-runs and clears value
   */
  $effect(() => {
    resetKey; // Track resetKey
    value = '';
    hasInitialized = false;
  });

  /**
   * Debounced onChange handler.
   * Waits 300ms after last input before calling onChange callback.
   *
   * Behavior:
   * - Empty value: Clears filter (sends null to DataGrid2)
   * - Non-empty: Creates LIKE condition with wildcards (%value%)
   */
  const debouncedOnChange = debounce((val: string) => {
    if (val.trim() === '') {
      log.debug(`[TextFilter] ${columnKey}: Clearing filter`);
      onChange(null);
    } else {
      const condition: WhereCondition<any> = {
        key: columnKey,
        whereCondOp: ComparisonOperator.LIKE,
        val: `%${val}%`  // SQL LIKE wildcards for partial matching
      };
      log.debug(`[TextFilter] ${columnKey}: Setting filter`, condition);
      onChange(condition);
    }
  }, 300);

  function handleInput() {
    debouncedOnChange(value);
  }
</script>

<div class="filter-input">
  <label for={inputId}>{columnHeader}</label>
  <input id={inputId} type="text" bind:value oninput={handleInput} placeholder="Search..."/>
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

  input {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }
</style>
