<script lang="ts">
  import { addNotification } from '$lib/stores/notifications';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  // Reactive logic for showing snackbar notifications based on form action results
  $: {
    if (form?.success) {
      addNotification(form.success, 'success');
    } else if (form?.error) {
      addNotification(form.error, 'error', 5000);
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

  <!-- 
    The form's `action` attribute is dynamic. It posts to the appropriate
    server action based on whether we are in "create" or "edit" mode.
  -->
  <form class="master-data-form" method="POST" action={data.isNew ? '?/create' : '?/update'}>
    <h3>Master Data</h3>
    {#if form?.error && (form.action === 'update' || !form.action)}
      <p class="form-error">{form.error}</p>
    {/if}
    
    <div>
      <label for="name">Name</label>
      <input id="name" name="name" type="text" bind:value={data.wholesaler.name} required>
    </div>
    
    <div>
      <label for="region">Region</label>
      <input id="region" name="region" type="text" bind:value={data.wholesaler.region}>
    </div>
    
    <div>
      <label for="website">Website</label>
      <input id="website" name="website" type="url" bind:value={data.wholesaler.website}>
    </div>
    
    <div class="checkbox-group">
      <input id="dropship" name="dropship" type="checkbox" bind:checked={data.wholesaler.dropship}>
      <label for="dropship">Offers Dropshipping</label>
    </div>
    
    <button class="primary-button" type="submit">
      {data.isNew ? 'Create Supplier' : 'Save Changes'}
    </button>
  </form>

  <!--
    The category management section is hidden when creating a new supplier,
    as categories can only be assigned to an existing record.
  -->
  {#if !data.isNew}
    <hr class="section-divider">
    <div class="category-section">
      <h2>Categories</h2>

      <form class="add-category-form" method="POST" action="?/assignCategory">
        <select name="categoryId" required>
          <option value="" disabled selected>Add a category...</option>
          {#each data.availableCategories as category}
            <option value={category.category_id}>{category.name}</option>
          {/each}
        </select>
        <button type="submit">Add</button>
      </form>

      {#if data.assignedCategories.length > 0}
        <table class="assigned-categories-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Comment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {#each data.assignedCategories as category}
              <tr>
                <td class="category-name">{category.name} ({category.offering_count} offerings)</td>
                <td class="category-comment">{category.comment || '-'}</td>
                <td>
                  {#if category.offering_count === 0}
                    <form method="POST" action="?/removeCategory">
                      <input type="hidden" name="categoryId" value={category.category_id}>
                      <button class="remove-button" type="submit" aria-label="Remove {category.name}">Remove</button>
                    </form>
                  {:else}
                    <button 
                      class="disabled-button" 
                      disabled 
                      title="Cannot remove: Offerings still exist for this category. Please remove them first."
                    >
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
  /* --- General Layout & Forms --- */
  .page-container {
    max-width: 900px;
    margin: 2rem auto;
    padding: 0 2rem 4rem 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .page-header h1 {
    margin-bottom: 0;
  }

  .master-data-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    background-color: #fdfdff;
  }
  
  .master-data-form h3 {
    margin-top: 0;
    margin-bottom: 0.5rem;
  }
  
  .master-data-form div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .checkbox-group {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  label {
    font-weight: 500;
    color: #334155;
  }

  input[type="text"],
  input[type="url"] {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 1rem;
  }

  .primary-button,
  .secondary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1.25rem;
    border-radius: 6px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .primary-button {
    align-self: flex-start;
    background-color: var(--color-primary, #4f46e5);
    color: white;
  }

  .primary-button:hover {
    background-color: #4338ca;
  }

  .secondary-button {
    background-color: #f1f5f9;
    color: #334155;
    border-color: #e2e8f0;
  }

  .secondary-button:hover {
    background-color: #e2e8f0;
    border-color: #cbd5e1;
  }

  .section-divider {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 2.5rem 0;
  }

  .form-error {
    color: #dc3545;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    padding: 0.5rem 1rem;
    border-radius: 6px;
  }

  /* --- Category Management Section --- */
  .category-section {
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background-color: #f8fafc;
  }

  .category-section h2 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.75rem;
  }

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
    background-color: #3b82f6; /* Blue */
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

  .assigned-categories-table {
    width: 100%;
    border-collapse: collapse;
  }

  .assigned-categories-table th,
  .assigned-categories-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  .assigned-categories-table th {
    background-color: #f1f5f9;
    font-weight: 600;
    color: #475569;
  }
  
  .assigned-categories-table td {
    vertical-align: middle;
  }

  .assigned-categories-table th:last-child,
  .assigned-categories-table td:last-child {
    text-align: right;
  }

  .category-name {
    font-weight: 500;
    color: #1e293b;
  }

  .category-comment {
    font-style: italic;
    color: #64748b;
    font-size: 0.9rem;
  }

  .assigned-categories-table form {
    margin: 0;
  }

  .remove-button,
  .disabled-button {
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  
  .remove-button {
    background-color: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
    cursor: pointer;
  }
  
  .remove-button:hover {
    background-color: #fecaca;
    color: #991b1b;
  }
  
  .disabled-button {
    background-color: #e2e8f0;
    color: #64748b;
    border: 1px solid #cbd5e1;
    cursor: not-allowed;
  }

  .no-categories-message {
      margin-top: 1rem;
      padding: 1rem;
      background-color: #f1f5f9;
      border-radius: 6px;
      color: #475569;
      text-align: center;
  }
</style>