<script lang="ts">
  import { supplierEnhance } from '$lib/utils/formEnhance';

  // Props - API der Komponente
  export let supplier: {
    wholesaler_id?: number;
    name: string;
    region: string;
    status: 'active' | 'inactive';
    dropship: boolean;
    website?: string;
  };
  
  export let isEditing: boolean = false;
  export let showHeader: boolean = true;
  export let showActions: boolean = true;
  
  // Hybrid Mode Support
  export let mode: 'client' | 'server' = 'client';
  export let action: string = '';
  export let enhance: any = undefined;
  export let redirectAfterCreate: string = '/suppliers/{id}';

  // Events - Svelte 5 Style (für client mode)
  export let onsubmit: ((event: { supplier: typeof supplier }) => void) | undefined = undefined;
  export let oncancel: (() => void) | undefined = undefined;

  // Lokale Kopie der Daten für Bearbeitung
  let formData = { ...supplier };

  // Reaktive Updates when supplier prop changes
  $: formData = { ...supplier };

  // Default enhance function (wird verwendet wenn keine custom enhance übergeben wird)
  function defaultEnhance() {
    return supplierEnhance(redirectAfterCreate);
  }

  // Final enhance function - custom oder default
  $: finalEnhance = enhance || defaultEnhance();

  // Form Handlers (für client mode)
  function handleSubmit(event: Event) {
    event.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    // Event mit den Form-Daten feuern
    onsubmit?.({ supplier: formData });
  }

  function handleCancel() {
    // Reset form to original data
    formData = { ...supplier };
    oncancel?.();
  }

  // Computed properties
  $: isValid = formData.name.trim().length > 0;
  $: formTitle = isEditing ? 'Edit Supplier' : 'Create New Supplier';
  $: submitButtonText = isEditing ? 'Update Supplier' : 'Create Supplier';
</script>

{#if showHeader}
  <div class="form-header">
    <h3>{formTitle}</h3>
    {#if showActions}
      <button class="close-button" type="button" on:click={handleCancel}>×</button>
    {/if}
  </div>
{/if}

<!-- Hybrid Form: Server Mode mit SvelteKit Actions oder Client Mode mit Events -->
{#if mode === 'server'}
  <form class="supplier-form" method="POST" {action} use:enhance={finalEnhance}>
    <!-- Hidden fields für bessere Server-Kompatibilität -->
    {#if supplier.wholesaler_id}
      <input type="hidden" name="wholesaler_id" value={supplier.wholesaler_id} />
    {/if}
    
    <div class="form-grid">
      <!-- Name -->
      <div class="form-group">
        <label for="supplier_name">Name *</label>
        <input 
          id="supplier_name" 
          name="name"
          bind:value={formData.name} 
          type="text" 
          required 
          placeholder="Enter supplier name..."
          class:error={!formData.name.trim()}
        />
      </div>

      <!-- Region -->
      <div class="form-group">
        <label for="supplier_region">Region</label>
        <input 
          id="supplier_region" 
          name="region"
          bind:value={formData.region} 
          type="text" 
          placeholder="e.g., USA, Europe..."
        />
      </div>

      <!-- Website -->
      <div class="form-group">
        <label for="supplier_website">Website</label>
        <input 
          id="supplier_website" 
          name="website"
          bind:value={formData.website} 
          type="url" 
          placeholder="https://..."
        />
      </div>

      <!-- Status -->
      <div class="form-group">
        <label for="supplier_status">Status</label>
        <select id="supplier_status" name="status" bind:value={formData.status}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <!-- Dropshipping -->
      <div class="form-group checkbox-group">
        <input 
          id="supplier_dropship" 
          name="dropship"
          bind:checked={formData.dropship} 
          type="checkbox" 
        />
        <label for="supplier_dropship">Offers Dropshipping</label>
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
  <form class="supplier-form" on:submit={handleSubmit}>
    <div class="form-grid">
      <!-- Name -->
      <div class="form-group">
        <label for="supplier_name">Name *</label>
        <input 
          id="supplier_name" 
          bind:value={formData.name} 
          type="text" 
          required 
          placeholder="Enter supplier name..."
          class:error={!formData.name.trim()}
        />
      </div>

      <!-- Region -->
      <div class="form-group">
        <label for="supplier_region">Region</label>
        <input 
          id="supplier_region" 
          bind:value={formData.region} 
          type="text" 
          placeholder="e.g., USA, Europe..."
        />
      </div>

      <!-- Website -->
      <div class="form-group">
        <label for="supplier_website">Website</label>
        <input 
          id="supplier_website" 
          bind:value={formData.website} 
          type="url" 
          placeholder="https://..."
        />
      </div>

      <!-- Status -->
      <div class="form-group">
        <label for="supplier_status">Status</label>
        <select id="supplier_status" bind:value={formData.status}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <!-- Dropshipping -->
      <div class="form-group checkbox-group">
        <input 
          id="supplier_dropship" 
          bind:checked={formData.dropship} 
          type="checkbox" 
        />
        <label for="supplier_dropship">Offers Dropshipping</label>
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

  .supplier-form {
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

  .form-group.checkbox-group {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    grid-column: span 2;
  }

  .form-group.checkbox-group input {
    width: auto;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--color-heading, #0f172a);
    font-size: 0.875rem;
  }

  .form-group input,
  .form-group select {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    background: white;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary, #4f46e5);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .form-group input.error {
    border-color: #dc3545;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);
  }

  .form-group input::placeholder {
    color: var(--color-muted, #64748b);
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

  /* Responsive */
  @media (max-width: 768px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-group.checkbox-group {
      grid-column: span 1;
    }

    .supplier-form {
      padding: 1rem;
    }

    .form-header {
      padding: 1rem;
    }
  }
</style>