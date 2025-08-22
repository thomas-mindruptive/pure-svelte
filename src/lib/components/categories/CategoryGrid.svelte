<script lang="ts">
  // Thin wrapper around Datagrid for categories
  import Datagrid, { type ColumnDef, type DeleteStrategy } from '$lib/components/Datagrid.svelte';
  import type { WholesalerCategory } from '$lib/domain/types';

  type ID = string | number;

  const {
    rows = [] as WholesalerCategory[],
    loading = false,
    showOfferingCount = true,
    executeDelete, // (ids) => Promise<void>
  } = $props<{
    rows?: WholesalerCategory[];
    loading?: boolean;
    showOfferingCount?: boolean;
    executeDelete: (ids: ID[]) => Promise<void>;
  }>();

  const columns: ColumnDef<WholesalerCategory>[] = [
    { key: 'name', header: 'Category Name', sortable: true, width: '3fr' },
    { key: 'comment', header: 'Comment', sortable: false, width: '2fr' },
    ...(showOfferingCount ? [{ 
      key: 'offering_count', 
      header: 'Offerings', 
      sortable: true, 
      width: '1fr',
      accessor: (r: WholesalerCategory) => (r as any).offering_count || 0
    }] : []),
    { key: 'link', header: 'Link', sortable: false, width: '2fr' }
  ];

  // Composite key for categories (wholesaler_id + category_id)
  const getId = (r: WholesalerCategory): ID => `${r.wholesaler_id}-${r.category_id}`;

  const deleteStrategy: DeleteStrategy<WholesalerCategory> = {
    execute: async (ids: ID[]) => {
      await executeDelete(ids);
    }
  };

  // Silence "declared but never read" in some TS setups (harmless)
  void rows; void loading; void columns; void getId; void deleteStrategy;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="categories"
  entity="category"
  {deleteStrategy}
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