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
  import { log } from '$lib/utils/logger';
  import "$lib/components/styles/form-elements.css";

  export type Props = {
    columnKey: string;
    columnHeader: string;
    initialValue?: any;  // For UI state restore from localStorage
    onChange: (condition: WhereCondition<any> | null) => void;
  };

  let { columnKey, columnHeader, initialValue, onChange }: Props = $props();

  let value = $state('');
  const inputId = `filter-text-${columnKey}`;

  // Set initial value ONCE during initialization - NO event triggered
  if (initialValue !== undefined) {
    value = typeof initialValue === 'string'
      ? initialValue.replace(/^%|%$/g, '')
      : String(initialValue);
  }

  function handleInput(event: Event) {
    // 1. Update state from DOM
    value = (event.target as HTMLInputElement).value;

    // 2. Notify parent
    if (value.trim() === '') {
      log.debug(`[TextFilter] ${columnKey}: Clearing filter`);
      onChange(null);
    } else {
      const condition: WhereCondition<any> = {
        key: columnKey,
        whereCondOp: ComparisonOperator.LIKE,
        val: `%${value}%`
      };
      log.debug(`[TextFilter] ${columnKey}: Setting filter`, condition);
      onChange(condition);
    }
  }
</script>

<div class="filter-input">
  <label for={inputId}>{columnHeader}</label>
  <input
    id={inputId}
    type="text"
    {value}
    oninput={handleInput}
    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
    placeholder="Search..."
  />
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
