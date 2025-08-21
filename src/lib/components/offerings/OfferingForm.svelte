<script lang="ts">
  import { offeringEnhance } from '$lib/utils/formEnhance';
  import { log } from '$lib/utils/logger';

  // Props - Component API (Updated to match DB schema)
  export let offering: {
    offering_id?: number;
    wholesaler_id?: number;
    category_id?: number;
    product_def_id: number;
    size: string;
    dimensions: string;
    price: number;
    currency: string;
    comment: string;
    created_at?: string;
  };
  
  // Available product definitions for dropdown (would come from API)
  export let productDefinitions: Array<{
    product_def_id: number;
    title: string;
    description?: string;
    category_id: number;
  }> = [];
  
  export let isEditing: boolean = false;
  export let showHeader: boolean = true;
  export let showActions: boolean = true;
  
  // Hybrid Mode Support
  export let mode: 'client' | 'server' = 'client';
  export let action: string = '';
  export let enhance: any = undefined;
  export let redirectAfterCreate: string = '/supplierbrowser?level=offerings&offering={id}';

  // Events - Svelte 5 Style (for client mode)
  export let onsubmit: ((event: { offering: typeof offering }) => void) | undefined = undefined;
  export let oncancel: (() => void) | undefined = undefined;

  // Local copy of data for editing
  let formData = { ...offering };

  // Reactive updates when offering prop changes
  $: formData = { ...offering };

  // Default enhance function (used when no custom enhance is passed)
  function defaultEnhance() {
    return offeringEnhance(redirectAfterCreate);
  }

  // Final enhance function - custom or default
  $: finalEnhance = enhance || defaultEnhance();

  // Form Handlers (for client mode)
  function handleSubmit(event: Event) {
    event.preventDefault();
    
    // Validation
    if (!formData.product_def_id) {
      log.warn("Offering form validation failed", { error: "Product definition is required" });
      alert('Please select a product definition');
      return;
    }

    if (formData.price < 0) {
      log.warn("Offering form validation failed", { error: "Price cannot be negative" });
      alert('Price cannot be negative');
      return;
    }

    // FIXED: Check for undefined/null before trim()
    if (!formData.currency || !formData.currency.trim()) {
      log.warn("Offering form validation failed", { error: "Currency is required" });
      alert('Currency is required');
      return;
    }

    log.info("Offering form submitted (client mode)", { 
      offeringId: formData.offering_id,
      productDefId: formData.product_def_id,
      price: formData.price,
      currency: formData.currency,
      isEditing 
    });

    // Fire event with form data
    onsubmit?.({ offering: formData });
  }

  function handleCancel() {
    log.info("Offering form cancelled");
    
    // Reset form to original data
    formData = { ...offering };
    oncancel?.();
  }

  // Validation helpers - FIXED: Check for undefined/null before trim()
  function isValidCurrency(currency: string): boolean {
    if (!currency) return false;
    // Basic currency code validation (3 letters)
    return /^[A-Z]{3}$/.test(currency.trim().toUpperCase());
  }

  function isValidDimensions(dimensions: string): boolean {
    if (!dimensions || !dimensions.trim()) return true; // Optional field
    // Basic dimension validation (numbers and common units)
    return /^[\d\s.,xÃ—*/-]+(mm|cm|m|inch|"|'|kg|g|lb)?$/i.test(dimensions.trim());
  }

  // Get selected product definition details
  $: selectedProduct = productDefinitions.find(p => p.product_def_id === formData.product_def_id);

  // Filter product definitions by category if available
  $: availableProducts = offering.category_id 
    ? productDefinitions.filter(p => p.category_id === offering.category_id)
    : productDefinitions;

  // Computed properties
  $: isValid = formData.product_def_id > 0 && 
               formData.price >= 0 && 
               isValidCurrency(formData.currency) &&
               isValidDimensions(formData.dimensions);
  $: formTitle = isEditing ? 'Edit Product Offering' : 'Create New Product Offering';
  $: submitButtonText = isEditing ? 'Update Offering' : 'Create Offering';

  // Currency options (common currencies)
  const currencyOptions = [
    { code: 'EUR', name: 'Euro (€)' },
    { code: 'USD', name: 'US Dollar ($)' },
    { code: 'GBP', name: 'British Pound (£)' },
    { code: 'CHF', name: 'Swiss Franc' },
    { code: 'JPY', name: 'Japanese Yen (¥)' },
    { code: 'CAD', name: 'Canadian Dollar' },
    { code: 'AUD', name: 'Australian Dollar' }
  ];

  // Size presets (common sizes)
  const sizePresets = [
    'XS', 'S', 'M', 'L', 'XL', 'XXL',
    '4mm', '6mm', '8mm', '10mm', '12mm',
    '20cm', '30cm', '40cm', '50cm'
  ];

  // Log form state changes
  $: if (formData) {
    log.debug("Offering form data updated", { 
      productDefId: formData.product_def_id,
      price: formData.price,
      currency: formData.currency,
      hasSize: !!formData.size,
      hasDimensions: !!formData.dimensions,
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
  <form class="offering-form" method="POST" {action} use:enhance={finalEnhance}>
    <!-- Hidden fields for better server compatibility -->
    {#if offering.offering_id}
      <input type="hidden" name="offering_id" value={offering.offering_id} />
    {/if}
    {#if offering.category_id}
      <input type="hidden" name="category_id" value={offering.category_id} />
    {/if}
    {#if offering.wholesaler_id}
      <input type="hidden" name="wholesaler_id" value={offering.wholesaler_id} />
    {/if}
    
    <div class="form-grid">
      <!-- Product Definition -->
      <div class="form-group span-3">
        <label for="product_def_id">Product Definition *</label>
        <select 
          id="product_def_id" 
          name="product_def_id"
          bind:value={formData.product_def_id} 
          required
          class:error={!formData.product_def_id}
        >
          <option value="" disabled>Select a product...</option>
          {#each availableProducts as product}
            <option value={product.product_def_id} title={product.description}>
              {product.title}
            </option>
          {/each}
        </select>
        {#if selectedProduct?.description}
          <span class="field-hint">{selectedProduct.description}</span>
        {/if}
      </div>

      <!-- Size -->
      <div class="form-group">
        <label for="offering_size">Size</label>
        <input 
          id="offering_size" 
          name="size"
          bind:value={formData.size} 
          type="text" 
          placeholder="S, M, 6mm..."
          list="size-presets"
        />
        <datalist id="size-presets">
          {#each sizePresets as size}
            <option value={size}></option>
          {/each}
        </datalist>
      </div>

      <!-- Dimensions -->
      <div class="form-group span-2">
        <label for="offering_dimensions">Dimensions</label>
        <input 
          id="offering_dimensions" 
          name="dimensions"
          bind:value={formData.dimensions} 
          type="text" 
          placeholder="20x30x40 cm, 6mm diameter..."
          class:error={formData.dimensions && !isValidDimensions(formData.dimensions)}
        />
        {#if formData.dimensions && !isValidDimensions(formData.dimensions)}
          <span class="error-text">Please use valid dimension format (e.g., "20x30 cm")</span>
        {/if}
      </div>

      <!-- Price -->
      <div class="form-group">
        <label for="offering_price">Price</label>
        <input 
          id="offering_price" 
          name="price"
          bind:value={formData.price} 
          type="number" 
          step="0.01"
          min="0"
          placeholder="0.00"
          class:error={formData.price < 0}
        />
      </div>

      <!-- Currency -->
      <div class="form-group">
        <label for="offering_currency">Currency *</label>
        <select 
          id="offering_currency" 
          name="currency"
          bind:value={formData.currency}
          required
          class:error={!isValidCurrency(formData.currency)}
        >
          {#each currencyOptions as currency}
            <option value={currency.code}>{currency.name}</option>
          {/each}
        </select>
      </div>

      <!-- Comment -->
      <div class="form-group span-4">
        <label for="offering_comment">Internal Comment</label>
        <textarea 
          id="offering_comment" 
          name="comment"
          bind:value={formData.comment} 
          placeholder="Additional notes about this offering..."
          rows="3"
        ></textarea>
      </div>

      <!-- Calculated Info Section -->
      {#if formData.price > 0 && formData.currency}
        <div class="form-group span-4">
          <div class="info-section">
            <h4>Offering Summary</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Product:</span>
                <span class="info-value">{selectedProduct?.title || 'Not selected'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Full Specification:</span>
                <span class="info-value">
                  {#if formData.size || formData.dimensions}
                    {formData.size || ''} {formData.dimensions || ''}
                  {:else}
                    Standard specification
                  {/if}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Price:</span>
                <span class="info-value price-display">
                  {formData.price.toFixed(2)} {formData.currency}
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}
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
  <form class="offering-form" on:submit={handleSubmit}>
    <div class="form-grid">
      <!-- Product Definition -->
      <div class="form-group span-3">
        <label for="product_def_id">Product Definition *</label>
        <select 
          id="product_def_id" 
          bind:value={formData.product_def_id} 
          required
          class:error={!formData.product_def_id}
        >
          <option value="" disabled>Select a product...</option>
          {#each availableProducts as product}
            <option value={product.product_def_id} title={product.description}>
              {product.title}
            </option>
          {/each}
        </select>
        {#if selectedProduct?.description}
          <span class="field-hint">{selectedProduct.description}</span>
        {/if}
      </div>

      <!-- Size -->
      <div class="form-group">
        <label for="offering_size">Size</label>
        <input 
          id="offering_size" 
          bind:value={formData.size} 
          type="text" 
          placeholder="S, M, 6mm..."
          list="size-presets"
        />
        <datalist id="size-presets">
          {#each sizePresets as size}
            <option value={size}></option>
          {/each}
        </datalist>
      </div>

      <!-- Dimensions -->
      <div class="form-group span-2">
        <label for="offering_dimensions">Dimensions</label>
        <input 
          id="offering_dimensions" 
          bind:value={formData.dimensions} 
          type="text" 
          placeholder="20x30x40 cm, 6mm diameter..."
          class:error={formData.dimensions && !isValidDimensions(formData.dimensions)}
        />
        {#if formData.dimensions && !isValidDimensions(formData.dimensions)}
          <span class="error-text">Please use valid dimension format (e.g., "20x30 cm")</span>
        {/if}
      </div>

      <!-- Price -->
      <div class="form-group">
        <label for="offering_price">Price</label>
        <input 
          id="offering_price" 
          bind:value={formData.price} 
          type="number" 
          step="0.01"
          min="0"
          placeholder="0.00"
          class:error={formData.price < 0}
        />
      </div>

      <!-- Currency -->
      <div class="form-group">
        <label for="offering_currency">Currency *</label>
        <select 
          id="offering_currency" 
          bind:value={formData.currency}
          required
          class:error={!isValidCurrency(formData.currency)}
        >
          {#each currencyOptions as currency}
            <option value={currency.code}>{currency.name}</option>
          {/each}
        </select>
      </div>

      <!-- Comment -->
      <div class="form-group span-4">
        <label for="offering_comment">Internal Comment</label>
        <textarea 
          id="offering_comment" 
          bind:value={formData.comment} 
          placeholder="Additional notes about this offering..."
          rows="3"
        ></textarea>
      </div>

      <!-- Calculated Info Section -->
      {#if formData.price > 0 && formData.currency}
        <div class="form-group span-4">
          <div class="info-section">
            <h4>Offering Summary</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Product:</span>
                <span class="info-value">{selectedProduct?.title || 'Not selected'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Full Specification:</span>
                <span class="info-value">
                  {#if formData.size || formData.dimensions}
                    {formData.size || ''} {formData.dimensions || ''}
                  {:else}
                    Standard specification
                  {/if}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Price:</span>
                <span class="info-value price-display">
                  {formData.price.toFixed(2)} {formData.currency}
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}
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

  .offering-form {
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

  .form-group.span-3 {
    grid-column: span 3;
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
  .form-group select,
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
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary, #4f46e5);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .form-group input.error,
  .form-group select.error,
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

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-muted, #64748b);
    margin-top: 0.25rem;
    font-style: italic;
  }

  .error-text {
    font-size: 0.75rem;
    color: #dc3545;
    margin-top: 0.25rem;
    font-weight: 500;
  }

  /* Info Section */
  .info-section {
    background: #f8fafc;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    padding: 1rem;
  }

  .info-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: var(--color-heading, #0f172a);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--color-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-weight: 600;
    color: var(--color-text, #1e293b);
    font-size: 0.875rem;
  }

  .price-display {
    color: var(--color-primary, #4f46e5);
    font-size: 1rem;
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
      grid-template-columns: 1fr 1fr;
    }

    .form-group.span-3,
    .form-group.span-4 {
      grid-column: span 2;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-group.span-2,
    .form-group.span-3,
    .form-group.span-4 {
      grid-column: span 1;
    }

    .offering-form {
      padding: 1rem;
    }

    .form-header {
      padding: 1rem;
    }

    .form-actions {
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>