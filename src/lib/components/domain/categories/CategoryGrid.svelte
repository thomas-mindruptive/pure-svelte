<script lang="ts">
  import { ComparisonOperator, type SortDescriptor, type WhereCondition, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, CustomFilterDef, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import { type CategoryWithOfferingCount, CategoryWithOfferingCountSchema } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type CategoryGridProps = {
    rows: CategoryWithOfferingCount[];
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<CategoryWithOfferingCount>;
    rowActionStrategy?: RowActionStrategy<CategoryWithOfferingCount>;
    onQueryChange?: (query: {
      filters: WhereCondition<CategoryWithOfferingCount> | WhereConditionGroup<CategoryWithOfferingCount> | null,
      sort: SortDescriptor<CategoryWithOfferingCount>[] | null
    }) => Promise<void> | void;
  };

  const { rows = [], selection = "multiple", deleteStrategy, rowActionStrategy, onQueryChange }: CategoryGridProps = $props();

  // === COLUMNS ====================================================================================

  const columns: ColumnDef<typeof CategoryWithOfferingCountSchema>[] = [
    { key: "category_name", header: "Name", sortable: true, filterable: true, width: "20rem" },
    { key: "category_id", header: "ID", sortable: true, width: "5rem" },
    { key: "offering_count", header: "Offerings", sortable: true, filterable: true, filterType: 'number', width: "8rem" },
    { key: "description", header: "Description", sortable: true, filterable: true },
  ];

  // Custom filters
  const customFilters: CustomFilterDef<CategoryWithOfferingCount>[] = [
    {
      id: 'has_offerings',
      label: 'Show categories with offerings only',
      type: 'checkbox',
      placement: { type: 'quickfilter', pos: 0 },
      defaultValue: false,
      syncToColumnKey: 'offering_count',  // Synchronize with offering_count filter
      buildCondition: (checked: boolean) => checked
        ? {
            key: 'offering_count',
            whereCondOp: ComparisonOperator.GT,
            val: 0
          }
        : null
    }
  ];

  // Get ID for categories
  const getId = (r: CategoryWithOfferingCount): number => r.category_id;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<Datagrid
  {rows}
  {columns}
  {customFilters}
  {getId}
  {selection}
  gridId="categories"
  entity="category"
  {deleteStrategy}
  {rowActionStrategy}
  {onQueryChange}
/>

<!--
OPTIONAL SNIPPETS (paste INSIDE the <Datagrid>…</Datagrid> above if you need custom UI)

{#snippet toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
  <div style="display:flex; gap:.5rem; align-items:center;">
    <button class="pc-grid__btn" type="button" onclick={() => openAssignDialog()}>
      Assign Category
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => deleteSelected()}
      disabled={selectedIds.size === 0}
      aria-busy={Array.from(selectedIds).some((id) => deletingObjectIds.has(id))}
    >
      Remove selected ({selectedIds.size})
    </button>
  </div>
{/snippet}

{#snippet cell({ row, col })}
  {#if col.key === 'link' && row.link}
    <a href={row.link} target="_blank" class="pc-grid__link">{row.link}</a>
  {:else if col.key === 'offering_count'}
    <span class="pc-grid__badge">{row.offering_count || 0}</span>
  {:else}
    {row[col.key] || '—'}
  {/if}
{/snippet}

{#snippet rowActions({ row, id, isDeleting })}
  <div style="display:flex; gap:.5rem; justify-content:end;">
    <button class="pc-grid__btn" type="button" onclick={() => editCategory(id)} disabled={!id}>
      Edit
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => id && removeCategory(row)}
      disabled={!id}
      aria-busy={id ? isDeleting(id) : false}
    >
      Remove
    </button>
  </div>
{/snippet}

{#snippet empty()}
  No categories assigned yet.
{/snippet}
-->
