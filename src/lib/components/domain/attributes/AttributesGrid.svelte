<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor, WhereCondition, WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import type { Attribute, AttributeSchema } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type AttributesGridProps = {
    rows: Attribute[];
    loading?: boolean;
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<Attribute>;
    rowActionStrategy?: RowActionStrategy<Attribute>;
    onQueryChange?: (query: {
      filters: WhereCondition<Attribute> | WhereConditionGroup<Attribute> | null,
      sort: SortDescriptor<Attribute>[] | null
    }) => Promise<void> | void;
  };

  const { rows = [], loading = false, selection = "multiple", deleteStrategy, rowActionStrategy, onQueryChange }: AttributesGridProps = $props();

  // === COLUMNS ==================================================================================

  const columns: ColumnDef<typeof AttributeSchema>[] = [
    { key: "name", header: "Name", sortable: true, width: "2fr" },
    { key: "description", header: "Description", sortable: true, width: "3fr" },
    { key: "attribute_id", header: "ID", sortable: true, width: "1fr" },
  ];

  // === ID EXTRACTOR =============================================================================

  const getId = (r: Attribute) => r.attribute_id;
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  {selection}
  gridId="attributes-master"
  entity="attribute"
  {deleteStrategy}
  {rowActionStrategy}
  {onQueryChange}
/>