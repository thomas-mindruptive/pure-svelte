<script lang="ts">
  /**
   * NumberFilter Component
   *
   * Provides numeric filtering with operator selection (=, >, <, >=, <=).
   * Supports both integer and decimal values with debounced input.
   *
   * Key Features:
   * - Operator selection: Choose comparison type (equals, greater than, etc.)
   * - Debounced input (300ms): Reduces backend queries during typing
   * - Auto-reset: Clears input and resets operator when resetKey changes
   *
   * Use Cases:
   * - ID filtering: offering_id = 123
   * - Price ranges: price >= 10
   * - Quantity comparisons: count < 100
   */
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import { ComparisonOperator } from '$lib/backendQueries/queryGrammar';
  import { debounce } from 'lodash-es';
  import { log } from '$lib/utils/logger';

  type Props = {
    columnKey: string;
    columnHeader: string;
    resetKey: number;  // Increment to clear this filter
    onChange: (condition: WhereCondition<any> | null) => void;
  };

  let { columnKey, columnHeader, resetKey, onChange }: Props = $props();

  let value = $state('');
  let operator = $state<ComparisonOperator>(ComparisonOperator.EQUALS);
  const selectId = `filter-number-op-${columnKey}`;
  const inputId = `filter-number-${columnKey}`;

  /**
   * Reset effect: Clears input AND operator when resetKey changes.
   * Unlike text filter, number filter has TWO UI states to reset.
   */
  $effect(() => {
    resetKey; // Track resetKey
    value = '';
    operator = ComparisonOperator.EQUALS;
  });

  /**
   * Debounced onChange handler.
   * Waits 300ms after last change (value OR operator) before triggering filter.
   *
   * Note: Both number input and operator select call this via handleChange.
   * Debouncing prevents rapid query triggers when user changes operator multiple times.
   */
  const debouncedOnChange = debounce((val: string, op: ComparisonOperator) => {
    if (val === '') {
      log.debug(`[NumberFilter] ${columnKey}: Clearing filter`);
      onChange(null);
    } else {
      const condition: WhereCondition<any> = {
        key: columnKey,
        whereCondOp: op,
        val: parseFloat(val)  // Converts string to number for SQL query
      };
      log.debug(`[NumberFilter] ${columnKey}: Setting filter`, condition);
      onChange(condition);
    }
  }, 300);

  function handleChange() {
    debouncedOnChange(value, operator);
  }
</script>

<div class="filter-input">
  <label for={inputId}>{columnHeader}</label>
  <div class="number-filter">
    <select id={selectId} bind:value={operator} onchange={handleChange} aria-label={`${columnHeader} comparison operator`}>
      <option value={ComparisonOperator.EQUALS}>=</option>
      <option value={ComparisonOperator.GT}>&gt;</option>
      <option value={ComparisonOperator.LT}>&lt;</option>
      <option value={ComparisonOperator.GTE}>&gt;=</option>
      <option value={ComparisonOperator.LTE}>&lt;=</option>
    </select>
    <input id={inputId} type="number" bind:value oninput={handleChange}/>
  </div>
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

  .number-filter {
    display: flex;
    gap: 0.25rem;
  }

  select {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    width: 60px;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    min-width: 0;
  }
</style>
