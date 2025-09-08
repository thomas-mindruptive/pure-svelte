<script lang="ts">
  // Thin wrapper around Datagrid for categoriesAA

  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type {
    DeleteStrategy,
    RowActionStrategy,
    ColumnDefWithAccessor,
    ColumnDefDirect,
    ID,
    ColumnDef,
  } from "$lib/components/grids/Datagrid.types";

  import type { WholesalerCategory_Category } from "$lib/domain/domainTypes";

  const {
    rows = null, // Can accept null from parent
    loading = false,
    showOfferingCount = true,
    deleteStrategy,
    rowActionStrategy,
  } = $props<{
    rows?: WholesalerCategory_Category[] | null;
    loading?: boolean;
    showOfferingCount?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerCategory_Category>;
    rowActionStrategy?: RowActionStrategy<WholesalerCategory_Category>;
  }>();


  // Svelte will say that "columns is updated." This is ok because this is jsut a workaorund for not being const.
  const columns = $derived.by((): ColumnDef<WholesalerCategory_Category>[] => {
    if (showOfferingCount) {
      const colsWithAccessor: ColumnDefWithAccessor<WholesalerCategory_Category>[] = [
        { key: "category_name", header: "Category Name", sortable: true, width: "3fr", accessor: null, },
        { key: "comment", header: "Comment", sortable: false, width: "2fr", accessor: null, },
        { key: "offering_count", header: "Offerings", sortable: true, width: "1fr", accessor: (r: any) => (r as any).offering_count || 0, },
        { key: "link", header: "Link", sortable: false, width: "2fr", accessor: null, },
      ];
      return colsWithAccessor;
    } else {
      const colsDirect: ColumnDefDirect<WholesalerCategory_Category>[] = [
        { key: "category_name", header: "Category Name", sortable: true, width: "3fr" },
        { key: "comment", header: "Comment", sortable: false, width: "2fr" },
        { key: "link", header: "Link", sortable: false, width: "2fr" },
      ];
      return colsDirect;
    }
  });


  // Composite key for categories (wholesaler_id + category_id)
  const getId = (r: WholesalerCategory_Category): ID =>
    `${r.wholesaler_id}-${r.category_id}`;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="categories"
  entity="category"
  {deleteStrategy}
  {rowActionStrategy}
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
