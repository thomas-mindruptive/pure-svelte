<script lang="ts">
  import { log } from '$lib/utils/logger';

  // Props - Component API (Based on wholesaler_offering_links table)
  export let link: {
    link_id?: number;
    offering_id: number;
    url: string;
    notes: string;
    created_at?: string;
  };
  
  export let isEditing: boolean = false;
  export let showHeader: boolean = true;
  export let showActions: boolean = true;
  
  // Hybrid Mode Support
  export let mode: 'client' | 'server' = 'client';
  export let action: string = '';
  export let enhance: any = undefined;
  export let redirectAfterCreate: string = '/supplierbrowser?level=links';

  // Events - Svelte 5 Style (for client mode)
  export let onsubmit: ((event: { link: typeof link }) => void) | undefined = undefined;
  export let oncancel: (() => void) | undefined = undefined;

  // Local copy of data for editing
  let formData = { ...link };

  // Reactive updates when link prop changes
  $: formData = { ...link };

  // Default enhance function for server mode
  function defaultEnhance() {
    return async ({ result }: { result: any }) => {
      if (result.type === 'failure') {
        alert(result.data?.error ?? 'Failed to save link');
        return;
      }
      if (result.type === 'success') {
        if (result.data?.created?.link_id) {
          alert('Link created successfully');
          if (redirectAfterCreate && redirectAfterCreate !== '#') {
            const newId = result.data.created.link_id;
            const redirectUrl = redirectAfterCreate.replace('{id}', newId);
            window.location.href = redirectUrl;
          }
        } else {
          alert('Link updated successfully');
        }
      }
    };
  }

  // Final enhance function - custom or default
  $: finalEnhance = enhance || defaultEnhance();

  // Form Handlers (for client mode)
  function handleSubmit(event: Event) {
    event.preventDefault();
    
    // Validation
    if (!formData.offering_id) {
      log.warn("Link form validation failed", { error: "Offering ID is required" });
      alert('Offering context is required');
      return;
    }

    if (!isValidUrl(formData.url)) {
      log.warn("Link form validation failed", { error: "Valid URL is required" });
      alert('Please enter a valid URL');
      return;
    }

    // FIXED: Check for undefined/null before .length
    if (formData.notes && formData.notes.length > 500) {
      log.warn("Link form validation failed", { error: "Notes too long" });
      alert('Notes cannot exceed 500 characters');
      return;
    }

    log.info("Link form submitted (client mode)", { 
      linkId: formData.link_id,
      offeringId: formData.offering_id,
      url: formData.url,
      hasNotes: !!formData.notes,
      isEditing 
    });

    // Fire event with form data
    onsubmit?.({ link: formData });
  }

  function handleCancel() {
    log.info("Link form cancelled");
    
    // Reset form to original data
    formData = { ...link };
    oncancel?.();
  }

  // URL validation helper - FIXED: Check for undefined/null before trim()
  function isValidUrl(url: string): boolean {
    if (!url || !url.trim()) return false;
    try {
      const urlObj = new URL(url.trim());
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Extract domain from URL for display - FIXED: Check for undefined/null before trim()
  function extractDomain(url: string): string {
    if (!url || !url.trim()) return '';
    try {
      const urlObj = new URL(url.trim());
      return urlObj.hostname;
    } catch {
      return '';
    }
  }

  // Suggest link types based on URL
  function suggestLinkType(url: string): string {
    const domain = extractDomain(url).toLowerCase();
    
    if (domain.includes('youtube') || domain.includes('vimeo')) return 'Video';
    if (domain.includes('docs.') || domain.includes('documentation')) return 'Documentation';
    if (domain.includes('support') || domain.includes('help')) return 'Support';
    if (domain.includes('spec') || domain.includes('datasheet')) return 'Specifications';
    if (domain.includes('download') || domain.includes('files')) return 'Download';
    if (url.includes('.pdf')) return 'PDF Document';
    if (url.includes('manual') || url.includes('guide')) return 'Manual';
    
    return 'General Link';
  }

  // Common URL prefixes for quick input
  const urlPrefixes = [
    'https://www.',
    'https://',
    'http://www.',
    'http://'
  ];

  // Computed properties - FIXED: Check for undefined/null before length checks
  $: isValid = formData.offering_id > 0 && 
               isValidUrl(formData.url) && 
               (!formData.notes || formData.notes.length <= 500);
  $: formTitle = isEditing ? 'Edit Link' : 'Add New Link';
  $: submitButtonText = isEditing ? 'Update Link' : 'Add Link';
  $: urlDomain = extractDomain(formData.url);
  $: suggestedType = formData.url ? suggestLinkType(formData.url) : '';

  // Log form state changes
  $: if (formData) {
    log.debug("Link form data updated", { 
      offeringId: formData.offering_id,
      url: formData.url,
      urlLength: formData.url ? formData.url.length : 0,
      notesLength: formData.notes ? formData.notes.length : 0,
      domain: urlDomain,
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
  <form class="link-form" method="POST" {action} use:enhance={finalEnhance}>
    <!-- Hidden field for offering context -->
    <input type="hidden" name="offering_id" value={link.offering_id} />
    {#if link.link_id}
      <input type="hidden" name="link_id" value={link.link_id} />
    {/if}
    
    <div class="form-grid">
      <!-- URL Input -->
      <div class="form-group span-4">
        <label for="link_url">URL *</label>
        <div class="url-input-container">
          <input 
            id="link_url" 
            name="url"
            bind:value={formData.url} 
            type="url" 
            required
            maxlength="2048"
            placeholder="https://example.com/product-page"
            class:error={formData.url && !isValidUrl(formData.url)}
            list="url-prefixes"
          />
          <datalist id="url-prefixes">
            {#each urlPrefixes as prefix}
              <option value={prefix}></option>
            {/each}
          </datalist>
        </div>
        
        <div class="url-meta">
          <span class="char-count" class:warning={formData.url && formData.url.length > 2000}>
            {formData.url ? formData.url.length : 0}/2048 characters
          </span>
          {#if urlDomain}
            <span class="domain-display">Domain: {urlDomain}</span>
          {/if}
          {#if suggestedType}
            <span class="type-suggestion">Detected: {suggestedType}</span>
          {/if}
        </div>
      </div>

      <!-- Notes -->
      <div class="form-group span-4">
        <label for="link_notes">Notes</label>
        <textarea 
          id="link_notes" 
          name="notes"
          bind:value={formData.notes} 
          placeholder="Optional notes about this link..."
          maxlength="500"
          rows="4"
          class:warning={formData.notes && formData.notes.length > 450}
        ></textarea>
        <div class="notes-meta">
          <span class="char-count" class:warning={formData.notes && formData.notes.length > 450}>
            {formData.notes ? formData.notes.length : 0}/500 characters
          </span>
        </div>
      </div>

      <!-- Link Preview -->
      {#if isValidUrl(formData.url)}
        <div class="form-group span-4">
          <div class="preview-section">
            <h4>Link Preview</h4>
            <div class="preview-display">
              <div class="preview-item">
                <span class="preview-icon">🔗</span>
                <div class="preview-details">
                  <div class="preview-url">
                    <a href={formData.url} target="_blank" rel="noopener noreferrer">
                      {formData.url}
                    </a>
                  </div>
                  {#if formData.notes}
                    <div class="preview-notes">{formData.notes}</div>
                  {/if}
                  {#if suggestedType}
                    <div class="preview-type">Type: {suggestedType}</div>
                  {/if}
                </div>
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
  <form class="link-form" on:submit={handleSubmit}>
    <div class="form-grid">
      <!-- URL Input -->
      <div class="form-group span-4">
        <label for="link_url">URL *</label>
        <div class="url-input-container">
          <input 
            id="link_url" 
            bind:value={formData.url} 
            type="url" 
            required
            maxlength="2048"
            placeholder="https://example.com/product-page"
            class:error={formData.url && !isValidUrl(formData.url)}
            list="url-prefixes"
          />
          <datalist id="url-prefixes">
            {#each urlPrefixes as prefix}
              <option value={prefix}></option>
            {/each}
          </datalist>
        </div>
        
        <div class="url-meta">
          <span class="char-count" class:warning={formData.url && formData.url.length > 2000}>
            {formData.url ? formData.url.length : 0}/2048 characters
          </span>
          {#if urlDomain}
            <span class="domain-display">Domain: {urlDomain}</span>
          {/if}
          {#if suggestedType}
            <span class="type-suggestion">Detected: {suggestedType}</span>
          {/if}
        </div>
      </div>

      <!-- Notes -->
      <div class="form-group span-4">
        <label for="link_notes">Notes</label>
        <textarea 
          id="link_notes" 
          bind:value={formData.notes} 
          placeholder="Optional notes about this link..."
          maxlength="500"
          rows="4"
          class:warning={formData.notes && formData.notes.length > 450}
        ></textarea>
        <div class="notes-meta">
          <span class="char-count" class:warning={formData.notes && formData.notes.length > 450}>
            {formData.notes ? formData.notes.length : 0}/500 characters
          </span>
        </div>
      </div>

      <!-- Link Preview -->
      {#if isValidUrl(formData.url)}
        <div class="form-group span-4">
          <div class="preview-section">
            <h4>Link Preview</h4>
            <div class="preview-display">
              <div class="preview-item">
                <span class="preview-icon">🔗</span>
                <div class="preview-details">
                  <div class="preview-url">
                    <a href={formData.url} target="_blank" rel="noopener noreferrer">
                      {formData.url}
                    </a>
                  </div>
                  {#if formData.notes}
                    <div class="preview-notes">{formData.notes}</div>
                  {/if}
                  {#if suggestedType}
                    <div class="preview-type">Type: {suggestedType}</div>
                  {/if}
                </div>
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

  .link-form {
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

  .form-group.span-4 {
    grid-column: span 4;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--color-heading, #0f172a);
    font-size: 0.875rem;
  }

  .url-input-container {
    position: relative;
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

  .form-group input.error {
    border-color: #dc3545;
    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);
  }

  .form-group textarea.warning {
    border-color: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.1);
  }

  .form-group input::placeholder,
  .form-group textarea::placeholder {
    color: var(--color-muted, #64748b);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 6rem;
    line-height: 1.4;
  }

  .url-meta,
  .notes-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .char-count {
    color: var(--color-muted, #64748b);
  }

  .char-count.warning {
    color: #f59e0b;
    font-weight: 500;
  }

  .domain-display {
    color: var(--color-primary, #4f46e5);
    font-weight: 500;
  }

  .type-suggestion {
    color: #059669;
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
  }

  .preview-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .preview-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .preview-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .preview-url {
    word-break: break-all;
  }

  .preview-url a {
    color: var(--color-primary, #4f46e5);
    text-decoration: none;
    font-size: 0.875rem;
  }

  .preview-url a:hover {
    text-decoration: underline;
  }

  .preview-notes {
    color: var(--color-text, #1e293b);
    font-size: 0.875rem;
    line-height: 1.4;
    padding: 0.25rem 0.5rem;
    background: white;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }

  .preview-type {
    color: var(--color-muted, #64748b);
    font-size: 0.75rem;
    font-style: italic;
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

    .form-group.span-4 {
      grid-column: span 1;
    }

    .link-form {
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

    .url-meta,
    .notes-meta {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>