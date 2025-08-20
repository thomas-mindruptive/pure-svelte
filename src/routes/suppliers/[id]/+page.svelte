<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { addNotification } from '$lib/stores/notifications';
  import type { PageData } from './$types';

  export let data: PageData;

  // Local arrays so we can update the UI without full reload
  let assignedCategories = [...data.assignedCategories];
  let availableCategories = [...data.availableCategories];

  // Controlled select for "Add Category"
  let selectedCategoryId = '';

  function applyAddedCategory(added: { category_id: number; name: string; offering_count?: number; comment?: string; link?: string }) {
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
</script>

<svelte:head>
  <title>{data.isNew ? 'New' : 'Edit'}: {data.wholesaler.name || 'Supplier'}</title>
</svelte:head>

<div class="page-container">
  <div class="page-header">
    <h1>{data.isNew ? 'New Supplier' : `Edit: ${data.wholesaler.name}`}</h1>
    <a href="/suppliers" class="secondary-button">← Back to List</a>
  </div>

  <!-- Master data -->
  <form
    class="master-data-form"
    method="POST"
    action={data.isNew ? '?/create' : '?/update'}
    use:enhance={() => {
      return async ({ result }) => {
        if (result.type === 'failure') {
          addNotification((result.data as any)?.error ?? 'Save failed.', 'error', 5000);
          return;
        }
        if (result.type === 'success') {
          const d = result.data as any;
          if (d?.created?.wholesaler_id) {
            // After CREATE: navigate to the new detail page (SPA), no server redirect needed
            addNotification('Supplier created successfully.', 'success');
            await goto(`/suppliers/${d.created.wholesaler_id}`);
          } else {
            addNotification(d?.success ?? 'Supplier updated successfully.', 'success');
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
      {data.isNew ? 'Create Supplier' : 'Save Changes'}
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
            if (result.type === 'failure') {
              addNotification((result.data as any)?.error ?? 'Failed to add category', 'error', 5000);
              return;
            }
            if (result.type === 'success') {
              const added = (result.data as any)?.addedCategory;
              if (added) {
                applyAddedCategory(added);
                selectedCategoryId = '';
                addNotification('Category added', 'success');
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

      {#if assignedCategories.length > 0}
        <table class="assigned-categories-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Comment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {#each assignedCategories as category (category.category_id)}
              <tr>
                <td class="category-name">{category.name} ({category.offering_count} offerings)</td>
                <td class="category-comment">{category.comment || '-'}</td>
                <td>
                  {#if category.offering_count === 0}
                    <form
                      method="POST"
                      action="?/removeCategory"
                      use:enhance={() => {
                        return async ({ result }) => {
                          if (result.type === 'failure') {
                            addNotification((result.data as any)?.error ?? 'Failed to remove category', 'error', 5000);
                            return;
                          }
                          if (result.type === 'success') {
                            const id = Number((result.data as any)?.removedCategoryId);
                            applyRemovedCategory(id);
                            addNotification('Category removed', 'success');
                          }
                        };
                      }}
                    >
                      <input type="hidden" name="categoryId" value={category.category_id} />
                      <button class="remove-button" type="submit" aria-label={`Remove ${category.name}`}>Remove</button>
                    </form>
                  {:else}
                    <button class="disabled-button" disabled title="Cannot remove: Offerings still exist">
                      Remove
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
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
    padding: 0.5rem 1.25rem;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .master-data-form button:hover {
    background-color: #2563eb;
  }

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

  /* Assigned categories table */
  .assigned-categories-table {
    width: 100%;
    border-collapse: collapse;
  }

  .assigned-categories-table th,
  .assigned-categories-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
    text-align: left;
  }

  .assigned-categories-table th {
    background-color: #f1f5f9;
    font-weight: 600;
  }

  .remove-button {
    padding: 0.25rem 0.75rem;
    background-color: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .remove-button:hover {
    background-color: #dc2626;
  }

  .disabled-button {
    padding: 0.25rem 0.75rem;
    background-color: #cbd5e1;
    color: #475569;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: not-allowed;
  }

  /* No categories message */
  .no-categories-message  {
    font-style: italic;
    color: #64748b;
  }
</style>
