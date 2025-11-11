<script lang="ts">
  /**
   * OfferingReportGrid Component
   *
   * Grid configuration for the Offerings Report.
   * Uses view_offerings_pt_pc_pd for complete breadth of data.
   *
   * Key Features:
   * - Filterable columns for all view fields
   * - Clickable Title column for navigation to offering detail page
   * - Clickable Links column showing first link (opens in new tab)
   * - Server-side filtering and sorting via QueryGrammar
   *
   * Column Key Structure:
   * - View column names: wioId, wioTitle, wsName, catName, pdefTitle, etc.
   * - Flat structure (no nested objects like row.wholesaler.name)
   *
   * Navigation:
   * - Clicking on Title navigates to: /categories/{categoryId}/productdefinitions/{productDefId}/offerings/{offeringId}
   * - Uses proper URL hierarchy for deep linking and breadcrumbs
   */
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef } from "$lib/components/grids/Datagrid.types";
  import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import type { OfferingReportViewWithLinks } from "$lib/domain/domainTypes";
  import { OfferingReportViewSchema } from "$lib/domain/domainTypes";
  import { log } from "$lib/utils/logger";
  import { goto } from "$app/navigation";

  type Props = {
    rows: OfferingReportViewWithLinks[];
    loading: boolean;
    onQueryChange?: (query: {
      filters: WhereCondition<OfferingReportViewWithLinks> | WhereConditionGroup<OfferingReportViewWithLinks> | null,
      sort: SortDescriptor<OfferingReportViewWithLinks>[] | null
    }) => Promise<void> | void;
    maxBodyHeight?: string;
  };

  let { rows, loading, onQueryChange, maxBodyHeight }: Props = $props();

  // Log rows when they change
  $effect(() => {
    log.info(`[OfferingReportGrid] Rows updated: ${rows.length} rows`);
    if (rows.length > 0) {
      const firstRow = rows[0];
      log.info(`[OfferingReportGrid] First row keys:`, Object.keys(firstRow));
      log.info(`[OfferingReportGrid] First row sample:`, {
        wioId: firstRow.wioId,
        wioTitle: firstRow.wioTitle,
        wsName: firstRow.wsName,
        catName: firstRow.catName,
        pdefTitle: firstRow.pdefTitle,
        ptName: firstRow.ptName,
        wioMaterialName: firstRow.wioMaterialName,
        pdefMatName: firstRow.pdefMatName,
      });
    }
  });

  /**
   * Navigates to the offering detail page when user clicks on Title.
   */
  function handleOfferingClick(row: OfferingReportViewWithLinks) {
    const categoryId = row.pcId;
    const productDefId = row.pdefId;
    const offeringId = row.wioId;

    if (categoryId && productDefId && offeringId) {
      const url = `/categories/${categoryId}/productdefinitions/${productDefId}/offerings/${offeringId}`;
      log.info(`[OfferingReportGrid] Navigating to: ${url}`);
      goto(url);
    } else {
      log.warn(`[OfferingReportGrid] Cannot navigate - missing IDs`, { categoryId, productDefId, offeringId });
    }
  }

  /**
   * Column Definitions - using view column names
   */
  const columns: ColumnDef<typeof OfferingReportViewSchema>[] = [
    {
      key: "wioId",
      header: "ID",
      accessor: (row) => row.wioId,
      sortable: true,
      filterable: true,
      filterType: "number",
      width: "80px"
    },
    {
      key: "wioTitle",
      header: "Offering",
      accessor: (row) => row.wioTitle || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "200px",
      isLink: true,
      onClick: handleOfferingClick
    },
    {
      key: "ptName",
      header: "Product Type",
      accessor: (row) => row.ptName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "150px"
    },
    {
      key: "catName",
      header: "Category",
      accessor: (row) => row.catName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "150px"
    },
    {
      key: "pdefTitle",
      header: "Product Def",
      accessor: (row) => row.pdefTitle || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "200px"
    },
    {
      key: "wsName",
      header: "Wholesaler",
      accessor: (row) => row.wsName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "150px"
    },
    {
      key: "pdefMatName",
      header: "PDef Material",
      accessor: (row) => row.pdefMatName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wioMaterialName",
      header: "WIO Material",
      accessor: (row) => row.wioMaterialName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "pdefFormName",
      header: "PDef Form",
      accessor: (row) => row.pdefFormName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wioFormName",
      header: "WIO Form",
      accessor: (row) => row.wioFormName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "pdConstrTypeName",
      header: "PDef Constr",
      accessor: (row) => row.pdConstrTypeName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "130px"
    },
    {
      key: "wioConstrTypeName",
      header: "WIO Constr",
      accessor: (row) => row.wioConstrTypeName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "130px"
    },
    {
      key: "pdSurfFinName",
      header: "PDef Surface",
      accessor: (row) => row.pdSurfFinName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wioSurfFinishName",
      header: "WIO Surface",
      accessor: (row) => row.wioSurfFinishName || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wioPrice",
      header: "Price",
      accessor: (row) => row.wioPrice ? row.wioPrice.toFixed(2) : "-",
      sortable: true,
      filterable: true,
      filterType: "number",
      width: "100px"
    },
    {
      key: "wioSize",
      header: "Size",
      accessor: (row) => row.wioSize || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "100px"
    },
    {
      key: "wioDimensions",
      header: "Dimensions",
      accessor: (row) => row.wioDimensions || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wioWeightGrams",
      header: "Weight (g)",
      accessor: (row) => row.wioWeightGrams ? row.wioWeightGrams.toString() : "-",
      sortable: true,
      filterable: true,
      filterType: "number",
      width: "100px"
    },
    {
      key: "wioComment",
      header: "Comment",
      accessor: (row) => row.wioComment ? row.wioComment.substring(0, 50) + "..." : "-",
      sortable: false,
      filterable: true,
      filterType: "text",
      width: "200px"
    },
    {
      key: "links" as any,
      header: "Links",
      accessor: (row: OfferingReportViewWithLinks) => {
        if (row.links?.[0]) {
          try {
            return new URL(row.links[0].url).hostname;
          } catch {
            return row.links[0].url.substring(0, 30) + "...";
          }
        }
        return "-";
      },
      sortable: false,
      filterable: false,
      filterType: "text",
      width: "12rem",
      isLink: true,
      onClick: (row: OfferingReportViewWithLinks) => {
        if (row.links?.[0]?.url) {
          window.open(row.links[0].url, "_blank");
        }
      },
    } as any,
  ];

  function getId(row: OfferingReportViewWithLinks): number {
    return row.wioId;
  }

  // Empty delete strategy (required but not used for report)
  const deleteStrategy = {
    execute: async () => {
      throw new Error("Delete not supported in reports");
    }
  };
</script>

<Datagrid
  {columns}
  {rows}
  {getId}
  {loading}
  {onQueryChange}
  {deleteStrategy}
  selection="none"
  gridId="offerings-report"
  entity="offering"
  maxBodyHeight={maxBodyHeight ?? "80vh"}
/>
