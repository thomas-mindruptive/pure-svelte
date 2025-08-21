<script lang="ts">
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  import { log } from "$lib/utils/logger";
  
  // Props - Component API
  export let categories: Array<{
    category_id: number;
    name: string;
    description?: string;
    offering_count?: number;
    comment?: string;
    link?: string;
  }> = [];
  
  export let height: string = '400px';
  export let loading: boolean = false;
  export let showOfferingCount: boolean = true;
  
  // Event callbacks - Svelte 5 style
  export let onrowclick: ((category: any) => void) | undefined = undefined;
  export let ondelete: ((category: any) => void) | undefined = undefined;
  export let onsort: ((event: { key: string }) => void) | undefined = undefined;

  // Internal state for delete operations
  let deletingCategoryIds = new Set<number>();

  // Column definitions for category data
  $: categoryColumns = [
    { key: 'name', title: 'Category Name', sortable: true, width: '3fr' },
    { key: 'description', title: 'Description', sortable: false, width: '4fr' },
    ...(showOfferingCount ? [{ key: 'offering_count', title: 'Offerings', sortable: true, type: 'number' as const, width: '1fr' }] : []),
    { key: 'comment', title: 'Comment', sortable: false, width: '2fr' }
  ] as ColumnDefinition[];

  // Handle row click for navigation to offerings
  function handleRowClick(event: { row: any }) {
    const category = event.row;
    log.info("Category row clicked for navigation", { 
      categoryId: category.category_id, 
      categoryName: category.name,
      offeringCount: category.offering_count
    });
    
    onrowclick?.(category);
  }

  // Handle delete with loading state management
  function handleDelete(event: { row: any }) {
    const category = event.row;
    const categoryId = category.category_id;
    
    // Prevent multiple concurrent deletes of same category
    if (deletingCategoryIds.has(categoryId)) {
      log.warn("Delete already in progress for category", { categoryId });
      return;
    }

    log.info("Category delete initiated", { 
      categoryId, 
      categoryName: category.name,
      hasOfferings: (category.offering_count || 0) > 0
    });

    // Add to deleting set for UI feedback
    deletingCategoryIds.add(categoryId);
    deletingCategoryIds = deletingCategoryIds; // Trigger reactivity

    // Delegate to parent with cleanup callback
    ondelete?.({
      ...category,
      onComplete: () => {
        deletingCategoryIds.delete(categoryId);
        deletingCategoryIds = deletingCategoryIds;
        log.info("Category delete completed", { categoryId });
      }
    });
  }

  // Check if delete is disabled for a category
  function isDeleteDisabled(category: any): boolean {
    return deletingCategoryIds.has(category.category_id) || loading;
  }

  // Get delete tooltip text
  function getDeleteTooltip(category: any): string {
    if (loading) return "Grid is loading...";
    if (deletingCategoryIds.has(category.category_id)) {
      return "Removing category...";
    }
    
    const offeringCount = category.offering_count || 0;
    if (offeringCount > 0) {
      return `Remove category "${category.name}" (${offeringCount} offerings may be affected)`;
    }
    
    return `Remove category "${category.name}"`;
  }

  // Handle sort events from datagrid
  function handleSort(event: { key: string }) {
    log.info("Category grid sort requested", { sortKey: event.key });
    onsort?.(event);
  }

  // Reactive data for display
  $: displayCategories = loading ? [] : categories;
  $: showDelete = !!ondelete;

  // Log when categories data changes
  $: if (categories.length >= 0) {
    log.info("CategoryGrid data updated", { 
      categoryCount: categories.length,
      totalOfferings: categories.reduce((sum, cat) => sum + (cat.offering_count || 0), 0),
      loading 
    });
  }
</script>

<!-- 
  Category Grid: Thin wrapper around generic Datagrid
  Handles category-specific display logic and navigation to offerings
-->
<Datagrid
  rows={displayCategories}
  columns={categoryColumns}
  {height}
  onsort={handleSort}
  ondelete={showDelete ? handleDelete : undefined}
  showDelete={showDelete}
  deleteDisabled={isDeleteDisabled}
  deleteTooltip={getDeleteTooltip}
