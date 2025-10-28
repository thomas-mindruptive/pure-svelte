<!-- src/lib/components/domain/offerings/OfferingGrid.svelte -->
<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy, SortFunc } from "$lib/components/grids/Datagrid.types";
  import type {
      WholesalerOfferingLink,
      Wio_PDef_Cat_Supp_Nested,
      Wio_PDef_Cat_Supp_Nested_WithLinks,
      Wio_PDef_Cat_Supp_Nested_WithLinks_Schema,
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
    onSort,
  }: OfferingGridProps = $props();

  // === COLUMNS  =================================================================================

  const columns: ColumnDef<typeof Wio_PDef_Cat_Supp_Nested_WithLinks_Schema>[] = [
    {
      key: "pd.title",
      header: "Product",
      sortable: true,
      accessor: (offering) => offering.product_def.title || "Unnamed Product",
    },
    {
      key: "wio.title",
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
      key: "wio.sub_seller",
      header: "Subseller",
      sortable: true,
      accessor: (offering) => offering.sub_seller || "—",
    },
    {
      key: "wio.price",
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
    {
      key: "links",
      header: "Links",
      sortable: false,
      accessor: (offering) => {
        let displayUrl = "";
        if (offering.links?.[0]) {
          //const segs = parseUrlPathSegments(offering.links?.[0].url);
          displayUrl = new URL(offering.links?.[0].url).hostname; //segs.join("/");
        } else {
          displayUrl = "-";
        }
        return displayUrl; 
      },
      isLink: true,
      onClick(row, col) {
        const linkArray = row[col.key as keyof typeof row] as WholesalerOfferingLink[];
        const url = linkArray[0].url; 
        if (url) window.open(url, "_blank");
      },
    },
  ];

  const getId = (offering: Wio_PDef_Cat_Supp_Nested_WithLinks) => offering.offering_id;
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
