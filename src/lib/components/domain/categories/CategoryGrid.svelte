<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor, WhereCondition, WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import type { ProductCategory, ProductCategorySchema } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type CategoryGridProps = {
    rows: ProductCategory[];
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<ProductCategory>;
    rowActionStrategy?: RowActionStrategy<ProductCategory>;
    // Support both old onSort and new onQueryChange patterns
    onSort?: ((sortState: SortDescriptor<ProductCategory>[] | null) => Promise<void> | void) | undefined;
    onQueryChange?: (query: {
      filters: WhereCondition<ProductCategory> | WhereConditionGroup<ProductCategory> | null,
      sort: SortDescriptor<ProductCategory>[] | null
    }) => Promise<void> | void;
  };

  const { rows = [], selection = "multiple", deleteStrategy, rowActionStrategy, onSort, onQueryChange }: CategoryGridProps = $props();

  // === COLUMNS ====================================================================================

  const columns: ColumnDef<typeof ProductCategorySchema>[] = [
    { key: "name", header: "Name", sortable: true, width: "25rem" },
    { key: "category_id", header: "id", sortable: true, width: "5rem" },  // No filterable property = not filterable
    { key: "description", header: "description", sortable: true, width: "" },
  ];

  // Composite key for categories (wholesaler_id + category_id)
  const getId = (r: ProductCategory): number => r.category_id;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<Datagrid
  {rows}
  {columns}
  {getId}
  {selection}
  gridId="categories"
  entity="category"
  {deleteStrategy}
  {rowActionStrategy}
  {onSort}
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
