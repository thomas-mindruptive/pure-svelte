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
  import QuickTwoTextFilter from "$lib/components/grids/filters/QuickTwoTextFilter.svelte";

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
      id: 'qf-material-form-like',
      label: 'Filter by Material & Form',
      type: 'custom',
      placement: { type: 'quickfilter', pos: 0 },
      component: QuickTwoTextFilter as any,
      /**
       * value: { material?: string; form?: string }
       * Build: (wioMaterialName LIKE %m% OR pdefMatName LIKE %m%) AND (wioFormName LIKE %f% OR pdefFormName LIKE %f%)
       * If only one term present, return just that subgroup (OR of the two view columns). If none, return null.
       */
      buildCondition: (value: { material?: string; form?: string }) => {
        const material = (value?.material ?? '').trim();
        const form = (value?.form ?? '').trim();
        const subGroups: Array<WhereConditionGroup<any>> = [];

        if (material) {
          const mLike = `%${material}%`;
          subGroups.push({
            whereCondOp: 'OR',
            conditions: [
              { key: 'wioMaterialName', whereCondOp: ComparisonOperator.LIKE, val: mLike },
              { key: 'pdefMatName', whereCondOp: ComparisonOperator.LIKE, val: mLike },
            ]
          } as WhereConditionGroup<any>);
        }

        if (form) {
          const fLike = `%${form}%`;
          subGroups.push({
            whereCondOp: 'OR',
            conditions: [
              { key: 'wioFormName', whereCondOp: ComparisonOperator.LIKE, val: fLike },
              { key: 'pdefFormName', whereCondOp: ComparisonOperator.LIKE, val: fLike },
            ]
          } as WhereConditionGroup<any>);
        }

        if (subGroups.length === 0) {
          return null;
        }
        if (subGroups.length === 1) {
          return subGroups[0];
        }
        return {
          whereCondOp: 'AND',
          conditions: subGroups as any[]
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
