# Datagrid Component Architecture

This document describes the architecture, usage patterns, and best practices for the `Datagrid.svelte` component and related filtering mechanisms.

---

## Enhanced Datagrid Component

The generic `Datagrid.svelte` component has been enhanced to be more autonomous and feature-rich, simplifying its usage in list pages across the application.

### Autonomous Sorting

The Datagrid now manages its own sorting state and data loading lifecycle. This is achieved through a new architectural pattern where the responsibility for sorting is moved into the component itself.

-   **`apiLoadFunc` Prop:** A parent component (e.g., `SupplierListPage.svelte`) can now pass an `apiLoadFunc` property to the Datagrid. This function serves as a callback that the Datagrid can invoke whenever a new data state is required.
-   **Internal State Management:** The Datagrid maintains its own internal `sortState`, which is an array of `SortDescriptor` objects to support multi-column sorting. When a user clicks a column header, the Datagrid updates this internal state.
-   **Data-Driven Reloading:** After updating its `sortState`, the Datagrid calls the provided `apiLoadFunc` with the new sort descriptors. This is where the seamless integration with the **Query Grammar** happens: the parent-provided function is responsible for translating the `SortDescriptor[]` array into the `orderBy` clause of a `QueryPayload` object and executing the API call. The Datagrid then updates its internal `rows` with the new, sorted data from the server.
-   **Simplified Parent Components:** This new architecture drastically simplifies the parent list pages. They are now only responsible for providing the initial data set and the `apiLoadFunc` callback. All subsequent sorting-related state management and data fetching is encapsulated within the Datagrid.

### Implementation Pattern for Datagrid Integration
**MANDATORY structure** for entity grids:

```typescript
// EntityGrid.svelte - Thin wrapper
const columns: ColumnDef<Entity>[] = [
  { key: "name", header: "Name", sortable: true },
  // Define all columns with proper typing
];

const getId = (r: Entity) => r.entity_id;
```

```svelte
<Datagrid
  {rows}
  {columns}
  {getId}
  gridId="entities"
  entity="entity"
  {deleteStrategy}
  {rowActionStrategy}
  {apiLoadFunc}
  maxBodyHeight="550px"
/>
```

**Reference Example:** `src/lib/components/domain/suppliers/SupplierGrid.svelte`

### Scrollable Body with Sticky Header

To improve the user experience with long lists of data, the Datagrid now supports a scrollable body with a fixed (sticky) header and toolbar.

-   **Activation:** This behavior is enabled by adding the `.pc-grid--scroll-body` CSS modifier class to the Datagrid's root element.
-   **Dynamic Height Control:** The height of the scrollable area is controlled via a `maxBodyHeight` prop, which sets a `--pc-grid-body-max-height` CSS variable. This allows parent components to flexibly define the grid's dimensions (e.g., `maxBodyHeight="75vh"`).
-   **Implementation:** The component's internal structure uses a CSS Flexbox layout. The toolbar and table header (`<thead>`) have a fixed size (`flex-shrink: 0`), while the table body container (`.pc-grid__scroller`) is configured to grow and fill the remaining available space (`flex-grow: 1`) and manage its own vertical scrollbar. The `<thead>` uses `position: sticky` to remain visible within this scrollable container.

### Grid Query Pattern (Canonical)

**MANDATORY:** All grids must use `onQueryChange` for filtering and sorting. Never use `onSort` in new code.

- Always wire `onQueryChange({ filters, sort })`. Do not use `onSort` in new code.
- Column definitions: set `filterable` and a precise `filterType` (`text|number|boolean|select`).
- FilterToolbar:
  - AND/OR toggle and "Clear all filters" are inline next to the "Filters" summary.
  - Quick-Filter sets WhereCondition once; UI projection via `onUpdateInitialFilterValues` + `onIncrementFilterResetKey` (no extra API calls).
- Persist state with `gridId` (via `gridState`).

### QuickFilter Mechanism

QuickFilters enable complex, multi-column filtering logic that cannot be expressed with simple column-based filters. They generate nested `WhereConditionGroup` structures that combine multiple database columns using OR/AND logic.

**Architectural Concept:**
- QuickFilters create complex `WhereConditionGroup` structures (e.g., `(A OR B) AND (C OR D)`)
- These structures are **NOT projected onto normal filter fields** - they remain independent
- The overall `WhereConditionGroup` contains both QuickFilter conditions and column filter conditions
- Depending on "match any" or "match all" settings, these are combined with normal filter field conditions
- QuickFilters project their individual conditions to `initialFilterValues` for UI display only (no API calls)

**Data Flow:**

1. **User Input → QuickFilter Component:**
   - Custom filter component (e.g., `QuickTwoTextFilter`) maintains local state (`localValue`)
   - On input, calls `onChange(newValue)` with the complete filter value object

2. **FilterToolbar.handleCustomFilterChange:**
   - Receives `newValue` and calls `filter.buildCondition(newValue)` to generate `WhereConditionGroup`
   - Calls `onFilterChange(filterId, condition)` → triggers **one API call**
   - Projects condition to `initialFilterValues` via `extractAllWhereConditionsRecursive` → **no API calls**, UI update only

