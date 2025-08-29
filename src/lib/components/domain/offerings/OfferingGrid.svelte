<!-- src/lib/components/domain/offerings/OfferingGrid.svelte -->
<script lang="ts">
  // OfferingGrid.svelte (Svelte 5 + Runes) - REFACTORED
  // 
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component specifically for displaying
  // WholesalerItemOffering_ProductDef_Category data. This component now directly accepts
  // strategy objects, making it a pure presentation component consistent with other grids.

  import Datagrid from '$lib/components/client/Datagrid.svelte';
  import type { ColumnDef, DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';
  import type { WholesalerItemOffering_ProductDef_Category } from '$lib/domain/types';

  // ===== COMPONENT PROPS (REFACTORED) =====

  const {
    // Core data
    rows = [] as WholesalerItemOffering_ProductDef_Category[],
    loading = false,
    
    // Strategies (Dependency Injection pattern)
    deleteStrategy,
    rowActionStrategy
  } = $props<{
    rows?: WholesalerItemOffering_ProductDef_Category[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category>;
    rowActionStrategy?: RowActionStrategy<WholesalerItemOffering_ProductDef_Category>;
  }>();
  
  const columns: ColumnDef<WholesalerItemOffering_ProductDef_Category>[] = [
    { 
      key: 'product_def_title', 
      header: 'Product', 
      sortable: true, 
      width: '3fr',
      accessor: (offering) => offering.product_def_title || 'Unnamed Product'
    },
    { 
      key: 'price', 
      header: 'Price', 
      sortable: true, 
      width: '1.5fr',
      accessor: (offering) => {
        if (offering.price == null) return '—';
        return `${offering.currency || 'USD'} ${offering.price.toFixed(2)}`;
      }
    },
    {
      key: 'size',
      header: 'Size / Dimensions',
      sortable: false,
      width: '2fr',
      accessor: (offering) => {
        const size = offering.size || '';
        const dimensions = offering.dimensions || '';
        if (size && dimensions) return `${size} (${dimensions})`;
        return size || dimensions || '—';
      }
    },
    { 
      key: 'comment', 
      header: 'Notes', 
      sortable: false, 
      width: '2fr',
      accessor: (offering) => offering.comment || '—'
    }
  ];

  const getId = (offering: WholesalerItemOffering_ProductDef_Category): ID => 
    offering.offering_id;

</script>


<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="offerings"
  entity="offering"
  {deleteStrategy}
  {rowActionStrategy}
/>