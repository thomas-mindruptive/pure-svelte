<script lang="ts">
  // Thin wrapper around Datagrid for wholesalers
  import Datagrid from "$lib/components/client/Datagrid.svelte";
  import type {
    ID,
    ColumnDef,
    DeleteStrategy,
    RowActionStrategy,
  } from "$lib/components/client/Datagrid.types";
  import type { Wholesaler } from "$lib/domain/types";

  const DUMMY_ACCESSOR = (r: any) => "DUMYY*************";

  const {
    rows = [] as Wholesaler[],
    loading = false,
    executeDelete, // (ids) => Promise<void>
    onRowClick,
  } = $props<{
    rows?: Wholesaler[] | null;
    loading?: boolean;
    executeDelete: (ids: ID[]) => Promise<void>;
    onRowClick?: (supplier: Wholesaler) => void;
  }>();

  const columns: ColumnDef<Wholesaler>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "dropship",
      header: "Dropship",
      accessor: (r) => (r.dropship ? "Yes" : "No"),
    },
    { key: "email", header: "Email", accessor: DUMMY_ACCESSOR },
    { key: "country", header: "Country", accessor: DUMMY_ACCESSOR },
  ];

  const getId = (r: Wholesaler): ID => (r as any).id as ID;

  const deleteStrategy: DeleteStrategy<Wholesaler> = {
    execute: async (ids: ID[]) => {
      await executeDelete(ids);
    },
  };

  const rowActionStrategy: RowActionStrategy<Wholesaler> = {
    click: onRowClick,
  };

  // Silence "declared but never read" in some TS setups (harmless)
  void rows;
  void loading;
  void columns;
  void getId;
  void deleteStrategy;
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
