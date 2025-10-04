<!-- src/lib/components/domain/offerings/OfferingGrid.svelte -->
<script lang="ts">
  // OfferingGrid.svelte (Svelte 5 + Runes) - REFACTORED
  //
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component specifically for displaying
  // WholesalerItemOffering_ProductDef_Category data. This component now directly accepts
  // strategy objects, making it a pure presentation component consistent with other grids.

  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDefBase } from "$lib/components/grids/Datagrid.types";
  import type { WholesalerItemOffering_ProductDef_Category_Supplier_Nested, WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema } from "$lib/domain/domainTypes";

  // === PROPS  ===================================================================================

  export type OfferingGridProps = {
    rows: WholesalerItemOffering_ProductDef_Category_Supplier_Nested[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<WholesalerItemOffering_ProductDef_Category_Supplier_Nested>;
    rowActionStrategy?: RowActionStrategy<WholesalerItemOffering_ProductDef_Category_Supplier_Nested>;
  }

  const {
    // Core data
    rows,
    loading = false,

    // Strategies (Dependency Injection pattern)
    deleteStrategy,
    rowActionStrategy,
  }:OfferingGridProps = $props();

  // === COLUMNS  =================================================================================

  const columns: ColumnDefBase<typeof WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema>[] = [
    {
      key: "pd.title",
      header: "Product",
      sortable: true,
      width: "3fr",
      accessor: (offering) => offering.product_def.title || "Unnamed Product",
    },
    {
      key: "price",
      header: "Price",
      sortable: true,
      width: "1.5fr",
      accessor: (offering) => {
        if (offering.price == null) return "—";
        return `${offering.currency || "USD"} ${offering.price.toFixed(2)}`;
      },
    },
    {
      key: "size",
      header: "Size / Dimensions",
      sortable: false,
      width: "2fr",
      accessor: (offering) => {
        const size = offering.size || "";
        const dimensions = offering.dimensions || "";
        if (size && dimensions) return `${size} (${dimensions})`;
        return size || dimensions || "—";
      },
    },
    {
      key: "comment",
      header: "Notes",
      sortable: false,
      width: "2fr",
      accessor: (offering) => offering.comment || "—",
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
