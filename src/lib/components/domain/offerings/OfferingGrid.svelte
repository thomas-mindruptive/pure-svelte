<!-- src/lib/components/domain/offerings/OfferingGrid.svelte -->
<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDefBase } from "$lib/components/grids/Datagrid.types";
  import type {
    WholesalerItemOffering_ProductDef_Category_Supplier_Nested,
    Wio_PDef_Cat_Supp_Nested_Schema,
  } from "$lib/domain/domainTypes";

  // === PROPS  ===================================================================================

  export type OfferingGridProps = {
    rows: WholesalerItemOffering_ProductDef_Category_Supplier_Nested[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category_Supplier_Nested>;
    rowActionStrategy?: RowActionStrategy<WholesalerItemOffering_ProductDef_Category_Supplier_Nested>;
  };

  const {
    // Core data
    rows,
    loading = false,

    // Strategies (Dependency Injection pattern)
    deleteStrategy,
    rowActionStrategy,
  }: OfferingGridProps = $props();

  // === COLUMNS  =================================================================================

  const columns: ColumnDefBase<typeof Wio_PDef_Cat_Supp_Nested_Schema>[] = [
    {
      key: "pd.title",
      header: "Product",
      sortable: true,
      accessor: (offering) => offering.product_def.title || "Unnamed Product",
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
    },
    {
      key: "w.name",
      header: "Supplier",
      sortable: true,
      accessor: (offering) => offering.wholesaler.name || "Unnamed Supplier",
    },
    {
      key: "price",
      header: "Price",
      sortable: true,
      accessor: (offering) => {
        if (offering.price == null) return "—";
        return `${offering.currency || "USD"} ${offering.price.toFixed(2)}`;
      },
    },
    {
      key: "size",
      header: "Size/Dim/Weight",
      sortable: false,
      accessor: (offering) => {
        const size = offering.size || "NA";
        const dimensions = offering.dimensions || "NA";
        const weight = offering.weight_grams ? offering.weight_grams.toString() : "NA";
        const cellTitle = `${size} / ${dimensions} / ${weight}`;
        return cellTitle;
      },
    },
    {
      key: "comment",
      header: "Notes",
      sortable: false,
      accessor: (offering) => offering.comment?.substring(0, 20) || "—",
    },
  ];

  const getId = (offering: WholesalerItemOffering_ProductDef_Category_Supplier_Nested) => offering.offering_id;
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
