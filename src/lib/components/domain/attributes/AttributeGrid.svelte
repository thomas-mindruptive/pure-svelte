<!-- src/lib/components/domain/attributes/AttributeGrid.svelte -->
<script lang="ts">
  // AttributeGrid.svelte (Svelte 5 + Runes) - REFACTORED
  // 
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component for displaying
  // WholesalerOfferingAttribute data. Now accepts strategy props for consistency.
  
  import Datagrid from '$lib/components/grids/Datagrid.svelte';
  import type { ColumnDef, DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';
  import type { WholesalerOfferingAttribute_Attribute } from '$lib/domain/domainTypes';

  // ===== COMPONENT PROPS (REFACTORED) =====

  const {
    rows = [] as WholesalerOfferingAttribute_Attribute[],
    loading = false,
    deleteStrategy,
    rowActionStrategy
  } = $props<{
    rows?: WholesalerOfferingAttribute_Attribute[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerOfferingAttribute_Attribute>;
    rowActionStrategy?: RowActionStrategy<WholesalerOfferingAttribute_Attribute>;
  }>();

  // ===== COLUMN DEFINITIONS (Unchanged) =====
  
  const columns: ColumnDef<WholesalerOfferingAttribute_Attribute>[] = [
    { 
      key: 'attribute_name', 
      header: 'Attribute', 
      sortable: true, 
      width: '2fr',
      accessor: (attr) => attr.attribute_name || `Attribute #${attr.attribute_id}`
    },
    { 
      key: 'value', 
      header: 'Value', 
      sortable: true, 
      width: '2fr',
      accessor: (attr) => attr.value || '—'
    },
    { 
      key: 'attribute_description', 
      header: 'Description', 
      sortable: false, 
      width: '3fr',
      accessor: (attr) => attr.attribute_description || '—'
    },
    { 
      key: 'attribute_id', 
      header: 'ID', 
      sortable: true, 
      width: '0.5fr',
      accessor: (attr) => attr.attribute_id.toString()
    }
  ];

  // ===== ID EXTRACTION (Unchanged) =====
  
  const getId = (attribute: WholesalerOfferingAttribute_Attribute): ID => 
    `${attribute.offering_id}-${attribute.attribute_id}`;

</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="attributes"
  entity="attribute"
  {deleteStrategy}
  {rowActionStrategy}
/>