<script lang="ts">
  import { categoryEnhance } from '$lib/utils/formEnhance';
  import { log } from '$lib/utils/logger';

  // Props - Component API
  export let category: {
    category_id?: number;
    wholesaler_id?: number;
    name: string;
    description: string;
    comment: string;
    link: string;
  };
  
  export let isEditing: boolean = false;
  export let showHeader: boolean = true;
  export let showActions: boolean = true;
  
  // Hybrid Mode Support
  export let mode: 'client' | 'server' = 'client';
  export let action: string = '';
  export let enhance: any = undefined;
  export let redirectAfterCreate: string = '/supplierbrowser?level=categories&category={id}';

  // Events - Svelte 5 Style (for client mode)
  export let onsubmit: ((event: { category: typeof category }) => void) | undefined = undefined;
  export let oncancel: (() => void) | undefined = undefined;

  // Local copy of data for editing
  let formData = { ...category };

  // Reactive updates when category prop changes
  $: formData = { ...category };

  // Default enhance function (used when no custom enhance is passed)
  function defaultEnhance() {
    return categoryEnhance(redirectAfterCreate);
  }

  // Final enhance function - custom or default
  $: finalEnhance = enhance || defaultEnhance();

  // Form Handlers (for client mode)
  function handleSubmit(event: Event) {
    event.preventDefault();
    
    // Validation - FIXED: Check for undefined/null before trim()
    if (!formData.name || !formData.name.trim()) {
      log.warn("Category form validation failed", { error: "Name is required" });
      alert('Category name is required');
      return;
    }

    log.info("Category form submitted (client mode)", { 
      categoryId: formData.category_id,
      name: formData.name,
      isEditing 
    });

    // Fire event with form data
    onsubmit?.({ category: formData });
  }

  function handleCancel() {
    log.info("Category form cancelled");
    
    // Reset form to original data
    formData = { ...category };
    oncancel?.();
  }

  // URL validation helper
  function isValidUrl(url: string): boolean {
    if (!url || !url.trim()) return true; // Empty URL is valid (optional field)
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Computed properties - FIXED: Check for undefined/null before trim()
  $: isValid = formData.name && formData.name.trim().length > 0 && isValidUrl(formData.link);
  $: formTitle = isEditing ? 'Edit Category' : 'Create New Category';
  $: submitButtonText = isEditing ? 'Update Category' : 'Create Category';

  // Log form state changes
  $: if (formData) {
    log.debug("Category form data updated", { 
      name: formData.name,
      hasDescription: !!formData.description,
      hasLink: !!formData.link,
      isValid 
    });
  }
</script>

{#if showHeader}
  <div class="form-header">
    <h3>{formTitle}</h3>
    {#if showActions}
      <button class="close-button" type="button" on:click={handleCancel}>×</button>
    {/if}
  </div>
{/if}

<!-- Hybrid Form: Server Mode with SvelteKit Actions or Client Mode with Events -->
{#if mode === 'server'}
  <form class="category-form" method="POST" {action} use:enhance={finalEnhance}>
    <!-- Hidden fields for better server compatibility -->
    {#if category.category_id}
      <input type="hidden" name="category_id" value={category.category_id} />
    {/if}
    {#if category.wholesaler_id}
      <input type="hidden" name="wholesaler_id" value={category.wholesaler_id} />
    {/if}
    
    <div class="form-grid">
      <!-- Category Name -->
      <div class="form-group span-2">
        <label for="category_name">Category Name *</label>
        <input 
          id="category_name" 
          name="name"
          bind:value={formData.name} 
          type="text" 
          required 
          placeholder="Enter category name..."
          class:error={!formData.name || !formData.name.trim()}
        />
      </div>

      <!-- Description -->
      <div class="form-group span-4">
        <label for="category_description">Description</label>
        <textarea 
          id="category_description" 
          name="description"
          bind:value={formData.description} 
          placeholder="Describe this category..."
          rows="3"
        ></textarea>
      </div>

      <!-- Comment -->
      <div class="form-group span-2">
        <label for="category_comment">Internal Comment</label>
        <input 
          id="category_comment" 
          name="comment"
          bind:value={formData.comment} 
          type="text" 
          placeholder="Internal notes..."
        />
      </div>

      <!-- External Link -->
      <div class="form-group span-2">
        <label for="category_link">External Link</label>
        <input 
          id="category_link" 
          name="link"
          bind:value={formData.link} 
          type="url" 
          placeholder="https://..."
          class:error={formData.link && !isValidUrl(formData.link)}
        />
        {#if formData.link && !isValidUrl(formData.link)}
          <span class="error-text">Please enter a valid URL</span>
        {/if}
      </div>
    </div>

    {#if showActions}
      <div class="form-actions">
        <button type="button" class="secondary-button" on:click={handleCancel}>
          Cancel
        </button>
        <button type="submit" class="primary-button" disabled={!isValid}>
          {submitButtonText}
        </button>
      </div>
    {/if}
  </form>

{:else}
  <!-- Client Mode -->
  <form class="category-form" on:submit={handleSubmit}>
    <div class="form-grid">
      <!-- Category Name -->
      <div class="form-group span-2">
        <label for="category_name">Category Name *</label>
        <input 
          id="category_name" 
          bind:value={formData.name} 
          type="text" 
          required 
          placeholder="Enter category name..."
          class:error={!formData.name || !formData.name.trim()}
        />
      </div>

      <!-- Description -->
      <div class="form-group span-4">
        <label for="category_description">Description</label>
        <textarea 
          id="category_description" 
          bind:value={formData.description} 
          placeholder="Describe this category..."
          rows="3"
        ></textarea>
      </div>

      <!-- Comment -->
      <div class="form-group span-2">
        <label for="category_comment">Internal Comment</label>
        <input 
          id="category_comment" 
          bind:value={formData.comment} 
          type="text" 
          placeholder="Internal notes..."
        />
      </div>

      <!-- External Link -->
      <div class="form-group span-2">
        <label for="category_link">External Link</label>
        <input 
          id="category_link" 
          bind:value={formData.link} 
          type="url" 
          placeholder="https://..."
          class:error={formData.link && !isValidUrl(formData.link)}
        />
        {#if formData.link && !isValidUrl(formData.link)}
          <span class="error-text">Please enter a valid URL</span>
        {/if}
      </div>
    </div>

    {#if showActions}
      <div class="form-actions">
        <button type="button" class="secondary-button" on:click={handleCancel}>
          Cancel
        </button>
        <button type="submit" class="primary-button" disabled={!isValid}>
          {submitButtonText}
        </button>
      </div>
    {/if}
  </form>
{/if}

<style>
  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    background: white;
  }

  .form-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--color-heading, #0f172a);
  }

  .close-button {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--color-muted, #64748b);
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: #e2e8f0;
    color: var(--color-text, #1e293b);
  }

  .category-form {
    padding: 1.5rem 2rem;
    background: inherit;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .form-group.span-2 {
    grid-column: span 2;
  }

  .form-group.span-4 {
    grid-column: span 4;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--color-heading, #0f172a);
    font-size: 0.875rem;
  }

  .form-group input,
  .form-group textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    background: white;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary, #4f46e5);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .form-group input.error,
  .form-group textarea.error {
    border-color: #dc3545;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);
  }

  .form-group input::placeholder,
  .form-group textarea::placeholder {
    color: var(--color-muted, #64748b);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 4rem;
    line-height: 1.4;
  }

  .error-text {
    font-size: 0.75rem;
    color: #dc3545;
    margin-top: 0.25rem;
    font-weight: 500;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #e2e8f0);
  }

  /* Buttons */
  .primary-button {
    padding: 0.5rem 1.25rem;
    background-color: var(--color-primary, #4f46e5);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .primary-button:hover:not(:disabled) {
    background-color: #4338ca;
    transform: translateY(-1px);
  }

  .primary-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .secondary-button {
    padding: 0.5rem 1rem;
    background: var(--color-background, #fff);
    color: var(--color-text, #1e293b);
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .secondary-button:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-group.span-2,
    .form-group.span-4 {
      grid-column: span 1;
    }

    .category-form {
      padding: 1rem;
    }

    .form-header {
      padding: 1rem;
    }

    .form-actions {
      flex-direction: column;
    }
  }

  @media (max-width: 480px) {
    .form-actions {
      gap: 0.5rem;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>