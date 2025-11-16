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
  import { log } from '$lib/utils/logger';
  import "$lib/components/styles/form-elements.css";

  type Props = {
    columnKey: string;
    columnHeader: string;
    initialValue?: any;  // For UI state restore from localStorage
    initialOperator?: ComparisonOperator;  // For UI state restore
    onChange: (condition: WhereCondition<any> | null) => void;
  };

  let { columnKey, columnHeader, initialValue, initialOperator, onChange }: Props = $props();

  let value = $state('');
  let operator = $state<ComparisonOperator>(initialOperator ?? ComparisonOperator.EQUALS);
  const selectId = `filter-number-op-${columnKey}`;
  const inputId = `filter-number-${columnKey}`;

  // Set initial value ONCE during initialization - NO event triggered
  if (initialValue !== undefined) {
    value = String(initialValue);
  }

  function update() {
    if (value === '') {
      log.debug(`[NumberFilter] ${columnKey}: Clearing filter`);
      onChange(null);
    } else {
      const condition: WhereCondition<any> = {
        key: columnKey,
        whereCondOp: operator,
        val: parseFloat(value)
      };
      log.debug(`[NumberFilter] ${columnKey}: Setting filter`, condition);
      onChange(condition);
    }
  }

  function handleInput(event: Event) {
    value = (event.target as HTMLInputElement).value;
    update();
  }

  function handleSelect(event: Event) {
    operator = (event.target as HTMLSelectElement).value as ComparisonOperator;
    update();
  }
</script>

<div class="filter-input">
  <label for={inputId}>{columnHeader}</label>
  <div class="number-filter">
    <select id={selectId} value={operator} onchange={handleSelect} aria-label={`${columnHeader} comparison operator`}>
      <option value={ComparisonOperator.EQUALS}>=</option>
      <option value={ComparisonOperator.GT}>&gt;</option>
      <option value={ComparisonOperator.LT}>&lt;</option>
      <option value={ComparisonOperator.GTE}>&gt;=</option>
      <option value={ComparisonOperator.LTE}>&lt;=</option>
    </select>
    <input
      id={inputId}
      type="number"
      {value}
      oninput={handleInput}
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
    />
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
    width: 60px;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
  }
</style>
