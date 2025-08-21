<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { addNotification } from "$lib/stores/notifications";
  import { requestConfirmation } from "$lib/stores/confirmation";
  import { parse } from "devalue";
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  import type { PageData } from "./$types";
  import { log } from "$lib/utils/logger";

  export let data: PageData;

  // Lokaler Zustand, um die UI ohne vollständiges Neuladen zu aktualisieren
  let assignedCategories = [...data.assignedCategories];
  let availableCategories = [...data.availableCategories];
  let selectedCategoryId = "";

  // ✅ NEU: Zustand für laufende Löschvorgänge bei Kategorien
  let deletingCategoryIds = new Set<number>();

  // ✅ NEU: Spaltendefinitionen für das wiederverwendbare Kategorien-Grid
  const categoryColumns: ColumnDefinition[] = [
    { key: "name", title: "Category", sortable: true, width: "3fr" },
    {
      key: "offering_count",
      title: "Offerings",
      sortable: true,
      type: "number",
      width: "1fr",
    },
    { key: "comment", title: "Comment", sortable: false, width: "2fr" },
  ];

  // Hilfsfunktionen zur UI-Aktualisierung
  function applyAddedCategory(added: {
    category_id: number;
    name: string;
    offering_count?: number;
    comment?: string;
    link?: string;
  }) {
    assignedCategories = [
      ...assignedCategories,
      { ...added, offering_count: added.offering_count ?? 0 },
    ].sort((a, b) => a.name.localeCompare(b.name));
    availableCategories = availableCategories.filter(
      (c) => c.category_id !== added.category_id,
    );
  }

  function applyRemovedCategory(id: number) {
    const removed = assignedCategories.find((c) => c.category_id === id);
    assignedCategories = assignedCategories.filter((c) => c.category_id !== id);
    if (removed) {
      availableCategories = [
        ...availableCategories,
        { category_id: removed.category_id, name: removed.name },
      ].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  async function handleRemoveCategory(category: any, cascade = false) {
    const categoryId = category.category_id;
    const categoryName = category.name;

    // Wir fragen nur beim ersten Klick, nicht bei der Kaskadierungs-Bestätigung.
    if (!cascade) {
      const confirmed = await requestConfirmation(
        `Are you sure you want to remove the category "${categoryName}"? The system will check for dependencies.`,
        "Confirm Removal",
      );
      if (!confirmed) return;
    }

    deletingCategoryIds.add(categoryId);
    deletingCategoryIds = deletingCategoryIds; // Reaktivität auslösen

    const formData = new FormData();
    formData.append("categoryId", categoryId.toString());
    if (cascade) {
      formData.append("cascade", "true");
    }

    try {
      const response = await fetch("?/removeCategory", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      const outerResponse = JSON.parse(responseText);

      log.info("*****\nouterResponse: %O\n*****", outerResponse);

      const result = parse(outerResponse.data);
      log.info("*****parsed outerResponse, 'result': %O\n*****", result);

      if (outerResponse.type === "failure") {
        log.info("*****\nCLIENT DEBUG - errorData: %O\n*****", result.error);

        if (result?.showCascadeOption) {
          log.info(
            "*****\nCLIENT DEBUG - result?.showCascadeOption == true\n*****",
          );
          const cascadeConfirmed = await requestConfirmation(
            `❌ Cannot remove "${categoryName}": ${result.error}\n\nDo you want to perform a CASCADE DELETE to remove the category and all its offerings?`,
            "Dependencies Found",
          );
          if (cascadeConfirmed) {
            log.info("*****\nCLIENT DEBUG - cascadeConfirmed == true\n*****");
            await handleRemoveCategory(category, true); // Rekursiver Aufruf
          }
        } else {
          addNotification(result.error || "Failed to remove category", "error");
        }
      } else if (outerResponse.type === "success") {
        const successData = result; // Bei Erfolg ist es das direkte Objekt
        const removedId = successData?.removedCategoryId;
        if (removedId) {
          applyRemovedCategory(removedId);
          addNotification("Category removed successfully", "success");
        }
      }
    } catch (err) {
      addNotification(
        "A critical error occurred while removing the category.",
        "error",
      );
      console.error("Error in handleRemoveCategory:", err);
    } finally {
      deletingCategoryIds.delete(categoryId);
      deletingCategoryIds = deletingCategoryIds; // Reaktivität auslösen
    }
  }
</script>

<svelte:head>
  <title
    >{data.isNew ? "New" : "Edit"}: {data.wholesaler.name || "Supplier"}</title
  >
</svelte:head>

<div class="page-container">
  <div class="page-header">
    <h1>{data.isNew ? "New Supplier" : `Edit: ${data.wholesaler.name}`}</h1>
    <a href="/suppliers" class="secondary-button">← Back to List</a>
  </div>

  <!-- Master data form -->
  <form
    class="master-data-form"
    method="POST"
    action={data.isNew ? "?/create" : "?/update"}
    use:enhance={() => {
      return async ({ result }) => {
        if (result.type === "failure") {
          addNotification(
            (result.data as any)?.error ?? "Save failed.",
            "error",
            5000,
          );
          return;
        }
        if (result.type === "success") {
          const d = result.data as any;
          if (d?.created?.wholesaler_id) {
            addNotification("Supplier created successfully.", "success");
            await goto(`/suppliers/${d.created.wholesaler_id}`);
          } else {
            addNotification(
              d?.success ?? "Supplier updated successfully.",
              "success",
            );
          }
        }
      };
    }}
  >
    <h3>Master Data</h3>
    <div>
      <label for="name">Name</label>
      <input
        id="name"
        name="name"
        type="text"
        bind:value={data.wholesaler.name}
        required
      />
    </div>
    <div>
      <label for="region">Region</label>
      <input
        id="region"
        name="region"
        type="text"
        bind:value={data.wholesaler.region}
      />
    </div>
    <div>
      <label for="website">Website</label>
      <input
        id="website"
        name="website"
        type="url"
        bind:value={data.wholesaler.website}
      />
    </div>
    <div class="checkbox-group">
      <input
        id="dropship"
        name="dropship"
        type="checkbox"
        bind:checked={data.wholesaler.dropship}
      />
      <label for="dropship">Offers Dropshipping</label>
    </div>
    <button class="primary-button" type="submit">
      {data.isNew ? "Create Supplier" : "Save Changes"}
    </button>
  </form>

  {#if !data.isNew}
    <hr class="section-divider" />

    <div class="category-section">
      <h2>Categories</h2>

      <!-- Add category -->
      <form
        class="add-category-form"
        method="POST"
        action="?/assignCategory"
        use:enhance={(initial) => {
          return async ({ result }) => {
            if (result.type === "failure") {
              addNotification(
                (result.data as any)?.error ?? "Failed to add category",
                "error",
                5000,
              );
              return;
            }
            if (result.type === "success") {
              const added = (result.data as any)?.addedCategory;
              if (added) {
                applyAddedCategory(added);
                selectedCategoryId = "";
                addNotification("Category added", "success");
              }
            }
          };
        }}
      >
        <select name="categoryId" required bind:value={selectedCategoryId}>
          <option value="" disabled>Select category…</option>
          {#each availableCategories as category}
            <option value={category.category_id}>{category.name}</option>
          {/each}
        </select>
        <button type="submit">Add</button>
      </form>

      <!-- ✅ NEU: Wiederverwendbares Datagrid statt manueller Tabelle -->
      {#if assignedCategories.length > 0}
        <Datagrid
          rows={assignedCategories}
          columns={categoryColumns}
          onsort={() => {
            /* Lokale Sortierung wird vom Datagrid gehandhabt, keine Aktion nötig */
          }}
          ondelete={(event) => handleRemoveCategory(event.row)}
          showDelete={true}
          deleteDisabled={(row) => deletingCategoryIds.has(row.category_id)}
          deleteTooltip={(row) =>
            deletingCategoryIds.has(row.category_id)
              ? "Removing..."
              : `Remove category "${row.name}"`}
          height="auto"
        />
      {:else}
        <p class="no-categories-message">No categories assigned yet.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Page container */
  .page-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 1.5rem;
  }

  /* Divider between sections */
  .section-divider {
    margin: 2rem 0;
    border: none;
    border-top: 1px solid #e2e8f0;
  }

  /* Master data form */
  .master-data-form {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr 1fr;
    background: #f8fafc;
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .master-data-form label {
    font-weight: 500;
    margin-bottom: 0.25rem;
    display: block;
  }

  .master-data-form input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 1rem;
  }

  .master-data-form button {
    grid-column: span 2;
    justify-self: start;
  }

  .primary-button {
    padding: 0.5rem 1.25rem;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .primary-button:hover {
    background-color: #2563eb;
  }

  /* .secondary-button {
   
  } */

  /* Category section */
  .category-section {
    padding: 1.5rem;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    background-color: #f8fafc;
  }

  .category-section h2 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.75rem;
  }

  /* Add-category form */
  .add-category-form {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 2rem;
  }

  .add-category-form select {
    flex-grow: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 1rem;
    background-color: white;
  }

  .add-category-form button {
    padding: 0.5rem 1rem;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .add-category-form button:hover {
    background-color: #2563eb;
  }

  .no-categories-message {
    font-style: italic;
    color: #64748b;
  }
</style>
