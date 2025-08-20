<!--
  src/routes/suppliers/+page.svelte
  
  This component displays a list of suppliers in a data grid.
  It supports client-side filtering (debounced), sorting, and a robust,
  non-blocking delete functionality with cascade support.
-->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { debounce } from "lodash-es";
  import Datagrid from "$lib/components/Datagrid.svelte";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from '$lib/stores/confirmation';
  import type { PageData } from "./$types";

  export let data: PageData;

  /** The current text used to filter the supplier list. */
  let filterText = data.filterText;

  /** A Set to store the IDs of ALL suppliers currently being deleted. This allows for multiple concurrent delete operations. */
  let deletingSupplierIds = new Set<number>();

  /**
   * Updates the URL search parameters based on the current filter and sort state,
   * which triggers SvelteKit's load function to refetch the data.
   */
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

  /** A debounced version of updateQuery to avoid excessive API calls while typing. */
  const debouncedUpdate = debounce(updateQuery, 300);

  /**
   * Handles the 'sort' event from the Datagrid component by updating URL parameters.
   * @param event - The sort event containing the column key.
   */
  function handleSort(event: { key: string }) {
    const newKey = event.key;
    let newDir: "asc" | "desc" = "asc";

    if (data.sort.key === newKey && data.sort.direction === "asc") {
      newDir = "desc";
    }

    const params = new URLSearchParams(window.location.search);
    params.set("sort", newKey);
    params.set("dir", newDir);

    goto(`?${params.toString()}`, {
      keepFocus: true,
      noScroll: true,
      replaceState: true,
    });
  }

  /**
   * Entry point for the delete process, triggered by a button click in the Datagrid.
   * @param event - The delete event containing the row data.
   */
  async function handleDelete(event: { row: any }) {
    const supplier = event.row;
    // Prevent re-triggering a delete action for an item that is already being deleted.
    if (deletingSupplierIds.has(supplier.wholesaler_id)) return;

    await attemptDelete(supplier, false);
  }

  /**
   * Manages the logic for deleting a supplier, including showing confirmations and handling cascade deletes.
   * @param supplier - The supplier object to be deleted.
   * @param cascade - A boolean flag to indicate if a cascade delete should be performed.
   */
  async function attemptDelete(supplier: any, cascade: boolean = false) {
    const supplierId = supplier.wholesaler_id;

    // Use the custom, non-blocking confirmation dialog.
    const message = cascade
      ? `CASCADE DELETE: Are you sure you want to permanently delete "${supplier.name}" AND ALL of its related data (offerings, categories, etc.)? This action cannot be undone.`
      : `Are you sure you want to delete the supplier "${supplier.name}"?`;
    const title = cascade ? 'Confirm Final Deletion' : 'Confirm Deletion';

    const confirmed = await requestConfirmation(message, title);
    if (!confirmed) return;

    // Add the ID to the set to show a loading state and trigger reactivity.
    deletingSupplierIds.add(supplierId);
    deletingSupplierIds = deletingSupplierIds;

    try {
      const formData = new FormData();
      formData.append("supplierId", supplierId.toString());
      if (cascade) formData.append("cascade", "true");

      const response = await fetch("/suppliers?/delete", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      // NOTE: It's crucial to handle cases where the response might not be JSON.
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        addNotification("Received an invalid response from the server.", "error");
        return;
      }

      if (response.ok && result.type === "success") {
        addNotification(result.data?.success ?? `Supplier "${supplier.name}" deleted successfully!`, "success");
        
        // Invalidate data to get the fresh list from the server.
        // Includes a timeout as a fallback in case invalidateAll() hangs.
        try {
          await Promise.race([
            invalidateAll(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
          ]);
        } catch {
          // Fallback: Manually remove the item from the local list if invalidation fails.
          data.wholesalers = data.wholesalers.filter((w:any) => w.wholesaler_id !== supplierId);
        }

      } else if (result.type === "failure") {
        const hasDependencies = result.data?.showCascadeOption === true;

        if (hasDependencies && !cascade) {
          // Remove the loading state before showing the next dialog.
          deletingSupplierIds.delete(supplierId);
          deletingSupplierIds = deletingSupplierIds;
          
          // The server found dependencies, so we ask the user if they want to cascade.
          const cascadeMessage = `Cannot delete "${supplier.name}": ${result.data?.error}\n\nDo you want to perform a cascade delete to remove the supplier and all its dependencies?`;
          const cascadeConfirmed = await requestConfirmation(cascadeMessage, 'Dependencies Found');
          
          if (cascadeConfirmed) {
            // Recursively call this function to perform the cascade delete.
            await attemptDelete(supplier, true);
          }
        } else {
          addNotification(result.data?.error ?? "Failed to delete supplier.", "error");
        }
      } else {
        addNotification("An unexpected response was received from the server.", "error");
      }
    } catch (error) {
      console.error("Error during delete operation:", error);
      addNotification("A network or server error occurred.", "error");
    } finally {
      // ALWAYS remove the ID from the set to clean up the UI state, regardless of outcome.
      deletingSupplierIds.delete(supplierId);
      deletingSupplierIds = deletingSupplierIds;
    }
  }

  /**
   * Checks if a specific supplier is currently in the process of being deleted.
   * @param supplier - The supplier object to check.
   * @returns True if the delete button should be disabled.
   */
  function isDeleteDisabled(supplier: any): boolean {
    return deletingSupplierIds.has(supplier.wholesaler_id);
  }

  /**
   * Provides a dynamic tooltip for the delete button based on its state.
   * @param supplier - The supplier object for the tooltip.
   * @returns The appropriate tooltip text.
   */
  function getDeleteTooltip(supplier: any): string {
    if (deletingSupplierIds.has(supplier.wholesaler_id)) {
      return "Deleting...";
    }
    return `Delete supplier "${supplier.name}" (with dependency check)`;
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
    onsort={handleSort}
    ondelete={handleDelete}
    showDelete={true}
    deleteDisabled={isDeleteDisabled}
    deleteTooltip={getDeleteTooltip}
    height="70vh"
  >
    <!-- Custom cell rendering -->
    <div slot="cell" let:row let:column let:value>
      {#if column.key === "name"}
        <a href="/suppliers/{row.wholesaler_id}">{value}</a>
      {:else if column.key === "dropship"}
        {value ? "✅" : "❌"}
      {:else}
        {value ?? "-"}
      {/if}
    </div>

    <!-- Custom delete button with per-row loading state -->
    <div slot="delete" let:row>
      <button
        class="custom-delete-button"
        class:deleting={deletingSupplierIds.has(row.wholesaler_id)}
        disabled={isDeleteDisabled(row)}
        title={getDeleteTooltip(row)}
        on:click={() => handleDelete({ row })}
      >
        {#if deletingSupplierIds.has(row.wholesaler_id)}
          <span class="spinner">⏳</span>
        {:else}
          🗑️
        {/if}
      </button>
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
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
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

  /* Enhanced delete button styling */
  .custom-delete-button {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    color: #dc3545;
    min-width: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .custom-delete-button:hover:not(:disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
    transform: scale(1.05);
  }

  .custom-delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .custom-delete-button.deleting {
    animation: deleteProgress 2s infinite;
    border-color: #f59e0b;
    background-color: #fef3c7;
    cursor: wait;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes deleteProgress {
    0%,
    100% {
      opacity: 1;
      border-color: #f59e0b;
    }
    50% {
      opacity: 0.6;
      border-color: #dc3545;
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>