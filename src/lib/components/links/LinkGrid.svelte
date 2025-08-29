<!-- src/lib/components/links/LinkGrid.svelte -->
<script lang="ts">
  // LinkGrid.svelte (Svelte 5 + Runes) - REFACTORED
  // 
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component for displaying
  // WholesalerOfferingLink data. Now accepts strategy props for consistency.

  import Datagrid from '$lib/components/client/Datagrid.svelte';
  import type { WholesalerOfferingLink } from '$lib/domain/types';
  import type { ColumnDef, DeleteStrategy, RowActionStrategy, ID } from '../client/Datagrid.types';

  // ===== COMPONENT PROPS (REFACTORED) =====

  const {
    rows = [] as WholesalerOfferingLink[],
    loading = false,
    deleteStrategy,
    rowActionStrategy
  } = $props<{
    rows?: WholesalerOfferingLink[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerOfferingLink>;
    rowActionStrategy?: RowActionStrategy<WholesalerOfferingLink>;
  }>();

  // ===== COLUMN DEFINITIONS (Unchanged) =====
  
  const columns: ColumnDef<WholesalerOfferingLink>[] = [
    { 
      key: 'url', 
      header: 'URL', 
      sortable: true, 
      width: '4fr',
      accessor: (link) => link.url
    },
    { 
      key: 'notes', 
      header: 'Description', 
      sortable: false, 
      width: '3fr',
      accessor: (link) => link.notes || '—'
    },
    { 
      key: 'created_at', 
      header: 'Added', 
      sortable: true, 
      width: '2fr',
      accessor: (link) => {
        if (!link.created_at) return '—';
        try {
          return new Date(link.created_at).toLocaleDateString();
        } catch {
          return String(link.created_at);
        }
      }
    }
  ];

  // ===== ID EXTRACTION (Unchanged) =====
  
  const getId = (link: WholesalerOfferingLink): ID => 
    link.link_id;

</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="links"
  entity="link"
  {deleteStrategy}
  {rowActionStrategy}
/>