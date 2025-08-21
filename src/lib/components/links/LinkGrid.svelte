<script lang="ts">
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  import { log } from "$lib/utils/logger";
  
  // Props - Component API
  export let links: Array<{
    link_id: number;
    offering_id: number;
    url: string;
    type: 'Product Page' | 'Specifications' | 'Documentation' | 'Support' | 'Manual' | 'Video' | 'Download' | 'Other';
    description?: string;
    is_primary?: boolean;
    is_active?: boolean;
    created_at?: string;
    last_checked?: string;
  }> = [];
  
  export let height: string = '400px';
  export let loading: boolean = false;
  export let maxUrlLength: number = 60;
  export let maxDescriptionLength: number = 80;
  
  // Event callbacks - Svelte 5 style
  export let onrowclick: ((link: any) => void) | undefined = undefined;
  export let ondelete: ((link: any) => void) | undefined = undefined;
  export let onsort: ((event: { key: string }) => void) | undefined = undefined;

  // Internal state for delete operations
  let deletingLinkIds = new Set<number>();

  // Column definitions for link data
  const linkColumns: ColumnDefinition[] = [
    { key: 'type', title: 'Type', sortable: true, width: '1.5fr' },
    { key: 'url', title: 'URL', sortable: false, width: '4fr' },
    { key: 'description', title: 'Description', sortable: false, width: '3fr' },
    { key: 'is_active', title: 'Status', sortable: true, width: '1fr' }
  ];

  // Handle row click to open link in new tab
  function handleRowClick(event: { row: any }) {
    const link = event.row;
    log.info("Link row clicked - opening URL", { 
      linkId: link.link_id, 
      url: link.url,
      type: link.type,
      isPrimary: link.is_primary
    });
    
    // Open link in new tab/window
    if (link.url) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
    
    // Also notify parent if callback provided
    onrowclick?.(link);
  }

  // Handle delete with loading state management
  function handleDelete(event: { row: any }) {
    const link = event.row;
    const linkId = link.link_id;
    
    // Prevent multiple concurrent deletes of same link
    if (deletingLinkIds.has(linkId)) {
      log.warn("Delete already in progress for link", { linkId });
      return;
    }

    log.info("Link delete initiated", { 
      linkId, 
      url: link.url,
      type: link.type,
      isPrimary: link.is_primary
    });

    // Add to deleting set for UI feedback
    deletingLinkIds.add(linkId);
    deletingLinkIds = deletingLinkIds; // Trigger reactivity

    // Delegate to parent with cleanup callback
    ondelete?.({
      ...link,
      onComplete: () => {
        deletingLinkIds.delete(linkId);
        deletingLinkIds = deletingLinkIds;
        log.info("Link delete completed", { linkId });
      }
    });
  }

  // Check if delete is disabled for a link
  function isDeleteDisabled(link: any): boolean {
    return deletingLinkIds.has(link.link_id) || loading;
  }

  // Get delete tooltip text
  function getDeleteTooltip(link: any): string {
    if (loading) return "Grid is loading...";
    if (deletingLinkIds.has(link.link_id)) {
      return "Deleting link...";
    }
    
    if (link.is_primary) {
      return `Delete primary link "${link.type}" (careful: this is the main link)`;
    }
    
    return `Delete ${link.type.toLowerCase()} link`;
  }

  // Get icon for link type
  function getLinkTypeIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'product page': return '🏪';
      case 'specifications': return '📋';
      case 'documentation': return '📚';
      case 'support': return '🛠️';
      case 'manual': return '📖';
      case 'video': return '🎥';
      case 'download': return '⬇️';
      default: return '🔗';
    }
  }

  // Truncate URL for display
  function truncateUrl(url: string, maxLength: number): { display: string; isTruncated: boolean } {
    if (!url || url.length <= maxLength) {
      return { display: url || '', isTruncated: false };
    }
    
    // Smart truncation: keep protocol and domain, truncate path
    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.hostname}`;
      const remaining = maxLength - domain.length - 3; // -3 for "..."
      
      if (remaining > 10) {
        const path = urlObj.pathname + urlObj.search + urlObj.hash;
        return { 
          display: `${domain}...${path.slice(-remaining)}`, 
          isTruncated: true 
        };
      }
    } catch (e) {
      // Fallback for invalid URLs
    }
    
    return { display: url.substring(0, maxLength) + '...', isTruncated: true };
  }

  // Truncate description for display
  function truncateDescription(description: string, maxLength: number): { display: string; isTruncated: boolean } {
    if (!description || description.length <= maxLength) {
      return { display: description || '', isTruncated: false };
    }
    return { display: description.substring(0, maxLength) + '...', isTruncated: true };
  }

  // Check if URL is accessible (simplified)
  function isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Handle sort events from datagrid
  function handleSort(event: { key: string }) {
    log.info("Link grid sort requested", { sortKey: event.key });
    onsort?.(event);
  }

  // Reactive data for display
  $: displayLinks = loading ? [] : links;
  $: showDelete = !!ondelete;

  // Calculate statistics by type
  $: statsByType = links.reduce((acc, link) => {
    const type = link.type || 'Other';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Log when links data changes
  $: if (links.length >= 0) {
    log.info("LinkGrid data updated", { 
      linkCount: links.length,
      typeBreakdown: statsByType,
      primaryCount: links.filter(l => l.is_primary).length,
      activeCount: links.filter(l => l.is_active !== false).length,
      loading 
    });
  }
</script>

<!-- 
  Link Grid: Thin wrapper around generic Datagrid
  Handles link-specific display logic - final level in hierarchy
-->
<Datagrid
  rows={displayLinks}
  columns={linkColumns}
  {height}
  onsort={handleSort}
  ondelete={showDelete ? handleDelete : undefined}
  showDelete={showDelete}
  deleteDisabled={isDeleteDisabled}
  deleteTooltip={getDeleteTooltip}
>
  <!-- Custom cell rendering for link-specific fields -->
  <div slot="cell" let:row let:column let:value>
    {#if column.key === 'type'}
      <!-- Link type with icon and primary indicator -->
      <div class="link-type-display" 
           class:primary={row.is_primary}
           title={row.is_primary ? 'Primary link for this offering' : undefined}>
        <span class="type-icon">{getLinkTypeIcon(value)}</span>
        <span class="type-text">{value || 'Other'}</span>
        {#if row.is_primary}
          <span class="primary-badge" title="Primary link">★</span>
        {/if}
      </div>
      
    {:else if column.key === 'url'}
      <!-- URL with truncation and external link icon -->
      {@const truncated = truncateUrl(value, maxUrlLength)}
      {@const isValid = isValidUrl(value)}
      
      <div class="url-display" class:invalid={!isValid}>
        <button 
          class="url-button"
          class:loading
          class:invalid={!isValid}
          disabled={loading || !isValid}
          on:click={() => handleRowClick({ row })}
          title={truncated.isTruncated ? `Full URL: ${value}\nClick to open in new tab` : 'Click to open in new tab'}
        >
          <span class="url-text">{truncated.display}</span>
          {#if isValid}
            <span class="external-icon">↗️</span>
          {:else}
            <span class="invalid-icon">❌</span>
          {/if}
        </button>
        
        {#if truncated.isTruncated}
          <span class="truncation-indicator" title="URL is truncated">...</span>
        {/if}
      </div>
      
    {:else if column.key === 'description'}
      <!-- Description with truncation -->
      {@const truncated = truncateDescription(value, maxDescriptionLength)}
      
      <div class="description-display" 
           class:truncated={truncated.isTruncated}
           title={truncated.isTruncated ? value : undefined}>
        <span class="description-text">{truncated.display || 'No description'}</span>
        {#if truncated.isTruncated}
          <span class="truncation-indicator">...</span>
        {/if}
      </div>
      
    {:else if column.key === 'is_active'}
      <!-- Active status -->
      <div class="status-display">
        {#if value === false}
          <span class="status-badge inactive">Inactive</span>
        {:else}
          <span class="status-badge active">Active</span>
        {/if}
      </div>
      
    {:else}
      <!-- Default display for other fields -->
      {value || '-'}
    {/if}
  </div>

  <!-- Custom delete button for links -->
  <div slot="delete" let:row>
    <button
      class="link-delete-button"
      class:deleting={deletingLinkIds.has(row.link_id)}
      class:primary={row.is_primary}
      disabled={isDeleteDisabled(row)}
      title={getDeleteTooltip(row)}
      on:click={() => handleDelete({ row })}
    >
      {#if deletingLinkIds.has(row.link_id)}
        <span class="delete-spinner">⏳</span>
      {:else if row.is_primary}
        ⭐
      {:else}
        🗑️
      {/if}
    </button>
  </div>
</Datagrid>

<style>
  /* Link type display */
  .link-type-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .link-type-display.primary {
    font-weight: 600;
  }

  .type-icon {
    font-size: 1rem;
  }

  .type-text {
    flex: 1;
  }

  .primary-badge {
    color: #f59e0b;
    font-size: 0.875rem;
    font-weight: 700;
  }

  /* URL display and button */
  .url-display {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
  }

  .url-display.invalid {
    opacity: 0.6;
  }

  .url-button {
    background: transparent;
    border: none;
    color: var(--color-primary, #4f46e5);
    cursor: pointer;
    font: inherit;
    text-align: left;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    transition: all 0.2s ease;
    text-decoration: none;
    flex: 1;
    min-width: 0; /* Allow shrinking */
  }

  .url-button:hover:not(:disabled) {
    color: #4338ca;
  }

  .url-button:hover .url-text {
    text-decoration: underline;
  }

  .url-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .url-button.loading {
    color: var(--color-muted, #64748b);
  }

  .url-button.invalid {
    color: #dc2626;
    cursor: not-allowed;
  }

  .url-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .external-icon {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .invalid-icon {
    font-size: 0.875rem;
  }

  .truncation-indicator {
    color: var(--color-muted, #64748b);
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
  }

  /* Description display */
  .description-display {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .description-display.truncated {
    cursor: help;
  }

  .description-text {
    flex: 1;
    color: var(--color-text, #1e293b);
    line-height: 1.4;
  }

  /* Status display */
  .status-display {
    display: flex;
    align-items: center;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .status-badge.active {
    background-color: #dcfce7;
    color: #166534;
  }

  .status-badge.inactive {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  /* Enhanced delete button for links */
  .link-delete-button {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    color: #dc3545;
    min-width: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .link-delete-button:hover:not(:disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
    transform: scale(1.05);
  }

  .link-delete-button.primary {
    color: #f59e0b;
    border-color: #fbbf24;
  }

  .link-delete-button.primary:hover:not(:disabled) {
    background-color: #fef3c7;
    border-color: #f59e0b;
  }

  .link-delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .link-delete-button.deleting {
    animation: deleteProgress 2s infinite;
    border-color: #f59e0b;
    background-color: #fef3c7;
    cursor: wait;
  }

  .delete-spinner {
    animation: spin 1s linear infinite;
  }

  /* Delete button animations */
  @keyframes deleteProgress {
    0%, 100% {
      opacity: 1;
      border-color: #f59e0b;
    }
    50% {
      opacity: 0.6;
      border-color: #dc3545;
    }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>