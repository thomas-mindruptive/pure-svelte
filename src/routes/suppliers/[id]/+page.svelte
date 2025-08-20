<script lang="ts">
  import { addNotification } from '$lib/stores/notifications';
  // ===================================================================
  // THE FIX IS HERE: Import `ActionData` and use it for the `form` prop.
  // ===================================================================
  import type { PageData, ActionData } from './$types';

  // The `data` prop gets the type from the `load` function.
  export let data: PageData;
  
  // The `form` prop gets the type from the `actions` object.
  export let form: ActionData;

  // Reactive statement to show snackbar notifications
  // TypeScript is now happy because it knows `form` can have `success` and `error`.
  $: {
    if (form?.success) {
      addNotification(form.success, 'success');
    } else if (form?.error) {
      addNotification(form.error, 'error', 5000);
    }
  }
</script>

<svelte:head>
  <title>Edit: {data.wholesaler.name}</title>
</svelte:head>

<div class="page-container">
  <h1>Edit: {data.wholesaler.name}</h1>

  <!-- Master Data Form -->
  <form class="master-data-form" method="POST" action="?/updateProperties">
    <h3>Master Data</h3>
    <!-- TypeScript is now happy with these checks -->
    {#if form?.action === 'updateProperties' && form?.error}
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
    
    <button class="primary-button" type="submit">Save Master Data</button>
  </form>

  <hr class="section-divider">

  <!-- Category Management Section -->
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
</div>


<!-- ======================================================= -->
<!-- STYLES                                                  -->
<!-- ======================================================= -->
<style>
  /* --- General Layout & Forms --- */
  .page-container {
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem;
  }

  .master-data-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
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

  .primary-button {
    align-self: flex-start;
    padding: 0.6rem 1.5rem;
    background-color: #4f46e5; /* Indigo */
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

  /* ============================================= */
  /*          CATEGORY MANAGEMENT SECTION          */
  /* ============================================= */
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