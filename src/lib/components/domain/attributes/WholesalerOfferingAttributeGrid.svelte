<!-- src/lib/components/domain/attributes/AttributeGrid.svelte -->
<script lang="ts">
  // AttributeGrid.svelte (Svelte 5 + Runes) - REFACTORED
  //
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component for displaying
  // WholesalerOfferingAttribute data. Now accepts strategy props for consistency.

  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { ColumnDef, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { WholesalerOfferingAttribute_Attribute, WholesalerOfferingAttribute_AttributeSchema } from "$lib/domain/domainTypes";

  // ===== COMPONENT PROPS =====

  export type AttributeGridProps = {
    rows: WholesalerOfferingAttribute_Attribute[];
    selection?: "none" | "single" | "multiple";
    deleteStrategy: DeleteStrategy<WholesalerOfferingAttribute_Attribute>;
    rowActionStrategy?: RowActionStrategy<WholesalerOfferingAttribute_Attribute>;
  };

  const {
    rows = [] as WholesalerOfferingAttribute_Attribute[],
    selection = "multiple",
    deleteStrategy,
    rowActionStrategy,
  }: AttributeGridProps = $props();

  // ===== COLUMN DEFINITIONS (Unchanged) =====

  const columns: ColumnDef<typeof WholesalerOfferingAttribute_AttributeSchema>[] = [
    {
      key: "attribute_name",
      header: "Attribute",
      sortable: true,
      width: "2fr",
      accessor: (attr) => attr.attribute_name || `Attribute #${attr.attribute_id}`,
    },
    {
      key: "value",
      header: "Value",
      sortable: true,
      width: "2fr",
      accessor: (attr) => attr.value || "—",
    },
    {
      key: "attribute_description",
      header: "Description",
      sortable: false,
      width: "3fr",
      accessor: (attr) => attr.attribute_description || "—",
    },
    {
      key: "attribute_id",
      header: "ID",
      sortable: true,
      width: "0.5fr",
      accessor: (attr) => attr.attribute_id.toString(),
    },
  ];

  const getId = (attribute: WholesalerOfferingAttribute_Attribute) => attribute.attribute_id;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {selection}
  gridId="attributes"
  entity="attribute"
  {deleteStrategy}
  {rowActionStrategy}
/>
