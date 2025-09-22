<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDefDirect } from "$lib/components/grids/Datagrid.types";
  import type { Attribute } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type AttributesGridProps = {
    rows: Attribute[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<Attribute>;
    rowActionStrategy?: RowActionStrategy<Attribute>;
  };

  const { rows = [], loading = false, deleteStrategy, rowActionStrategy }: AttributesGridProps = $props();

  // === COLUMNS ==================================================================================

  const columns: ColumnDefDirect<Attribute>[] = [
    { key: "name", header: "Name", sortable: true, width: "2fr" },
    { key: "description", header: "Description", sortable: true, width: "3fr" },
    { key: "attribute_id", header: "ID", sortable: true, width: "1fr" },
  ];

  // === ID EXTRACTOR =============================================================================

  const getId = (r: Attribute) => r.attribute_id;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="attributes-master"
  entity="attribute"
  {deleteStrategy}
  {rowActionStrategy}
/>