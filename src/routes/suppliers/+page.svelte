<script lang="ts">
  import type {ColumnDefinitionInclDB} from "$lib/clientAndBack/columnDefinitions";
  import DataGrid from "$lib/components/Datagrid.svelte";
  export let data;

  const columnDefs: ColumnDefinitionInclDB[] = [
    // Using the correct column names from the wholesalers table
    { key: "name", title: "Supplier Name", sortable: true, width: "3fr", databaseCol: "name" },
    { key: "region", title: "Region", sortable: true, width: "2fr", databaseCol: "region" },
    { key: "status", title: "Status", sortable: true, width: "1fr", databaseCol: "status" },
    {
      key: "dropship",
      title: "Dropshipping",
      sortable: true,
      type: "string",
      width: "1fr",
      databaseCol: "dropship"
    },
  ];
</script>

<svelte:head>
  <title>Suppliers</title>
</svelte:head>

<div class="container">
  <h1>Suppliers</h1>

  <DataGrid rows={data.wholesalers} columns={columnDefs} height="70vh">
    <div slot="cell" let:row let:column let:value>
      {#if column.key === "name"}
        <!-- THE CORRECTION IS HERE: Use the correct route -->
        <a href="/suppliers/{row.wholesaler_id}">{value}</a>
      {:else if column.key === "dropship"}
        {value ? "✅" : "❌"}
      {:else}
        {value ?? "-"}
      {/if}
    </div>
  </DataGrid>
</div>

<style>
  .container {
    padding-top: var(--spacing-xl, 2rem);
    padding-bottom: var(--spacing-xl, 2rem);
  }
  h1 {
    margin-bottom: var(--spacing-lg, 1.5rem);
  }
</style>
