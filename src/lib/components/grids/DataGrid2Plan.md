# DataGrid2 mit Filter-Funktionalität (basierend auf QueryGrammar)

## 1. Neue Types in Datagrid.types.ts

**KEINE neuen Filter-Types** - verwende bestehende QueryGrammar:

```typescript
import type {
  WhereCondition,
  WhereConditionGroup,
  ComparisonOperator,
  SortDescriptor
} from "$lib/backendQueries/queryGrammar";

// Filter Callback (analog zu SortFunc)
export type FilterFunc<T> = (
  where: WhereCondition<T> | WhereConditionGroup<T> | null
) => void | Promise<void>;

// ColumnDef erweitern
export interface ColumnDef<T> {
  key: string;
  header: string;
  accessor?: (row: any) => any;
  sortable?: boolean;
  width?: string;
  filterable?: boolean;  // NEU
  filterType?: 'text' | 'number' | 'boolean' | 'select';  // NEU - optional override
  filterOperator?: ComparisonOperator;  // NEU - default operator
  filterOptions?: { label: string; value: unknown }[];  // NEU - für Select
}

// DataGrid2 Props (erweitert DataGridProps)
export interface DataGrid2Props<T> extends DataGridProps<T> {
  onFilter?: FilterFunc<T>;
  filterCombineMode?: 'AND' | 'OR';  // Initial mode
}
```

---

## 2. DataGrid2 Komponente (Composition)

**src/lib/components/grids/Datagrid2.svelte:**

```svelte
<script lang="ts">
  import Datagrid from './Datagrid.svelte';
  import FilterToolbar from './FilterToolbar.svelte';
  import type { DataGrid2Props } from './Datagrid.types';
  import type { WhereCondition, WhereConditionGroup } from '$lib/backendQueries/queryGrammar';

  type T = any;  // Generic parameter
  let {
    onFilter,
    filterCombineMode = 'AND',
    columns,
    ...datagridProps
  }: DataGrid2Props<T> = $props();

  // Filter State: Map<columnKey, WhereCondition>
  let activeFilters = $state<Map<string, WhereCondition<T>>>(new Map());
  let combineMode = $state<'AND'|'OR'>(filterCombineMode);

  // Build WhereConditionGroup from activeFilters
  function buildWhereGroup(): WhereConditionGroup<T> | WhereCondition<T> | null {
    const conditions = Array.from(activeFilters.values());
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];  // Single condition

    return {
      whereCondOp: combineMode,
      conditions
    };
  }

  // Filter Handler (called by FilterToolbar)
  async function handleFilterChange(columnKey: string, condition: WhereCondition<T> | null) {
    if (condition) {
      activeFilters.set(columnKey, condition);
    } else {
      activeFilters.delete(columnKey);
    }

    const whereGroup = buildWhereGroup();
    await onFilter?.(whereGroup);
  }

  function handleCombineModeToggle() {
    combineMode = combineMode === 'AND' ? 'OR' : 'AND';
    const whereGroup = buildWhereGroup();
    onFilter?.(whereGroup);
  }
</script>

<div class="datagrid2-container">
  <FilterToolbar
    {columns}
    {combineMode}
    onFilterChange={handleFilterChange}
    onCombineModeToggle={handleCombineModeToggle}
  />

  <Datagrid {...datagridProps} {columns} />
</div>
```

---

## 3. FilterToolbar Komponente

**src/lib/components/grids/FilterToolbar.svelte:**

```svelte
<script lang="ts">
  import type { ColumnDef } from './Datagrid.types';
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import TextFilter from './filters/TextFilter.svelte';
  import NumberFilter from './filters/NumberFilter.svelte';
  import BooleanFilter from './filters/BooleanFilter.svelte';

  type T = any;
  let {
    columns,
    combineMode,
    onFilterChange,
    onCombineModeToggle
  }: {
    columns: ColumnDef<T>[];
    combineMode: 'AND' | 'OR';
    onFilterChange: (key: string, condition: WhereCondition<T> | null) => void;
    onCombineModeToggle: () => void;
  } = $props();

  // Auto-detect filter type from column key
  function detectFilterType(col: ColumnDef<T>): 'text' | 'number' | 'boolean' | 'select' {
    if (col.filterType) return col.filterType;

    const key = col.key.toString().toLowerCase();
    if (key.includes('_id') || key.includes('price') || key.includes('count')) return 'number';
    if (key.includes('is_') || key.includes('has_')) return 'boolean';

    return 'text';  // Default
  }
</script>

<div class="filter-toolbar">
  <button onclick={onCombineModeToggle} class="combine-toggle">
    {combineMode === 'AND' ? 'All match (AND)' : 'Any match (OR)'}
  </button>

  <div class="filter-inputs">
    {#each columns as col}
      {#if col.filterable}
        {@const filterType = detectFilterType(col)}

        {#if filterType === 'text'}
          <TextFilter
            columnKey={col.key}
            columnHeader={col.header}
            onChange={(condition) => onFilterChange(col.key, condition)}
          />
        {:else if filterType === 'number'}
          <NumberFilter
            columnKey={col.key}
            columnHeader={col.header}
            onChange={(condition) => onFilterChange(col.key, condition)}
          />
        {:else if filterType === 'boolean'}
          <BooleanFilter
            columnKey={col.key}
            columnHeader={col.header}
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
    gap: 1rem;
    align-items: center;
  }

  .combine-toggle {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    background: white;
    cursor: pointer;
  }

  .filter-inputs {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    flex: 1;
  }
</style>
```

