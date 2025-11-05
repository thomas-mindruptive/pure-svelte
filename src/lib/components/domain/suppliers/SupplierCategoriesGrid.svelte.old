<script lang="ts">
  // Thin wrapper around Datagrid for categoriesAA

  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy, SortFunc } from "$lib/components/grids/Datagrid.types";

  import type {
      WholesalerCategory_Category_Nested,
      WholesalerCategory_Category_Nested_Schema
  } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type SupplierCategoriesGridProps = {
    rows: WholesalerCategory_Category_Nested[];
    loading?: boolean;
    selection?: "none" | "single" | "multiple";
    showOfferingCount?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerCategory_Category_Nested>;
    rowActionStrategy?: RowActionStrategy<WholesalerCategory_Category_Nested>;
    onSort?: SortFunc<WholesalerCategory_Category_Nested> | undefined;
  };

  const { rows, loading = false, selection = "multiple", deleteStrategy, rowActionStrategy, onSort }: SupplierCategoriesGridProps = $props();

  // === COLUMNS ==================================================================================

  const columns: ColumnDef<typeof WholesalerCategory_Category_Nested_Schema>[] = [
    { key: "pc.name", header: "Category Name", sortable: true, accessor: (wc) => wc.category.name },
    { key: "wc.comment", header: "Comment", sortable: false, accessor: (wc) => wc.comment },
    { key: "wc.link", header: "Link", sortable: false, accessor: (wc) => wc.link },
  ];

  // Composite key for categories (wholesaler_id + category_id)
  const getId = (r: WholesalerCategory_Category_Nested) => r.category_id;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  {selection}
  gridId="categories"
  entity="category"
  {deleteStrategy}
  {rowActionStrategy}
  {onSort}
  maxBodyHeight="350px"
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
