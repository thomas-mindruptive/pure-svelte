<script lang="ts">
  /**
   * OfferingReportGrid Component
   *
   * Grid configuration for the Offerings Report.
   * Displays nested offerings data with related wholesaler, product definition, and category info.
   *
   * Key Features:
   * - 13 filterable columns (ID, Title, Wholesaler, Product Def, Category, Price, etc.)
   * - Clickable Title column for navigation to offering detail page
   * - Auto-type detection for filters (number, text, boolean)
   * - Server-side filtering and sorting via QueryGrammar
   *
   * Column Key Structure:
   * - DB Aliases: Used as column keys for backend queries (e.g., "w.name", "pd.title", "pc.name")
   * - Accessor Functions: Map DB aliases to actual row properties (e.g., row.wholesaler?.name)
   * - Why Both? Backend expects SQL aliases, but JavaScript objects use nested properties
   *
   * Navigation:
   * - Clicking on Title navigates to: /categories/{categoryId}/productdefinitions/{productDefId}/offerings/{offeringId}
   * - Uses proper URL hierarchy for deep linking and breadcrumbs
   */
  import Datagrid2 from "$lib/components/grids/Datagrid2.svelte";
  import type { ColumnDef, FilterFunc, SortFunc } from "$lib/components/grids/Datagrid.types";
  import type { Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";
  import { Wio_PDef_Cat_Supp_Nested_WithLinks_Schema } from "$lib/domain/domainTypes";
  import { log } from "$lib/utils/logger";
  import { goto } from "$app/navigation";

  type Props = {
    rows: Wio_PDef_Cat_Supp_Nested_WithLinks[];
    loading: boolean;
    onFilter: FilterFunc<Wio_PDef_Cat_Supp_Nested_WithLinks>;
    onSort: SortFunc<Wio_PDef_Cat_Supp_Nested_WithLinks>;
  };

  let { rows, loading, onFilter, onSort }: Props = $props();

  // Log rows when they change
  $effect(() => {
    log.info(`[OfferingReportGrid] Rows updated: ${rows.length} rows`);
    if (rows.length > 0) {
      const firstRow = rows[0];
      log.info(`[OfferingReportGrid] First row keys:`, Object.keys(firstRow));
      log.info(`[OfferingReportGrid] First row sample:`, {
        offering_id: firstRow.offering_id,
        title: firstRow.title,
        wholesaler_name: firstRow.wholesaler?.name,
        product_def_title: firstRow.product_def?.title,
        category_name: firstRow.category?.name,
        price: firstRow.price,
        dimensions: firstRow.dimensions,
        weight_range: firstRow.weight_range,
        wholesaler_article_number: firstRow.wholesaler_article_number,
        size: firstRow.size,
        color_variant: firstRow.color_variant,
        is_assortment: firstRow.is_assortment
      });
      log.info(`[OfferingReportGrid] Wholesaler object:`, firstRow.wholesaler);
      log.info(`[OfferingReportGrid] Product def object:`, firstRow.product_def);
      log.info(`[OfferingReportGrid] Category object:`, firstRow.category);
    }
  });

  /**
   * Navigates to the offering detail page when user clicks on Title.
   *
   * URL Structure: /categories/{categoryId}/productdefinitions/{productDefId}/offerings/{offeringId}
   *
   * Why This Hierarchy?
   * - Follows the data model: Category -> Product Definition -> Offering
   * - Enables proper breadcrumb navigation
   * - Supports deep linking (can bookmark specific offering)
   * - Matches existing route structure in the app
   *
   * Note: Uses category_id and product_def_id (not just id) from nested objects.
   */
  function handleOfferingClick(row: Wio_PDef_Cat_Supp_Nested_WithLinks) {
    const categoryId = row.category?.category_id;
    const productDefId = row.product_def?.product_def_id;
    const offeringId = row.offering_id;

    if (categoryId && productDefId && offeringId) {
      const url = `/categories/${categoryId}/productdefinitions/${productDefId}/offerings/${offeringId}`;
      log.info(`[OfferingReportGrid] Navigating to: ${url}`);
      goto(url);
    } else {
      log.warn(`[OfferingReportGrid] Cannot navigate - missing IDs`, { categoryId, productDefId, offeringId });
    }
  }

  /**
   * Column Definitions
   *
   * IMPORTANT: All columns with qualified keys (e.g., "wio.title") need accessor functions!
   *
   * Why Accessor Functions?
   * - Column key "wio.title" is used for backend queries (SQL alias)
   * - Row property is "title" (JavaScript object property)
   * - Without accessor, grid would try to read row["wio.title"] which doesn't exist
   * - Accessor maps qualified key to actual property: row.title
   *
   * Pattern:
   * - key: DB alias for backend (sorting/filtering)
   * - accessor: Maps to actual row property
   * - isLink: Makes column clickable
   * - onClick: Navigation handler
   */
  const columns: ColumnDef<typeof Wio_PDef_Cat_Supp_Nested_WithLinks_Schema>[] = [
    {
      key: "wio.offering_id",
      header: "ID",
      accessor: (row) => row.offering_id,
      sortable: true,
      filterable: true,
      filterType: "number",
      width: "80px"
    },
    {
      key: "wio.title",
      header: "Title",
      accessor: (row) => row.title || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "250px",
      isLink: true,
      onClick: handleOfferingClick
    },
    {
      key: "w.name",
      header: "Wholesaler",
      accessor: (row) => row.wholesaler?.name || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "150px"
    },
    {
      key: "pd.title",
      header: "Product Definition",
      accessor: (row) => row.product_def?.title || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "200px"
    },
    {
      key: "pc.name",
      header: "Category",
      accessor: (row) => row.category?.name || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "150px"
    },
    {
      key: "wio.price",
      header: "Price",
      accessor: (row) => row.price ? `${row.price.toFixed(2)} ${row.currency || ''}` : "-",
      sortable: true,
      filterable: true,
      filterType: "number",
      width: "120px"
    },
    {
      key: "wio.dimensions",
      header: "Dimensions",
      accessor: (row) => row.dimensions || "-",
      sortable: false,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wio.weight_range",
      header: "Weight",
      accessor: (row) => row.weight_range || "-",
      sortable: false,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wio.wholesaler_article_number",
      header: "Article #",
      accessor: (row) => row.wholesaler_article_number || "-",
      sortable: true,
      filterable: true,
      filterType: "text",
      width: "120px"
    },
    {
      key: "wio.size",
      header: "Size",
      accessor: (row) => row.size || "-",
      sortable: false,
      filterable: true,
      filterType: "text",
      width: "100px"
    },
    {
      key: "wio.color_variant",
      header: "Color",
      accessor: (row) => row.color_variant || "-",
      sortable: false,
      filterable: true,
      filterType: "text",
      width: "100px"
    },
    {
      key: "wio.is_assortment",
      header: "Assortment",
      accessor: (row) => row.is_assortment ? "Yes" : "No",
      sortable: true,
      filterable: true,
      filterType: "boolean",
      width: "100px"
    },
    {
      key: "<computed>",
      header: "Links",
      accessor: (row) => row.links?.length || 0,
      sortable: false,
      width: "80px"
    }
  ];

  function getId(row: Wio_PDef_Cat_Supp_Nested_WithLinks): number {
    return row.offering_id;
  }

  // Empty delete strategy (required but not used for report)
  const deleteStrategy = {
    execute: async () => {
      throw new Error("Delete not supported in reports");
    }
  };
</script>

<Datagrid2
  {columns}
  {rows}
  {getId}
  {loading}
  {onFilter}
  {onSort}
  {deleteStrategy}
  selection="none"
  gridId="offerings-report"
  entity="offering"
/>
