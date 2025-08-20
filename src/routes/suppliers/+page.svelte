<script lang="ts">
  import { goto } from "$app/navigation";
  import { debounce } from "lodash-es";
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { PageData } from "./$types";

  export let data: PageData;

  // UI state is bound to the props passed from `load`. This is for the input control.
  let filterText = data.filterText;

  // This function simply updates the URL. SvelteKit does the rest.
  function updateQuery() {
    const params = new URLSearchParams();
    if (filterText) {
      params.set("filter", filterText);
    }
    params.set("sort", data.sort.key);
    params.set("dir", data.sort.direction);

    goto(`?${params.toString()}`, {
      keepFocus: true,
      noScroll: true,
      replaceState: true,
    });
  }

  const debouncedUpdate = debounce(updateQuery, 300);

  function handleSort(event: CustomEvent<{ key: string }>) {
    const newKey = event.detail.key;
    let newDir = "asc";
    if (data.sort.key === newKey && data.sort.direction === "asc") {
      newDir = "desc";
    }

    const params = new URLSearchParams();
    if (filterText) params.set("filter", filterText);
    params.set("sort", newKey);
    params.set("dir", newDir);

    goto(`?${params.toString()}`, {
      keepFocus: true,
      noScroll: true,
      replaceState: true,
    });
  }
  
  // The column definitions are no longer defined here.
  // They come directly from the `data` prop!
</script>

<div class="container">
  <h1>Suppliers</h1>

  <div class="controls">
    <input
      type="text"
      bind:value={filterText}
      on:input={debouncedUpdate}
      placeholder="Filter by name..."
    />
  </div>

  <Datagrid
    rows={data.wholesalers}
    columns={data.columnDefs} 
    on:sort={handleSort}
    height="70vh"
  >
    <div slot="cell" let:row let:column let:value>
      {#if column.key === 'name'}
        <a href="/suppliers/{row.wholesaler_id}">{value}</a>
      {:else if column.key === 'dropship'}
        {value ? '✅' : '❌'}
      {:else}
        {value ?? '-'}
      {/if}
    </div>
  </Datagrid>
</div>

<style>
    /* ... your styles ... */
</style>