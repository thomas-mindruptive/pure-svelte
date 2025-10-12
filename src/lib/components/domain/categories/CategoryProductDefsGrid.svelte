<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";

  import type { ProductDefinition, ProductDefinitionSchema } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type Props = {
    rows: ProductDefinition[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<ProductDefinition>;
    rowActionStrategy?: RowActionStrategy<ProductDefinition>;
  };

  const { rows = [], loading = false, deleteStrategy, rowActionStrategy }: Props = $props();

  // === COLUMNS ====================================================================================

  const columns: ColumnDef<typeof ProductDefinitionSchema>[] = [
    { key: "title", header: "Tile", sortable: true, width: "2fr" },
    { key: "product_def_id", header: "id", sortable: true, width: "3fr" },
    { key: "description", header: "description", sortable: true, width: "1fr" },
  ];

  const getId = (r: ProductDefinition) => r.product_def_id;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="product defintions"
  entity="product definition"
  {deleteStrategy}
  {rowActionStrategy}
/>


