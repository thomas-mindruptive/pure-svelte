<!-- src/lib/components/domain/offerings/OfferingGrid.svelte -->
<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDefBase, SortFunc } from "$lib/components/grids/Datagrid.types";
  import type {
    Wio_PDef_Cat_Supp_Nested,
    Wio_PDef_Cat_Supp_Nested_Schema,
  } from "$lib/domain/domainTypes";

  // === PROPS  ===================================================================================

  export type OfferingGridProps = {
    rows: Wio_PDef_Cat_Supp_Nested[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp_Nested>;
    rowActionStrategy?: RowActionStrategy<Wio_PDef_Cat_Supp_Nested>;
    // Callback when sort state changes - parent loads data
    onSort?: SortFunc<Wio_PDef_Cat_Supp_Nested> | undefined;
  };

  const {
    // Core data
    rows,
    loading = false,

    // Strategies (Dependency Injection pattern)
    deleteStrategy,
    rowActionStrategy,
    onSort
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
      header: "Offering",
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
      key: "sub_seller",
      header: "Subseller",
      sortable: true,
      accessor: (offering) => offering.sub_seller || "—",
    },
    {
      key: "comment",
      header: "Notes",
      sortable: false,
      accessor: (offering) => offering.comment?.substring(0, 20) || "—",
    },
  ];

  const getId = (offering: Wio_PDef_Cat_Supp_Nested) => offering.offering_id;
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
  {onSort}
/>
