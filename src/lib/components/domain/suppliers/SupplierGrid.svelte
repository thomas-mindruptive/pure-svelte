<!-- SupplierGrid.svelte -->

<script lang="ts">
  // Thin wrapper around Datagrid for wholesalers with filtering support
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDef } from "$lib/components/grids/Datagrid.types";
  import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import type { Wholesaler, WholesalerSchema } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type SupplierGridProps = {
    rows: Wholesaler[];
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<Wholesaler>;
    rowActionStrategy?: RowActionStrategy<Wholesaler>;
    onQueryChange?: (query: {
      filters: WhereCondition<Wholesaler> | WhereConditionGroup<Wholesaler> | null,
      sort: SortDescriptor<Wholesaler>[] | null
    }) => Promise<void> | void;
  };

  const { rows, selection = "multiple", deleteStrategy, rowActionStrategy, onQueryChange }: SupplierGridProps = $props();

  // === COLUMNS ==================================================================================

  const columns: ColumnDef<typeof WholesalerSchema>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      filterable: true,
      filterType: "text",
      width:"200px"
    },
    {
      key: "dropship",
      header: "Dropship",
      accessor: (r) => (r.dropship ? "Yes" : "No"),
      sortable: true,
      filterable: true,
      filterType: "boolean",
    },
    {
      key: "email",
      header: "Email",
      accessor: null,
      sortable: true,
      filterable: true,
      filterType: "text",
    },
    {
      key: "country",
      header: "Country",
      accessor: null,
      sortable: true,
      filterable: true,
      filterType: "text",
    },
    {
      key: "relevance",
      header: "Relevance",
      accessor: null,
      sortable: true,
      filterable: true,
      filterType: "text",
    },
    {
      key: "price_range",
      header: "Price Range",
      accessor: null,
      sortable: true,
      filterable: true,
      filterType: "text",
    },
    {
      key: "status",
      header: "Status",
      accessor: null,
      sortable: true,
      filterable: true,
      filterType: "text",
    },
    {
      key: "website",
      header: "Website",
      accessor: (r) => {
        if (r.website) {
          try {
            return new URL(r.website).hostname;
          } catch {
            return r.website.substring(0, 30) + "...";
          }
        }
        return "-";
      },
      sortable: true,
      width: "180px",
      isLink: true,
      onClick: (r) => {
        if (r.website) {
          window.open(r.website, "_blank");
        }
      },
    },
  ];

  const getId = (r: Wholesaler) => r.wholesaler_id;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {selection}
  gridId="wholesalers"
  entity="wholesaler"
  {deleteStrategy}
  {rowActionStrategy}
  {onQueryChange}
  maxBodyHeight="750px"
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
