<script lang="ts">
  import { goto } from "$app/navigation";
  import { debounce } from "lodash-es";
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { PageData } from "./$types";

  // The `data` prop is populated by the universal `load` function in `+page.ts`.
  export let data: PageData;

  // UI state is bound to the props passed from `load`.
  // This ensures the input field is in sync when the page data changes (e.g., on back/forward navigation).
  let filterText = data.filterText;

  // This function updates the URL search parameters. SvelteKit's router
  // detects the URL change and automatically re-runs the `load` function.
  function updateQuery() {
    const params = new URLSearchParams();
    if (filterText) {
      params.set("filter", filterText);
    }
    // Always include the current sort state in the URL
    params.set("sort", data.sort.key);
    params.set("dir", data.sort.direction);

    goto(`?${params.toString()}`, {
      keepFocus: true, 
      noScroll: true,  
      replaceState: true, // Avoids polluting browser history for simple filter changes
    });
  }

  // Debounce the update function to avoid excessive API calls while the user is typing.
  const debouncedUpdate = debounce(updateQuery, 300);

  // This function handles the custom `sort` event emitted by the Datagrid component.
  function handleSort(event: CustomEvent<{ key: string }>) {
    const newKey = event.detail.key;
    let newDir: 'asc' | 'desc' = "asc";

    // If sorting by the same column, toggle the direction.
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
</script>

<svelte:head>
  <title>Suppliers</title>
</svelte:head>

<div class="container">
  <div class="page-header">
    <h1>Suppliers</h1>
    <a href="/suppliers/new" class="primary-button">+ New Supplier</a>
  </div>

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
  .container {
    padding-top: var(--spacing-xl, 2rem);
    padding-bottom: var(--spacing-xl, 2rem);
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg, 1.5rem);
  }

  .page-header h1 {
    margin-bottom: 0;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 1rem);
    margin-bottom: var(--spacing-lg, 1.5rem);
  }

  .controls input[type="text"] {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border, #cbd5e1);
    border-radius: 6px;
    font-size: 1rem;
    width: 100%;
    max-width: 350px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .controls input[type="text"]:focus {
    outline: none;
    border-color: var(--color-primary, #4f46e5);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
  }

  .primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1.25rem;
    background-color: var(--color-primary, #4f46e5);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .primary-button:hover {
    background-color: #4338ca;
    text-decoration: none;
  }
</style>