---

## 4. Filter Input Komponenten

### TextFilter mit Lodash debounce

**src/lib/components/grids/filters/TextFilter.svelte:**

```svelte
<script lang="ts">
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import { ComparisonOperator } from '$lib/backendQueries/queryGrammar';
  import { debounce } from 'lodash-es';

  type T = any;
  let { columnKey, columnHeader, onChange } = $props<{
    columnKey: string;
    columnHeader: string;
    onChange: (condition: WhereCondition<T> | null) => void;
  }>();

  let value = $state('');

  // Lodash debounce - 300ms delay
  const debouncedOnChange = debounce((val: string) => {
    if (val.trim() === '') {
      onChange(null);
    } else {
      const condition: WhereCondition<T> = {
        key: columnKey,
        whereCondOp: ComparisonOperator.LIKE,
        val: `%${val}%`
      };
      onChange(condition);
    }
  }, 300);

  function handleInput() {
    debouncedOnChange(value);
  }
</script>

<div class="filter-input">
  <label>{columnHeader}</label>
  <input type="text" bind:value oninput={handleInput} placeholder="Search..."/>
</div>

<style>
  .filter-input {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 150px;
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
```

### NumberFilter mit Lodash debounce

**src/lib/components/grids/filters/NumberFilter.svelte:**

```svelte
<script lang="ts">
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import { ComparisonOperator } from '$lib/backendQueries/queryGrammar';
  import { debounce } from 'lodash-es';

  type T = any;
  let { columnKey, columnHeader, onChange } = $props<{
    columnKey: string;
    columnHeader: string;
    onChange: (condition: WhereCondition<T> | null) => void;
  }>();

  let value = $state('');
  let operator = $state<ComparisonOperator>(ComparisonOperator.EQUALS);

  // Lodash debounce - 300ms delay
  const debouncedOnChange = debounce((val: string, op: ComparisonOperator) => {
    if (val === '') {
      onChange(null);
    } else {
      const condition: WhereCondition<T> = {
        key: columnKey,
        whereCondOp: op,
        val: parseFloat(val)
      };
      onChange(condition);
    }
  }, 300);

  function handleChange() {
    debouncedOnChange(value, operator);
  }
</script>

<div class="filter-input">
  <label>{columnHeader}</label>
  <div class="number-filter">
    <select bind:value={operator} onchange={handleChange}>
      <option value={ComparisonOperator.EQUALS}>=</option>
      <option value={ComparisonOperator.GT}>&gt;</option>
      <option value={ComparisonOperator.LT}>&lt;</option>
      <option value={ComparisonOperator.GTE}>&gt;=</option>
      <option value={ComparisonOperator.LTE}>&lt;=</option>
    </select>
    <input type="number" bind:value oninput={handleChange}/>
  </div>
</div>

<style>
  .filter-input {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 150px;
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
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }
</style>
```

### BooleanFilter (kein debounce nötig)

**src/lib/components/grids/filters/BooleanFilter.svelte:**

```svelte
<script lang="ts">
  import type { WhereCondition } from '$lib/backendQueries/queryGrammar';
  import { ComparisonOperator } from '$lib/backendQueries/queryGrammar';

  type T = any;
  let { columnKey, columnHeader, onChange } = $props<{
    columnKey: string;
    columnHeader: string;
    onChange: (condition: WhereCondition<T> | null) => void;
  }>();

  let value = $state<'all' | 'true' | 'false'>('all');

  function handleChange() {
    if (value === 'all') {
      onChange(null);
    } else {
      const condition: WhereCondition<T> = {
        key: columnKey,
        whereCondOp: ComparisonOperator.EQUALS,
        val: value === 'true'
      };
      onChange(condition);
    }
  }
</script>

<div class="filter-input">
  <label>{columnHeader}</label>
  <select bind:value onchange={handleChange}>
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
    min-width: 150px;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
  }

  select {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }
</style>
```

