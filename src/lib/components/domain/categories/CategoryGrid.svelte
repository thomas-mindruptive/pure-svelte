<script lang="ts">
  // Thin wrapper around Datagrid for categoriesAA

  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ID, ColumnDefDirect } from "$lib/components/grids/Datagrid.types";

  import type { ProductCategory } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type CategoryGridProps = {
    rows: ProductCategory[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<ProductCategory>;
    rowActionStrategy?: RowActionStrategy<ProductCategory>;
  }

  const {
    rows = [],
    loading = false,
    deleteStrategy,
    rowActionStrategy,
  }:CategoryGridProps = $props();

  // === COLUMNS ====================================================================================

  const columns: ColumnDefDirect<ProductCategory>[] = [
    { key: "category_id", header: "id", sortable: true, width: "3fr" },
    { key: "name", header: "Name", sortable: false, width: "2fr" },
    { key: "description", header: "description", sortable: true, width: "1fr" },
  ];

  // Composite key for categories (wholesaler_id + category_id)
  const getId = (r: ProductCategory): ID => `${r.category_id}`;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

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
