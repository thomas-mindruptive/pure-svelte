<!-- src/lib/components/domain/offerings/OfferingGrid.svelte -->
<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy, SortFunc, ID } from "$lib/components/grids/Datagrid.types";
  import type {
    WholesalerOfferingLink,
    Wio_PDef_Cat_Supp_Nested_WithLinks,
    Wio_PDef_Cat_Supp_Nested_WithLinks_Schema,
  } from "$lib/domain/domainTypes";
  import type { Snippet } from "svelte";

  // === PROPS  ===================================================================================

  type ToolbarSnippetProps = {
    selectedIds: Set<ID>;
    deletingObjectIds: Set<ID>;
    deleteSelected: () => Promise<void> | void;
  };

  type RowActionsSnippetProps = {
    row: Wio_PDef_Cat_Supp_Nested_WithLinks;
    id: ID | null;
    isDeleting: (id: ID) => boolean;
  };

  export type OfferingGridProps = {
    rows: Wio_PDef_Cat_Supp_Nested_WithLinks[];
    loading?: boolean;
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks>;
    rowActionStrategy?: RowActionStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks>;
    // Callback when sort state changes - parent loads data
    onSort?: SortFunc<Wio_PDef_Cat_Supp_Nested_WithLinks> | undefined;
    // Custom toolbar snippet
    toolbar?: Snippet<[ToolbarSnippetProps]>;
    // Custom row actions snippet
    rowActions?: Snippet<[RowActionsSnippetProps]>;
    // Max dimensions
    maxBodyHeight?: string;
    maxBodyWidth?: string;
  };

  const {
    // Core data
    rows,
    loading = false,
    selection = "multiple",

    // Strategies (Dependency Injection pattern)
    deleteStrategy,
    rowActionStrategy,
    onSort,
    toolbar,
    rowActions,

    // Max dimensions
    maxBodyHeight,
    maxBodyWidth,
  }: OfferingGridProps = $props();

  // === COLUMNS  =================================================================================

  const columns: ColumnDef<typeof Wio_PDef_Cat_Supp_Nested_WithLinks_Schema>[] = [
    {
      key: "wio.title",
      header: "Offering",
      accessor: (offering) => offering.title,
      sortable: true,
      width: "15rem",
    },
    {
      key: "pd.title",
      header: "Product",
      sortable: true,
      width: "15rem",
      accessor: (offering) => offering.product_def.title || "Unnamed Product",
    },
    {
      key: "w.name",
      header: "Supplier",
      sortable: true,
      width: "12rem",
      accessor: (offering) => offering.wholesaler.name || "Unnamed Supplier",
    },
    {
      key: "wio.sub_seller",
      header: "Subseller",
      sortable: true,
      width: "10rem",
      accessor: (offering) => offering.sub_seller || "—",
    },
    {
      key: "wio.material_id",
      header: "Material",
      sortable: true,
      width: "5rem",
      accessor: (offering) => offering.material_id || "—",
    },
    {
      key: "wio.price",
      header: "Price",
      sortable: true,
      width: "8rem",
      accessor: (offering) => {
        if (offering.price == null) return "—";
        return `${offering.currency || "USD"} ${offering.price.toFixed(2)}`;
      },
    },
    {
      key: "wio.size",
      header: "Size",
      sortable: true,
      width: "7rem",
      accessor: (offering) => offering.size || "—",
    },
    {
      key: "wio.dimensions",
      header: "Dimensions",
      sortable: true,
      width: "8rem",
      accessor: (offering) => offering.dimensions || "—",
    },
    {
      key: "wio.weight_range",
      header: "Weight",
      sortable: true,
      width: "8rem",
      accessor: (offering) => offering.weight_range || (offering.weight_grams ? `${offering.weight_grams}g` : "—"),
    },
    {
      key: "comment",
      header: "Notes",
      sortable: false,
      width: "12rem",
      accessor: (offering) => offering.comment?.substring(0, 20) || "—",
    },
    {
      key: "links",
      header: "Links",
      sortable: false,
      width: "12rem",
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
  {selection}
  gridId="offerings"
  entity="offering"
  {deleteStrategy}
  {rowActionStrategy}
  {onSort}
  {toolbar}
  {rowActions}
  {maxBodyHeight}
  {maxBodyWidth}
/>
