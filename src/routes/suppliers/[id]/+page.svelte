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

  // Lokaler Zustand für Categories
  let assignedCategories = [...data.assignedCategories];
  let availableCategories = [...data.availableCategories];
  let selectedCategoryId = "";
  let deletingCategoryIds = new Set<number>();

  // Beispiel-Daten für weitere Grids (diese würden aus data kommen)
  let offerings = [
    { id: 1, product_name: "Widget A", price: 29.99, status: "active" },
    { id: 2, product_name: "Gadget B", price: 45.50, status: "inactive" }
  ];
  
  let attributes = [
    { id: 1, name: "Color", value: "Blue", category: "Physical" },
    { id: 2, name: "Weight", value: "2.5kg", category: "Physical" }
  ];

  // Spaltendefinitionen für verschiedene Grids
  const categoryColumns: ColumnDefinition[] = [
    { key: "name", title: "Category", sortable: true, width: "3fr" },
    { key: "offering_count", title: "Offerings", sortable: true, type: "number", width: "1fr" },
    { key: "comment", title: "Comment", sortable: false, width: "2fr" },
  ];

  const offeringColumns: ColumnDefinition[] = [
    { key: "product_name", title: "Product", sortable: true, width: "3fr" },
    { key: "price", title: "Price", sortable: true, type: "number", width: "1fr" },
    { key: "status", title: "Status", sortable: true, width: "1fr" },
  ];

  const attributeColumns: ColumnDefinition[] = [
    { key: "name", title: "Attribute", sortable: true, width: "2fr" },
    { key: "value", title: "Value", sortable: false, width: "2fr" },
    { key: "category", title: "Category", sortable: true, width: "1fr" },
  ];

  // Layout-Steuerung
  let activeLayout: 'grid' | 'tabs' = 'grid';

  // Category-Funktionen (gekürzt)
  function applyAddedCategory(added: any) {
    assignedCategories = [...assignedCategories, { ...added, offering_count: added.offering_count ?? 0 }]
      .sort((a, b) => a.name.localeCompare(b.name));
    availableCategories = availableCategories.filter(c => c.category_id !== added.category_id);
  }

  function applyRemovedCategory(id: number) {
    const removed = assignedCategories.find(c => c.category_id === id);
    assignedCategories = assignedCategories.filter(c => c.category_id !== id);
    if (removed) {
      availableCategories = [...availableCategories, { category_id: removed.category_id, name: removed.name }]
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  async function handleRemoveCategory(category: any, cascade = false) {
    // Implementierung wie im Original...
    console.log("Remove category", category);
  }
</script>

<svelte:head>
  <title>{data.isNew ? "New" : "Edit"}: {data.wholesaler.name || "Supplier"}</title>
</svelte:head>

<div class="page-container">
  <!-- Header bleibt gleich -->
  <div class="page-header">
    <h1>{data.isNew ? "New Supplier" : `Edit: ${data.wholesaler.name}`}</h1>
    <div class="header-actions">
      <div class="layout-toggle">
        <button 
          class="toggle-btn" 
          class:active={activeLayout === 'grid'}
          on:click={() => activeLayout = 'grid'}
        >
          Grid View
        </button>
        <button 
          class="toggle-btn" 
          class:active={activeLayout === 'tabs'}
          on:click={() => activeLayout = 'tabs'}
        >
          Tab View
        </button>
      </div>
      <a href="/suppliers" class="secondary-button">← Back to List</a>
    </div>
  </div>

  <!-- Master Data Form (bleibt oben, volle Breite) -->
  <form
    class="master-data-form"
    method="POST"
    action={data.isNew ? "?/create" : "?/update"}
    use:enhance={() => {
      return async ({ result }) => {
        if (result.type === "failure") {
          addNotification((result.data as any)?.error ?? "Save failed.", "error", 5000);
          return;
        }
        if (result.type === "success") {
          const d = result.data as any;
          if (d?.created?.wholesaler_id) {
            addNotification("Supplier created successfully.", "success");
            await goto(`/suppliers/${d.created.wholesaler_id}`);
          } else {
            addNotification(d?.success ?? "Supplier updated successfully.", "success");
          }
        }
      };
    }}
  >
    <h3>Master Data</h3>
    <div>
      <label for="name">Name</label>
      <input id="name" name="name" type="text" bind:value={data.wholesaler.name} required />
    </div>
    <div>
      <label for="region">Region</label>
      <input id="region" name="region" type="text" bind:value={data.wholesaler.region} />
    </div>
    <div>
      <label for="website">Website</label>
      <input id="website" name="website" type="url" bind:value={data.wholesaler.website} />
    </div>
    <div class="checkbox-group">
      <input id="dropship" name="dropship" type="checkbox" bind:checked={data.wholesaler.dropship} />
      <label for="dropship">Offers Dropshipping</label>
    </div>
    <button class="primary-button" type="submit">
      {data.isNew ? "Create Supplier" : "Save Changes"}
    </button>
  </form>

  {#if !data.isNew}
    <hr class="section-divider" />

    <!-- Grid Layout -->
    {#if activeLayout === 'grid'}
      <div class="content-grid">
        <!-- Categories Bereich -->
        <div class="grid-section categories-section">
          <div class="section-header">
            <h2>Categories</h2>
            <span class="section-count">{assignedCategories.length}</span>
          </div>
          
          <form
            class="add-form"
            method="POST"
            action="?/assignCategory"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "failure") {
                  addNotification((result.data as any)?.error ?? "Failed to add category", "error", 5000);
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

          <div class="datagrid-container">
            {#if assignedCategories.length > 0}
              <Datagrid
                rows={assignedCategories}
                columns={categoryColumns}
                onsort={() => {}}
                ondelete={(event) => handleRemoveCategory(event.row)}
                showDelete={true}
                deleteDisabled={(row) => deletingCategoryIds.has(row.category_id)}
                deleteTooltip={(row) => deletingCategoryIds.has(row.category_id) ? "Removing..." : `Remove category "${row.name}"`}
                height="300px"
              />
            {:else}
              <p class="empty-message">No categories assigned yet.</p>
            {/if}
          </div>
        </div>

        <!-- Offerings Bereich -->
        <div class="grid-section offerings-section">
          <div class="section-header">
            <h2>Product Offerings</h2>
            <span class="section-count">{offerings.length}</span>
          </div>

          <form class="add-form">
            <input type="text" placeholder="Product name..." />
            <input type="number" placeholder="Price..." step="0.01" />
            <select>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            <button type="submit">Add Offering</button>
          </form>

          <div class="datagrid-container">
            <Datagrid
              rows={offerings}
              columns={offeringColumns}
              onsort={() => {}}
              ondelete={() => {}}
              showDelete={true}
              height="300px"
            />
          </div>
        </div>

        <!-- Attributes Bereich -->
        <div class="grid-section attributes-section">
          <div class="section-header">
            <h2>Attributes</h2>
            <span class="section-count">{attributes.length}</span>
          </div>

          <form class="add-form">
            <input type="text" placeholder="Attribute name..." />
            <input type="text" placeholder="Value..." />
            <select>
              <option>Physical</option>
              <option>Digital</option>
              <option>Logistics</option>
            </select>
            <button type="submit">Add Attribute</button>
          </form>

          <div class="datagrid-container">
            <Datagrid
              rows={attributes}
              columns={attributeColumns}
              onsort={() => {}}
              ondelete={() => {}}
              showDelete={true}
              height="300px"
            />
          </div>
        </div>

        <!-- Platzhalter für weitere Bereiche -->
        <div class="grid-section links-section">
          <div class="section-header">
            <h2>Links & Documents</h2>
            <span class="section-count">0</span>
          </div>
          <p class="empty-message">No links configured yet.</p>
        </div>
      </div>

    <!-- Tab Layout Alternative -->
    {:else if activeLayout === 'tabs'}
      <div class="tab-container">
        <div class="tab-nav">
          <button class="tab-button active">Categories</button>
          <button class="tab-button">Offerings</button>
          <button class="tab-button">Attributes</button>
          <button class="tab-button">Links</button>
        </div>
        
        <div class="tab-content">
          <!-- Hier würde der aktuelle Tab-Inhalt angezeigt -->
          <div class="full-width-section">
            <h2>Categories</h2>
            <!-- Categories-Inhalt in voller Breite -->
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page-container {
    max-width: 1400px; /* Vergrößert für mehr Platz */
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .layout-toggle {
    display: flex;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .toggle-btn {
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-btn.active {
    background: var(--color-primary);
    color: white;
  }

  /* Master Data Form - bleibt wie vorher */
  .master-data-form {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr 1fr;
    background: #f8fafc;
    padding: 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .master-data-form h3 {
    grid-column: span 2;
    margin: 0 0 1rem 0;
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

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .checkbox-group input {
    width: auto;
  }

  /* Grid Layout */
  .content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    min-height: 600px;
  }

  /* Responsive: Bei kleineren Bildschirmen einspaltig */
  @media (max-width: 1200px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  .grid-section {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .section-count {
    background: var(--color-primary);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .add-form input,
  .add-form select {
    flex: 1;
    min-width: 120px;
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .add-form button {
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .add-form button:hover {
    background: #4338ca;
  }

  .datagrid-container {
    flex: 1;
    min-height: 0; /* Wichtig für Flex-Shrinking */
  }

  .empty-message {
    font-style: italic;
    color: var(--color-muted);
    text-align: center;
    padding: 2rem;
  }

  /* Tab Layout */
  .tab-container {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .tab-nav {
    display: flex;
    background: #f8fafc;
    border-bottom: 1px solid var(--color-border);
  }

  .tab-button {
    padding: 1rem 1.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
  }

  .tab-button.active {
    border-bottom-color: var(--color-primary);
    color: var(--color-primary);
  }

  .tab-content {
    padding: 2rem;
  }

  .full-width-section {
    width: 100%;
  }

  /* Button Styles */
  .primary-button {
    padding: 0.5rem 1.25rem;
    background-color: var(--color-primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .primary-button:hover {
    background-color: #4338ca;
  }

  .secondary-button {
    padding: 0.5rem 1rem;
    background: var(--color-background);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .secondary-button:hover {
    background: #f8fafc;
    text-decoration: none;
  }

  .section-divider {
    margin: 2rem 0;
    border: none;
    border-top: 1px solid var(--color-border);
  }
</style>