>
  <!-- Custom cell rendering for category-specific fields -->
  <div slot="cell" let:row let:column let:value>
    {#if column.key === 'name'}
      <!-- Clickable category name for navigation -->
      <button 
        class="category-name-button"
        class:loading
        class:has-offerings={row.offering_count > 0}
        disabled={loading}
        on:click={() => handleRowClick({ row })}
        title="View category offerings and details"
      >
        <span class="category-name">{value || 'Unnamed Category'}</span>
        {#if row.offering_count > 0}
          <span class="category-badge">{row.offering_count}</span>
        {/if}
      </button>
      
    {:else if column.key === 'offering_count'}
      <!-- Offering count with visual indicator -->
      <div class="offering-count" class:has-offerings={value > 0}>
        <span class="count-number">{value || 0}</span>
        <span class="count-label">
          {value === 1 ? 'offering' : 'offerings'}
        </span>
      </div>
      
    {:else if column.key === 'description'}
      <!-- Description with truncation for long text -->
      <div class="category-description" title={value || ''}>
        {value || 'No description available'}
      </div>
      
    {:else if column.key === 'comment' && value}
      <!-- Comment with special styling -->
      <div class="category-comment" title={value}>
        💬 {value}
      </div>
      
    {:else if column.key === 'link' && value}
      <!-- External link if provided -->
      <a 
        href={value} 
        target="_blank" 
        rel="noopener noreferrer"
        class="category-link"
        on:click|stopPropagation
        title="Open category link"
      >
        🔗 Link
      </a>
      
    {:else}
      <!-- Default display for other fields -->
      {value || '-'}
    {/if}
  </div>

  <!-- Custom delete button for categories -->
  <div slot="delete" let:row>
    <button
      class="category-delete-button"
      class:deleting={deletingCategoryIds.has(row.category_id)}
      class:has-dependencies={row.offering_count > 0}
      disabled={isDeleteDisabled(row)}
      title={getDeleteTooltip(row)}
      on:click={() => handleDelete({ row })}
    >
      {#if deletingCategoryIds.has(row.category_id)}
        <span class="delete-spinner">⏳</span>
      {:else if row.offering_count > 0}
        ⚠️
      {:else}
        🗑️
      {/if}
    </button>
  </div>
</Datagrid>

<style>
  /* Category name button for navigation */
  .category-name-button {
    background: transparent;
    border: none;
    color: var(--color-primary, #4f46e5);
    cursor: pointer;
    font: inherit;
    text-align: left;
    padding: 0;
    width: 100%;
    transition: all 0.2s ease;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .category-name-button:hover:not(:disabled) {
    color: #4338ca;
  }

  .category-name-button:hover .category-name {
    text-decoration: underline;
  }

  .category-name-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .category-name-button.loading {
    color: var(--color-muted, #64748b);
  }

  .category-name {
    flex: 1;
  }

  .category-badge {
    background: var(--color-primary, #4f46e5);
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 500;
    min-width: 1.5rem;
    text-align: center;
  }

  .category-name-button.has-offerings .category-badge {
    background: #059669;
  }

  /* Offering count display */
  .offering-count {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-muted, #64748b);
  }

  .offering-count.has-offerings {
    color: #059669;
    font-weight: 500;
  }

  .count-number {
    font-weight: 600;
    font-size: 1rem;
  }

  .count-label {
    font-size: 0.875rem;
  }

  /* Category description */
  .category-description {
    color: var(--color-text, #1e293b);
    line-height: 1.4;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Category comment */
  .category-comment {
    color: var(--color-muted, #64748b);
    font-style: italic;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Category link */
  .category-link {
    color: var(--color-primary, #4f46e5);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s ease;
  }

  .category-link:hover {
    color: #4338ca;
    text-decoration: underline;
  }

  /* Enhanced delete button for categories */
  .category-delete-button {
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

  .category-delete-button:hover:not(:disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
    transform: scale(1.05);
  }

  .category-delete-button.has-dependencies {
    color: #f59e0b;
    border-color: #fbbf24;
  }

  .category-delete-button.has-dependencies:hover:not(:disabled) {
    background-color: #fef3c7;
    border-color: #f59e0b;
  }

  .category-delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .category-delete-button.deleting {
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