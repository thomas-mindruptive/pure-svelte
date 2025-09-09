<script lang="ts">
  // Thin wrapper around Datagrid for wholesalers
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDef, ID } from "$lib/components/grids/Datagrid.types";
  import type { Wholesaler } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type SupplierGridProps =  {
    rows: Wholesaler[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<Wholesaler>;
    rowActionStrategy?: RowActionStrategy<Wholesaler>;
  }

  const {
    rows,
    loading = false,
    deleteStrategy,
    rowActionStrategy,
  }: SupplierGridProps = $props();

  // === COLUMNS ==================================================================================

  const columns: ColumnDef<Wholesaler>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "dropship",
      header: "Dropship",
      accessor: (r) => (r.dropship ? "Yes" : "No"),
    },
    { key: "email", header: "Email", accessor: null },
    { key: "country", header: "Country", accessor: null },
  ];

  const getId = (r: Wholesaler): ID => r.wholesaler_id;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="wholesalers"
  entity="wholesaler"
  {deleteStrategy}
  {rowActionStrategy}
/>

<!--
OPTIONAL SNIPPETS (paste INSIDE the <Datagrid>…</Datagrid> above if you need custom UI)

{#snippet toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
  <div style="display:flex; gap:.5rem; align-items:center;">
    <button class="pc-grid__btn" type="button" onclick={() => openCreateDialog()}>
      New wholesaler
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => deleteSelected()}
      disabled={selectedIds.size === 0}
      aria-busy={Array.from(selectedIds).some((id) => deletingObjectIds.has(id))}
    >
      Delete selected ({selectedIds.size})
    </button>
  </div>
{/snippet}

{#snippet cell({ row, col })}
  {#if col.key === 'dropship'}
    <span class="pc-grid__badge">{row.dropship ? 'Yes' : 'No'}</span>
  {:else}
    {row[col.key]}
  {/if}
{/snippet}

{#snippet rowActions({ row, id, isDeleting })}
  <div style="display:flex; gap:.5rem; justify-content:end;">
    <button class="pc-grid__btn" type="button" onclick={() => editWholesaler(id)} disabled={!id}>
      Edit
    </button>
    <button
      class="pc-grid__btn pc-grid__btn--danger"
      type="button"
      onclick={() => id && deleteOne(row)}
      disabled={!id}
      aria-busy={id ? isDeleting(id) : false}
    >
      Delete
    </button>
  </div>
{/snippet}

{#snippet empty()}
  No wholesalers found.
{/snippet}
-->