---

## 5. Reports Hierarchie

**navHierarchyConfig.ts erweitern:**

```typescript
export const reportsHierarchyConfig: HierarchyTree = {
  name: "reports",
  rootItem: createHierarchyNode({
    item: {
      key: "reports",
      type: "list",
      href: "/reports",
      label: "Reports"
    },
    children: [
      createHierarchyNode({
        item: {
          key: "offerings",
          type: "list",
          href: "/reports/offerings",
          label: "Offerings"
        }
      })
    ]
  })
};

// In getAppHierarchies() hinzufügen:
export function getAppHierarchies(): Hierarchy {
  return [
    supplierHierarchyConfig,
    productCategoriesHierarchyConfig,
    attributesHierarchyConfig,
    ordersHierarchyConfig,
    testHierarchyConfig,
    reportsHierarchyConfig  // NEU
  ];
}
```

---

## 6. Route /reports/offerings (Page Delegation Pattern)

**Route Files:**
- `src/routes/(browser)/reports/+page.ts` - Delegator (Reports Index)
- `src/routes/(browser)/reports/+page.svelte` - Delegator
- `src/routes/(browser)/reports/offerings/+page.ts` - Delegiert zu offeringReportListPage
- `src/routes/(browser)/reports/offerings/+page.svelte` - Delegiert zu Component

**Load Function (offeringReportListPage.ts):**

```typescript
import type { LoadEvent } from "@sveltejs/kit";
import { ApiClient } from "$lib/api/client/apiClient";
import { getOfferingApi } from "$lib/api/client/offering";

export function load({ fetch }: LoadEvent) {
  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  // Promise ohne await - für Streaming
  const offerings = offeringApi.loadNestedOfferingsWithLinks();

  return { offerings, loadEventFetch: fetch };
}
```

**Page Component (OfferingReportListPage.svelte):**

```svelte
<script lang="ts">
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingApi } from "$lib/api/client/offering";
  import OfferingReportGrid from "./OfferingReportGrid.svelte";
  import type {
    SortDescriptor,
    WhereCondition,
    WhereConditionGroup
  } from "$lib/backendQueries/queryGrammar";

  let { data } = $props();
  let resolvedOfferings = $state([]);
  let isLoading = $state(true);
  let currentWhere = $state<WhereCondition | WhereConditionGroup | null>(null);
  let currentSort = $state<SortDescriptor[] | null>(null);

  const client = new ApiClient(data.loadEventFetch);
  const offeringApi = getOfferingApi(client);

  // Initial Load
  $effect(() => {
    let aborted = false;

    const processPromise = async () => {
      isLoading = true;
      try {
        if (!aborted) {
          resolvedOfferings = await data.offerings;
        }
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    processPromise();
    return () => { aborted = true; };
  });

  // Filter Handler
  async function handleFilter(where: WhereConditionGroup | WhereCondition | null) {
    currentWhere = where;
    isLoading = true;
    try {
      resolvedOfferings = await offeringApi.loadNestedOfferingsWithLinks(where, currentSort);
    } finally {
      isLoading = false;
    }
  }

  // Sort Handler
  async function handleSort(sort: SortDescriptor[] | null) {
    currentSort = sort;
    isLoading = true;
    try {
      resolvedOfferings = await offeringApi.loadNestedOfferingsWithLinks(currentWhere, sort);
    } finally {
      isLoading = false;
    }
  }
</script>

<h1>Offerings Report</h1>
<OfferingReportGrid
  rows={resolvedOfferings}
  loading={isLoading}
  onFilter={handleFilter}
  onSort={handleSort}
/>
```

---

## 7. Implementierungs-Reihenfolge

1. Types erweitern (Datagrid.types.ts)
2. TextFilter.svelte (mit Lodash debounce)
3. NumberFilter.svelte (mit Lodash debounce)
4. BooleanFilter.svelte
5. FilterToolbar.svelte
6. Datagrid2.svelte
7. Reports Hierarchie (navHierarchyConfig.ts)
8. Routes + Pages (/reports, /reports/offerings)
9. OfferingReportGrid mit Spalten-Config
10. Test: Filter + Sort kombiniert
