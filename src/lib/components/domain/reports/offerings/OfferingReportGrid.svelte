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
  import type { SelectionChangeHandler, ToolbarSnippetProps } from "$lib/components/grids/Datagrid.types";
  import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import type { OfferingReportViewWithLinks } from "$lib/domain/domainTypes";
  import type { Snippet } from "svelte";
  // CRITICAL: Import ALL stable references from separate module
  // If defined inline, props get new reference on every render → infinite loop
  import { columns, getId, deleteStrategy } from "./OfferingReportGrid.columns";

  type Props = {
    rows: OfferingReportViewWithLinks[];
    onQueryChange?: (query: {
      filters: WhereCondition<OfferingReportViewWithLinks> | WhereConditionGroup<OfferingReportViewWithLinks> | null,
      sort: SortDescriptor<OfferingReportViewWithLinks>[] | null
    }) => Promise<void> | void;
    maxBodyHeight?: string;
    selection?: "none" | "single" | "multiple";
    onSelectionChange?: SelectionChangeHandler | undefined;
    toolbar?: Snippet<[ToolbarSnippetProps]> | undefined;
    showSuperuserWhere?: boolean;
    onRawWhereChange?: (rawWhere: string | null) => void;
  };

  let { rows, onQueryChange, maxBodyHeight, selection = "none", onSelectionChange, toolbar, showSuperuserWhere = false, onRawWhereChange }: Props = $props();

  // getId and deleteStrategy are imported from .columns.ts for stable references
</script>

<Datagrid
  {columns}
  {rows}
  {getId}
  {onQueryChange}
  {deleteStrategy}
  {selection}
  {onSelectionChange}
  {toolbar}
  {showSuperuserWhere}
  {onRawWhereChange}
  gridId="offerings-report"
  entity="offering"
  maxBodyHeight={maxBodyHeight ?? "80vh"}
/>
