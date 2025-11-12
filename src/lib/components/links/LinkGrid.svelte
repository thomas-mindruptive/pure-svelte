<!-- src/lib/components/links/LinkGrid.svelte -->
<script lang="ts">
  // LinkGrid.svelte (Svelte 5 + Runes) - REFACTORED
  //
  // PURPOSE:
  // Thin wrapper around the reusable Datagrid component for displaying
  // WholesalerOfferingLink data. Now accepts strategy props for consistency.

  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import { type WholesalerOfferingLink, WholesalerOfferingLinkSchema } from "$lib/domain/domainTypes";
  import type {
    DeleteStrategy,
    ColumnDef,
  } from "../grids/Datagrid.types";

  // ===== COMPONENT PROPS  =====

  export type LinkGridProps = {
    rows: WholesalerOfferingLink[];
    deleteStrategy: DeleteStrategy<WholesalerOfferingLink>;
    // We navigate to the link externally!
      //rowActionStrategy?: RowActionStrategy<WholesalerOfferingLink>;
  }

  const {
    rows = [] as WholesalerOfferingLink[],
    deleteStrategy,
  }:LinkGridProps = $props();

  // ===== COLUMN DEFINITIONS (Unchanged) =====

  const columns: ColumnDef<typeof WholesalerOfferingLinkSchema>[] = [
    {
      key: "url",
      header: "URL",
      width:"350px",
      sortable: true,
      accessor: (link) => link.url.substring(0, 40) + " ...",
    },
    {
      key: "notes",
      header: "Description",
      sortable: false,
      //accessor: (link) => link.notes || "—",
    },
    {
      key: "created_at",
      header: "Added",
      width:"100px",
      sortable: true,
      accessor: (link) => {
        if (!link.created_at) return "—";
        try {
          return new Date(link.created_at).toLocaleDateString();
        } catch {
          return String(link.created_at);
        }
      },
    },
  ];

  // ===== ID EXTRACTION (Unchanged) =====

  const getId = (link: WholesalerOfferingLink) => link.link_id;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  gridId="links"
  entity="link"
  {deleteStrategy}
  rowActionStrategy={{
      click: (link) => window.open(link.url, '_blank')
    }}
/>
