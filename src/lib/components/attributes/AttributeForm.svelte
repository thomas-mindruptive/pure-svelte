<script lang="ts">
  import { attributeEnhance } from '$lib/utils/formEnhance';
  import { log } from '$lib/utils/logger';

  // Props - Component API (Based on wholesaler_offering_attributes table)
  export let attributeAssignment: {
    offering_id: number;
    attribute_id: number;
    value: string;
  };
  
  // Available global attributes for dropdown (would come from API)
  export let availableAttributes: Array<{
    attribute_id: number;
    name: string;
    description?: string;
  }> = [];
  
  export let isEditing: boolean = false;
  export let showHeader: boolean = true;
  export let showActions: boolean = true;
  
  // Hybrid Mode Support
  export let mode: 'client' | 'server' = 'client';
  export let action: string = '';
  export let enhance: any = undefined;
  export let redirectAfterCreate: string = '/supplierbrowser?level=attributes';

  // Events - Svelte 5 Style (for client mode)
  export let onsubmit: ((event: { attributeAssignment: typeof attributeAssignment }) => void) | undefined = undefined;
  export let oncancel: (() => void) | undefined = undefined;

  // Local copy of data for editing
  let formData = { ...attributeAssignment };

  // Reactive updates when attributeAssignment prop changes
  $: formData = { ...attributeAssignment };

  // Default enhance function (used when no custom enhance is passed)
  function defaultEnhance() {
    return attributeEnhance(redirectAfterCreate);
  }

  // Final enhance function - custom or default
  $: finalEnhance = enhance || defaultEnhance();

  // Form Handlers (for client mode)
  function handleSubmit(event: Event) {
    event.preventDefault();
    
    // Validation
    if (!formData.offering_id) {
      log.warn("Attribute form validation failed", { error: "Offering ID is required" });
      alert('Offering context is required');
      return;
    }

    if (!formData.attribute_id) {
      log.warn("Attribute form validation failed", { error: "Attribute selection is required" });
      alert('Please select an attribute');
      return;
    }

    // FIXED: Check for undefined/null before trim()
    if (!formData.value || !formData.value.trim()) {
      log.warn("Attribute form validation failed", { error: "Attribute value is required" });
      alert('Please enter a value for this attribute');
      return;
    }

    log.info("Attribute form submitted (client mode)", { 
      offeringId: formData.offering_id,
      attributeId: formData.attribute_id,
      value: formData.value,
      isEditing 
    });

    // Fire event with form data
    onsubmit?.({ attributeAssignment: formData });
  }

  function handleCancel() {
    log.info("Attribute form cancelled");
    
    // Reset form to original data
    formData = { ...attributeAssignment };
    oncancel?.();
  }

  // Get selected attribute details
  $: selectedAttribute = availableAttributes.find(a => a.attribute_id === formData.attribute_id);

  // Filter out already assigned attributes for new assignments
  $: availableForAssignment = isEditing 
    ? availableAttributes // When editing, allow current selection
    : availableAttributes; // TODO: Filter out already assigned attributes when API available

  // Validation helpers - FIXED: Check for undefined/null before trim()
  function isValidValue(value: string): boolean {
    if (!value) return false;
    return value.trim().length > 0 && value.trim().length <= 200; // Match DB constraint
  }

  // Value suggestions based on attribute name (heuristic)
  function getValueSuggestions(attributeName: string): string[] {
    if (!attributeName) return [];
    const name = attributeName.toLowerCase();
    
    if (name.includes('color') || name.includes('colour')) {
      return ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Pink', 'Purple', 'Orange'];
    }
    
    if (name.includes('size')) {
      return ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Small', 'Medium', 'Large'];
    }
    
    if (name.includes('material')) {
      return ['Cotton', 'Polyester', 'Silk', 'Wool', 'Leather', 'Metal', 'Plastic', 'Glass'];
    }
    
    if (name.includes('weight')) {
      return ['Light', 'Medium', 'Heavy', '100g', '250g', '500g', '1kg'];
    }
    
    if (name.includes('dimension') || name.includes('length') || name.includes('width') || name.includes('height')) {
      return ['10cm', '20cm', '30cm', '50cm', '1m', '6mm', '8mm', '10mm'];
    }
    
    if (name.includes('boolean') || name.includes('yes') || name.includes('no')) {
      return ['Yes', 'No', 'True', 'False'];
    }
    
    return []; // No suggestions for this attribute
  }

  // Computed properties - FIXED: Check for undefined/null before trim()
  $: isValid = formData.offering_id > 0 && 
               formData.attribute_id > 0 && 
               isValidValue(formData.value);
  $: formTitle = isEditing ? 'Edit Attribute Value' : 'Assign Attribute to Offering';
  $: submitButtonText = isEditing ? 'Update Attribute' : 'Assign Attribute';
  $: valueSuggestions = selectedAttribute ? getValueSuggestions(selectedAttribute.name) : [];

  // Log form state changes
  $: if (formData) {
    log.debug("Attribute form data updated", { 
      offeringId: formData.offering_id,
      attributeId: formData.attribute_id,
      attributeName: selectedAttribute?.name,
      value: formData.value,
      valueLength: formData.value ? formData.value.length : 0,
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
  <form class="attribute-form" method="POST" {action} use:enhance={finalEnhance}>
    <!-- Hidden field for offering context -->
    <input type="hidden" name="offering_id" value={attributeAssignment.offering_id} />
    
    <div class="form-grid">
      <!-- Attribute Selection -->
      <div class="form-group span-2">
        <label for="attribute_id">Attribute *</label>
        <select 
          id="attribute_id" 
          name="attribute_id"
          bind:value={formData.attribute_id} 
          required
          disabled={isEditing}
          class:error={!formData.attribute_id}
        >
          <option value="" disabled>Select an attribute...</option>
          {#each availableForAssignment as attribute}
            <option value={attribute.attribute_id} title={attribute.description}>
              {attribute.name}
            </option>
          {/each}
        </select>
        {#if selectedAttribute?.description}
          <span class="field-hint">{selectedAttribute.description}</span>
        {/if}
        {#if isEditing}
          <span class="field-note">Attribute cannot be changed when editing</span>
        {/if}
      </div>

      <!-- Attribute Value -->
      <div class="form-group span-2">
        <label for="attribute_value">Value *</label>
        <input 
          id="attribute_value" 
          name="value"
          bind:value={formData.value} 
          type="text" 
          required
          maxlength="200"
          placeholder={selectedAttribute ? `Enter ${selectedAttribute.name.toLowerCase()}...` : "Enter value..."}
          class:error={!isValidValue(formData.value)}
          list={valueSuggestions.length > 0 ? "value-suggestions" : undefined}
        />
        {#if valueSuggestions.length > 0}
          <datalist id="value-suggestions">
            {#each valueSuggestions as suggestion}
              <option value={suggestion}></option>
            {/each}
          </datalist>
        {/if}
        <div class="value-meta">
          <span class="char-count" class:warning={formData.value && formData.value.length > 180}>
            {formData.value ? formData.value.length : 0}/200 characters
          </span>
          {#if valueSuggestions.length > 0}
            <span class="suggestions-hint">Suggestions available</span>
          {/if}
        </div>
      </div>

      <!-- Preview Section -->
      {#if selectedAttribute && formData.value}
        <div class="form-group span-4">
          <div class="preview-section">
            <h4>Attribute Preview</h4>
            <div class="preview-display">
              <div class="preview-item">
                <span class="preview-label">{selectedAttribute.name}:</span>
                <span class="preview-value">{formData.value}</span>
              </div>
              {#if selectedAttribute.description}
                <div class="preview-description">
                  {selectedAttribute.description}
                </div>
              {/if}
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
  <form class="attribute-form" on:submit={handleSubmit}>
    <div class="form-grid">
      <!-- Attribute Selection -->
      <div class="form-group span-2">
        <label for="attribute_id">Attribute *</label>
        <select 
          id="attribute_id" 
          bind:value={formData.attribute_id} 
          required
          disabled={isEditing}
          class:error={!formData.attribute_id}
        >
          <option value="" disabled>Select an attribute...</option>
          {#each availableForAssignment as attribute}
            <option value={attribute.attribute_id} title={attribute.description}>
              {attribute.name}
            </option>
          {/each}
        </select>
        {#if selectedAttribute?.description}
          <span class="field-hint">{selectedAttribute.description}</span>
        {/if}
        {#if isEditing}
          <span class="field-note">Attribute cannot be changed when editing</span>
        {/if}
      </div>

      <!-- Attribute Value -->
      <div class="form-group span-2">
        <label for="attribute_value">Value *</label>
        <input 
          id="attribute_value" 
          bind:value={formData.value} 
          type="text" 
          required
          maxlength="200"
          placeholder={selectedAttribute ? `Enter ${selectedAttribute.name.toLowerCase()}...` : "Enter value..."}
          class:error={!isValidValue(formData.value)}
          list={valueSuggestions.length > 0 ? "value-suggestions" : undefined}
        />
        {#if valueSuggestions.length > 0}
          <datalist id="value-suggestions">
            {#each valueSuggestions as suggestion}
              <option value={suggestion}></option>
            {/each}
          </datalist>
        {/if}
        <div class="value-meta">
          <span class="char-count" class:warning={formData.value && formData.value.length > 180}>
            {formData.value ? formData.value.length : 0}/200 characters
          </span>
          {#if valueSuggestions.length > 0}
            <span class="suggestions-hint">Suggestions available</span>
          {/if}
        </div>
      </div>

      <!-- Preview Section -->
      {#if selectedAttribute && formData.value}
        <div class="form-group span-4">
          <div class="preview-section">
            <h4>Attribute Preview</h4>
            <div class="preview-display">
              <div class="preview-item">
                <span class="preview-label">{selectedAttribute.name}:</span>
                <span class="preview-value">{formData.value}</span>
              </div>
              {#if selectedAttribute.description}
                <div class="preview-description">
                  {selectedAttribute.description}
                </div>
              {/if}
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

  .attribute-form {
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
  .form-group select {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    background: white;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary, #4f46e5);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .form-group input.error,
  .form-group select.error {
    border-color: #dc3545;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);
  }

  .form-group input::placeholder {
    color: var(--color-muted, #64748b);
  }

  .form-group input:disabled,
  .form-group select:disabled {
    background-color: #f8fafc;
    color: var(--color-muted, #64748b);
    cursor: not-allowed;
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-muted, #64748b);
    margin-top: 0.25rem;
    font-style: italic;
  }

  .field-note {
    font-size: 0.75rem;
    color: #f59e0b;
    margin-top: 0.25rem;
    font-weight: 500;
  }

  .value-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.25rem;
    font-size: 0.75rem;
  }

  .char-count {
    color: var(--color-muted, #64748b);
  }

  .char-count.warning {
    color: #f59e0b;
    font-weight: 500;
  }

  .suggestions-hint {
    color: var(--color-primary, #4f46e5);
    font-style: italic;
  }

  /* Preview Section */
  .preview-section {
    background: #f8fafc;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    padding: 1rem;
  }

  .preview-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: var(--color-heading, #0f172a);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-display {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .preview-label {
    font-weight: 600;
    color: var(--color-text, #1e293b);
    min-width: 8rem;
  }

  .preview-value {
    background: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    font-family: monospace;
    font-size: 0.875rem;
  }

  .preview-description {
    font-size: 0.75rem;
    color: var(--color-muted, #64748b);
    font-style: italic;
    margin-top: 0.25rem;
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

    .attribute-form {
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

    .value-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }
  }
</style>