3. **Recursive Extraction:**
   - `extractAllWhereConditionsRecursive` traverses nested `WhereConditionGroup` structures
   - Extracts all individual `WhereCondition` objects at any nesting level
   - Updates `initialFilterValues` Map for "show effective filters" display

4. **Reactive currentWhere:**
   - `currentWhere` prop passed to FilterToolbar must be reactive (`$derived`) so it updates when `activeFilters` or `combineMode` changes
   - This ensures "show effective filters" always displays the actual `WhereConditionGroup` sent to the API
   - Non-reactive `currentWhere` would show stale data when filters change

**buildCondition Pattern:**
- Each QuickFilter defines a `buildCondition` function that converts the filter's value object into a `WhereConditionGroup`
- The function should handle multiple fields by creating OR-groups for each field (e.g., search in multiple columns) and combining them with AND
- Only non-empty fields should create subgroups; if all fields are empty, return `null` to indicate no filter applied
- Example logic: For each field, create an OR-group with LIKE conditions for multiple columns, then combine all OR-groups with AND

**Critical Pitfalls & Solutions:**

**Pitfall 1: CustomFilter Components Must Use Local State**

**Problem:** If `onChange` uses the `value` prop directly, it may read a stale value when the prop hasn't been updated yet. This causes lost input when typing in multiple fields (e.g., typing "form" after "material" loses the material value).

**Solution:** CustomFilter components must maintain local `$state` that syncs with the `value` prop via `$effect`. When handling input events, always read from the local state (which contains all current field values) rather than the prop.

**Why this works:** Local state always contains the latest combined state (all fields), ensuring `onChange` receives the complete object even when typing rapidly across multiple inputs. The `$effect` keeps local state synchronized with prop updates.

**Reference Implementation:** `src/lib/components/grids/filters/QuickTwoTextFilter.svelte:18-43`

**Pitfall 2: $effect Must Not Overwrite Existing QuickFilter State**

**Problem:** The initialization `$effect` in `FilterToolbar` runs whenever `initialFilterValues` changes. Without a guard, it overwrites `customFilterStates` even when QuickFilters already have active values from user input, causing state loss.

**Solution:** Guard against overwriting existing QuickFilter state by checking if `customFilterStates.has(filter.id)` before initializing. Only initialize QuickFilters that don't already have state. Skip initialization for QuickFilters that have active user input.

**Why this works:** `initialFilterValues` is for column filters, not QuickFilters. Once a QuickFilter has state (from user input), it should not be overwritten by `initialFilterValues` updates triggered by other filter changes.

**Reference Implementation:** `src/lib/components/grids/FilterToolbar.svelte:115-128`

**Pitfall 3: Recursive Extraction Required for Nested Structures**

**Problem:** Non-recursive traversal of `WhereConditionGroup` only captures the first level, losing nested conditions. This causes the "show effective filters" display to show incomplete information (e.g., only "form = kugel" when both "material" and "form" are set in a QuickFilter).

**Solution:** Use recursive extraction function that handles arbitrary nesting depth. The function must handle two cases: base case (single `WhereCondition`) and recursive case (`WhereConditionGroup` with nested `conditions` array). Recursively traverse all nested levels to extract every individual `WhereCondition` object.

**Why this works:** QuickFilters create structures like `{ whereCondOp: 'AND', conditions: [ { whereCondOp: 'OR', conditions: [...] }, ... ] }` at arbitrary depth. Only recursive traversal can extract all individual `WhereCondition` objects from any nesting level for proper UI projection.

**Reference Implementation:** `src/lib/components/grids/FilterToolbar.svelte:130-157`

**Best Practices:**

- QuickFilters should represent complex, multi-column business logic that cannot be expressed with simple column filters
- `buildCondition` should return `null` when no values are present (no filter applied)
- CustomFilter components should always use local `$state` synchronized with the `value` prop via `$effect`
- Projection flows **only** from QuickFilter → column filters (for UI display), never reverse
- **DON'T** increment `filterResetKey` during projection (causes focus loss in inputs)
- Use `extractAllWhereConditionsRecursive` for UI projection, not manual traversal
- `currentWhere` prop passed to FilterToolbar must be reactive (`$derived`) to ensure "show effective filters" always displays current state
- When filters are cleared (condition = null), also remove from `initialFilterValues` to maintain UI consistency (prevents stale values in input fields)

**Reference Implementations:**
- `src/lib/components/grids/FilterToolbar.svelte:130-160` - `extractAllWhereConditionsRecursive`
- `src/lib/components/grids/FilterToolbar.svelte:162-245` - `handleCustomFilterChange`
- `src/lib/components/grids/filters/QuickTwoTextFilter.svelte` - CustomFilter with local state pattern
- `src/lib/components/domain/reports/offerings/OfferingReportGrid.svelte:53-118` - QuickFilter definition example

### Report View + Report Grid Contract

When exposing data in reports:

- Add/rename fields in `dbo.view_offerings_pt_pc_pd` with final aliases (e.g., `wioPricePerPiece`, `wsRelevance`, `wsPriceRange`).
- Update `OfferingReportViewSchema` to match the aliases exactly.
- Add columns in `OfferingReportGrid.columns.ts` (module-level for stable references). Accessors must handle nulls and formatting.
- The report page must only use `onQueryChange`. No manual SQL; filters/sort go through QueryGrammar.

