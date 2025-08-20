<!--
  src/routes/suppliers/+page.svelte

  This is the final, robust version. It correctly handles the "double-serialized"
  response from SvelteKit actions. It first parses the outer JSON shell, then uses
  `devalue/parse` on the inner `data` property. It correctly differentiates between
  the complex array structure of a `failure` response and the simple object
  structure of a `success` response.
-->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { debounce } from "lodash-es";
  import { parse } from 'devalue';
  import Datagrid from "$lib/components/Datagrid.svelte";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from '$lib/stores/confirmation';
  import { log } from '$lib/utils/logger';
  import type { PageData } from "./$types";

  export let data: PageData;

  let filterText = data.filterText;
  let deletingSupplierIds = new Set<number>();

  function updateQuery() {
    const params = new URLSearchParams();
    if (filterText) params.set("filter", filterText);
    params.set("sort", data.sort.key);
    params.set("dir", data.sort.direction);
    goto(`?${params.toString()}`, {
      keepFocus: true,
      noScroll: true,
      replaceState: true,
    });
  }

  const debouncedUpdate = debounce(updateQuery, 300);

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

  async function handleDelete(event: { row: any }) {
    const supplier = event.row;
    if (deletingSupplierIds.has(supplier.wholesaler_id)) return;
    await attemptDelete(supplier, false);
  }

  async function attemptDelete(supplier: any, cascade: boolean = false) {
    const supplierId = supplier.wholesaler_id;

    const message = cascade
      ? `CASCADE DELETE: Are you sure you want to permanently delete "${supplier.name}" AND ALL of its related data? This action cannot be undone.`
      : `Are you sure you want to delete the supplier "${supplier.name}"?`;
    const title = cascade ? 'Confirm Final Deletion' : 'Confirm Deletion';

    const confirmed = await requestConfirmation(message, title);
    if (!confirmed) return;

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
      
      const outerResponse = JSON.parse(responseText);
      const payload = parse(outerResponse.data);

      if (outerResponse.type === 'failure') {
        // --- FEHLERFALL ---
        // Bei Fehlern ist das Payload ein Array: [template, ...values]
        const errorObject = payload[0];

        if (errorObject?.showCascadeOption && !cascade) {
          deletingSupplierIds.delete(supplierId);
          deletingSupplierIds = deletingSupplierIds;

          const cascadeMessage = `Cannot delete "${supplier.name}": ${errorObject.error}\n\nDo you want to perform a cascade delete?`;
          const cascadeConfirmed = await requestConfirmation(cascadeMessage, 'Dependencies Found');
          if (cascadeConfirmed) {
            await attemptDelete(supplier, true);
          }
        } else {
          addNotification(errorObject?.error || "An unknown error occurred.", "error");
        }

      } else if (outerResponse.type === 'success') {
        // --- ERFOLGSFALL ---
        // ✅ KORREKTUR: Bei Erfolg ist das Payload das EINFACHE OBJEKT SELBST.
        // Keine komplizierte Array-Logik hier.
        const successObject = payload;

        addNotification(successObject?.success, "success");
        await invalidateAll();
        
      } else {
        // Fallback für völlig unerwartete Antworten
        throw new Error("Unknown response type from server");
      }
    } catch (error) {
      log.error("Critical error during delete operation:", error);
      addNotification("A critical network or server error occurred.", "error");
    } finally {
      deletingSupplierIds.delete(supplierId);
      deletingSupplierIds = deletingSupplierIds;
    }
  }

  function isDeleteDisabled(supplier: any): boolean {
    return deletingSupplierIds.has(supplier.wholesaler_id);
  }

  function getDeleteTooltip(supplier: any): string {
    if (deletingSupplierIds.has(supplier.wholesaler_id)) return "Deleting...";
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
    <div slot="cell" let:row let:column let:value>
      {#if column.key === "name"}
        <a href="/suppliers/{row.wholesaler_id}">{value}</a>
      {:else if column.key === "dropship"}
        {value ? "✅" : "❌"}
      {:else}
        {value ?? "-"}
      {/if}
    </div>

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