<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";

  import type { ProductDefinition, ProductDefinitionSchema } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type Props = {
    rows: ProductDefinition[];
    loading?: boolean;
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<ProductDefinition>;
    rowActionStrategy?: RowActionStrategy<ProductDefinition>;
  };

  const { rows = [], loading = false, selection = "multiple", deleteStrategy, rowActionStrategy }: Props = $props();

  // === COLUMNS ====================================================================================

  const columns: ColumnDef<typeof ProductDefinitionSchema>[] = [
    { key: "title", header: "Title", sortable: true, width: "25rem" },
    { key: "product_def_id", header: "id", sortable: true },
    { key: "material_id", header: "Material", sortable: true },
    { key: "form_id", header: "Form", sortable: true },
    {
      key: "description",
      header: "Description",
      sortable: true,
      accessor: (pd: ProductDefinition) => pd.description?.substring(0, 20),
    },
  ];

  const getId = (r: ProductDefinition) => r.product_def_id;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  {selection}
  gridId="product defintions"
  entity="product definition"
  {deleteStrategy}
  {rowActionStrategy}
/>
