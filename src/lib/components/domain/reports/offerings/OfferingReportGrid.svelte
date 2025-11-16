<script lang="ts">
  /**
   * OfferingReportGrid Component
   *
   * Grid configuration for the Offerings Report.
   * Uses view_offerings_pt_pc_pd for complete breadth of data.
   *
   * Key Features:
   * - Filterable columns for all view fields
   * - Clickable rows for navigation to offering detail page
   * - Clickable Links column showing first link (opens in new tab)
   * - Server-side filtering and sorting via QueryGrammar
   *
   * Column Key Structure:
   * - View column names: wioId, wioTitle, wsName, catName, pdefTitle, etc.
   * - Flat structure (no nested objects like row.wholesaler.name)
   *
   * Navigation:
   * - Clicking on any row navigates to: /categories/{categoryId}/productdefinitions/{productDefId}/offerings/{offeringId}
   * - Clicking on Links opens wholesaler website in new tab
   * - Uses proper URL hierarchy for deep linking and breadcrumbs
   */
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { SelectionChangeHandler, ToolbarSnippetProps, CustomFilterDef } from "$lib/components/grids/Datagrid.types";
  import { ComparisonOperator } from "$lib/backendQueries/queryGrammar";
  import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import type { OfferingReportViewWithLinks } from "$lib/domain/domainTypes";
  import type { Snippet } from "svelte";
  // CRITICAL: Import ALL stable references from separate module
  // If defined inline, props get new reference on every render → infinite loop
  import { columns, getId, deleteStrategy, rowActionStrategy } from "./OfferingReportGrid.columns";
  import QuickTextInput from "$lib/components/grids/filters/QuickTextInput.svelte";

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

  // getId, deleteStrategy, and rowActionStrategy are imported from .columns.ts for stable references

  // Quick Filters (module-local, simple reference)
  const customFilters: CustomFilterDef<any>[] = [
    {
      id: 'qf-material-like',
      label: 'Material contains',
      type: 'custom',
      placement: { type: 'quickfilter', pos: 0 },
      // Simple inline input (uses FilterToolbar's custom component contract)
      component: QuickTextInput as any,
      buildCondition: (term: string) => {
        const trimmed = (term ?? '').trim();
        if (trimmed.length === 0) return null;
        const likeVal = `%${trimmed}%`;
        return {
          whereCondOp: 'OR',
          conditions: [
            { key: 'wioMaterialName', whereCondOp: ComparisonOperator.LIKE, val: likeVal },
            { key: 'pdefMatName', whereCondOp: ComparisonOperator.LIKE, val: likeVal },
          ]
        } as WhereConditionGroup<any>;
      }
    }
  ];
</script>

<Datagrid
  {columns}
  {rows}
  {getId}
  {customFilters}
  {onQueryChange}
  {deleteStrategy}
  {rowActionStrategy}
  {selection}
  {onSelectionChange}
  {toolbar}
  {showSuperuserWhere}
  {onRawWhereChange}
  gridId="offerings-report"
  entity="offering"
  maxBodyHeight={maxBodyHeight ?? "80vh"}
/>
