<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ID, ColumnDefDirect } from "$lib/components/grids/Datagrid.types";

  import type { ProductDefinition } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type Props = {
    rows: ProductDefinition[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<ProductDefinition>;
    rowActionStrategy?: RowActionStrategy<ProductDefinition>;
  };

  const { rows = [], loading = false, deleteStrategy, rowActionStrategy }: Props = $props();

  // === COLUMNS ====================================================================================

  const columns: ColumnDefDirect<ProductDefinition>[] = [
    { key: "title", header: "Tile", sortable: true, width: "2fr" },
    { key: "product_def_id", header: "id", sortable: true, width: "3fr" },
    { key: "description", header: "description", sortable: true, width: "1fr" },
  ];

  const getId = (r: ProductDefinition): ID => `${r.product_def_id}`;
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


