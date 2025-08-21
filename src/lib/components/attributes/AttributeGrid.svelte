<script lang="ts">
  import Datagrid from "$lib/components/Datagrid.svelte";
  import type { ColumnDefinition } from "$lib/clientAndBack/columnDefinitions";
  import { log } from "$lib/utils/logger";
  
  // Props - Component API
  export let attributes: Array<{
    attribute_id: number;
    offering_id: number;
    name: string;
    value: string;
    category: 'Physical' | 'Technical' | 'Marketing' | 'Logistics' | 'Legal' | 'Other';
    data_type?: 'text' | 'number' | 'boolean' | 'date' | 'url';
    unit?: string;
    is_required?: boolean;
    created_at?: string;
  }> = [];
  
  export let height: string = '400px';
  export let loading: boolean = false;
  export let showCategory: boolean = true;
  export let maxValueLength: number = 50;
  
  // Event callbacks - Svelte 5 style
  export let onrowclick: ((attribute: any) => void) | undefined = undefined;
  export let ondelete: ((attribute: any) => void) | undefined = undefined;
  export let onsort: ((event: { key: string }) => void) | undefined = undefined;

  // Internal state for delete operations
  let deletingAttributeIds = new Set<number>();

  // Column definitions for attribute data
  $: attributeColumns = [
    { key: 'name', title: 'Attribute Name', sortable: true, width: '2.5fr' },
    { key: 'value', title: 'Value', sortable: false, width: '3fr' },
    ...(showCategory ? [{ key: 'category', title: 'Category', sortable: true, width: '1.5fr' }] : []),
    { key: 'data_type', title: 'Type', sortable: true, width: '1fr' }
  ] as ColumnDefinition[];

  // Handle row click for navigation to links
  function handleRowClick(event: { row: any }) {
    const attribute = event.row;
    log.info("Attribute row clicked for navigation", { 
      attributeId: attribute.attribute_id, 
      attributeName: attribute.name,
      category: attribute.category,
      valueLength: attribute.value?.length || 0
    });
    
    onrowclick?.(attribute);
  }

  // Handle delete with loading state management
  function handleDelete(event: { row: any }) {
    const attribute = event.row;
    const attributeId = attribute.attribute_id;
    
    // Prevent multiple concurrent deletes of same attribute
    if (deletingAttributeIds.has(attributeId)) {
      log.warn("Delete already in progress for attribute", { attributeId });
      return;
    }

    log.info("Attribute delete initiated", { 
      attributeId, 
      attributeName: attribute.name,
      category: attribute.category,
      isRequired: attribute.is_required
    });

    // Add to deleting set for UI feedback
    deletingAttributeIds.add(attributeId);
    deletingAttributeIds = deletingAttributeIds; // Trigger reactivity

    // Delegate to parent with cleanup callback
    ondelete?.({
      ...attribute,
      onComplete: () => {
        deletingAttributeIds.delete(attributeId);
        deletingAttributeIds = deletingAttributeIds;
        log.info("Attribute delete completed", { attributeId });
      }
    });
  }

  // Check if delete is disabled for an attribute
  function isDeleteDisabled(attribute: any): boolean {
    return deletingAttributeIds.has(attribute.attribute_id) || loading;
  }

  // Get delete tooltip text
  function getDeleteTooltip(attribute: any): string {
    if (loading) return "Grid is loading...";
    if (deletingAttributeIds.has(attribute.attribute_id)) {
      return "Deleting attribute...";
    }
    
    if (attribute.is_required) {
      return `Delete required attribute "${attribute.name}" (careful: might be needed)`;
    }
    
    return `Delete attribute "${attribute.name}"`;
  }

  // Truncate long values for display
  function truncateValue(value: string, maxLength: number): { display: string; isTruncated: boolean } {
    if (!value || value.length <= maxLength) {
      return { display: value || '', isTruncated: false };
    }
    return { display: value.substring(0, maxLength) + '...', isTruncated: true };
  }

  // Format value based on data type
  function formatValue(value: string, dataType?: string, unit?: string): string {
    if (!value) return '';
    
    switch (dataType) {
      case 'boolean':
        return value.toLowerCase() === 'true' ? '✅ Yes' : '❌ No';
      case 'number':
        return unit ? `${value} ${unit}` : value;
      case 'url':
        return value; // Will be rendered as link in template
      case 'date':
        try {
          return new Date(value).toLocaleDateString();
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  // Handle sort events from datagrid
  function handleSort(event: { key: string }) {
    log.info("Attribute grid sort requested", { sortKey: event.key });
    onsort?.(event);
  }

  // Reactive data for display
  $: displayAttributes = loading ? [] : attributes;
  $: showDelete = !!ondelete;

  // Calculate statistics by category
  $: statsByCategory = attributes.reduce((acc, attr) => {
    const cat = attr.category || 'Other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Log when attributes data changes
  $: if (attributes.length >= 0) {
    log.info("AttributeGrid data updated", { 
      attributeCount: attributes.length,
      categoryBreakdown: statsByCategory,
      requiredCount: attributes.filter(a => a.is_required).length,
      loading 
    });
  }
</script>

<!-- 
  Attribute Grid: Thin wrapper around generic Datagrid
  Handles product attribute-specific display logic and navigation to links
-->
<Datagrid
  rows={displayAttributes}
  columns={attributeColumns}
  {height}
  onsort={handleSort}
  ondelete={showDelete ? handleDelete : undefined}
  showDelete={showDelete}
  deleteDisabled={isDeleteDisabled}
  deleteTooltip={getDeleteTooltip}
>
  <!-- Custom cell rendering for attribute-specific fields -->
  <div slot="cell" let:row let:column let:value>
    {#if column.key === 'name'}
      <!-- Clickable attribute name for navigation -->
      <button 
        class="attribute-name-button"
        class:loading
        class:required={row.is_required}
        disabled={loading}
        on:click={() => handleRowClick({ row })}
        title="View attribute details and related links"
      >
        <span class="attribute-name">{value || 'Unnamed Attribute'}</span>
        {#if row.is_required}
          <span class="required-indicator" title="Required attribute">*</span>
        {/if}
        {#if row.unit}
          <span class="unit-indicator" title="Unit: {row.unit}">({row.unit})</span>
        {/if}
      </button>
      
    {:else if column.key === 'value'}
      <!-- Formatted value with truncation and type-specific rendering -->
      {@const formattedValue = formatValue(value, row.data_type, row.unit)}
      {@const truncated = truncateValue(formattedValue, maxValueLength)}
      
      <div class="attribute-value" 
           class:truncated={truncated.isTruncated}
           class:url={row.data_type === 'url'}
           class:boolean={row.data_type === 'boolean'}
           title={truncated.isTruncated ? formattedValue : undefined}>
        
        {#if row.data_type === 'url' && value}
          <a href={value} target="_blank" rel="noopener noreferrer" 
             class="value-link" on:click|stopPropagation>
            {truncated.display}
          </a>
        {:else}
          <span class="value-text">{truncated.display}</span>
        {/if}
        
        {#if truncated.isTruncated}
          <span class="truncation-indicator" title="Click to view full value">...</span>
        {/if}
      </div>
      
    {:else if column.key === 'category'}
      <!-- Category with color coding -->
      <span class="category-badge category-{value?.toLowerCase() || 'other'}">
        {value || 'Other'}
      </span>
      
    {:else if column.key === 'data_type'}
      <!-- Data type with icon -->
      <div class="data-type-display">
        {#if value === 'text'}
          📝 Text
        {:else if value === 'number'}
          🔢 Number
        {:else if value === 'boolean'}
          ✅ Boolean
        {:else if value === 'date'}
          📅 Date
        {:else if value === 'url'}
          🔗 URL
        {:else}
          ❓ {value || 'Unknown'}
        {/if}
      </div>
      
    {:else}
      <!-- Default display for other fields -->
      {value || '-'}
    {/if}
  </div>

  <!-- Custom delete button for attributes -->
  <div slot="delete" let:row>
    <button
      class="attribute-delete-button"
      class:deleting={deletingAttributeIds.has(row.attribute_id)}
      class:required={row.is_required}
      disabled={isDeleteDisabled(row)}
      title={getDeleteTooltip(row)}
      on:click={() => handleDelete({ row })}
    >
      {#if deletingAttributeIds.has(row.attribute_id)}
        <span class="delete-spinner">⏳</span>
      {:else if row.is_required}
        ⚠️
      {:else}
        🗑️
      {/if}
    </button>
  </div>
</Datagrid>

<style>
  /* Attribute name button for navigation */
  .attribute-name-button {
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
    gap: 0.375rem;
  }

  .attribute-name-button:hover:not(:disabled) {
    color: #4338ca;
  }

  .attribute-name-button:hover .attribute-name {
    text-decoration: underline;
  }

  .attribute-name-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .attribute-name-button.loading {
    color: var(--color-muted, #64748b);
  }

  .attribute-name-button.required {
    font-weight: 500;
  }

  .attribute-name {
    flex: 1;
  }

  .required-indicator {
    color: #dc2626;
    font-weight: 700;
    font-size: 1.125rem;
  }

  .unit-indicator {
    color: var(--color-muted, #64748b);
    font-size: 0.875rem;
    font-style: italic;
  }

  /* Attribute value display */
  .attribute-value {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 1.5rem;
  }

  .attribute-value.truncated {
    cursor: help;
  }

  .attribute-value.url .value-text {
    color: var(--color-primary, #4f46e5);
  }

  .attribute-value.boolean .value-text {
    font-weight: 500;
  }

  .value-text {
    flex: 1;
    word-break: break-word;
  }

  .value-link {
    color: var(--color-primary, #4f46e5);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .value-link:hover {
    color: #4338ca;
    text-decoration: underline;
  }

  .truncation-indicator {
    color: var(--color-muted, #64748b);
    font-weight: 700;
    cursor: help;
  }

  /* Category badges with color coding */
  .category-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .category-badge.category-physical {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .category-badge.category-technical {
    background-color: #dcfce7;
    color: #166534;
  }

  .category-badge.category-marketing {
    background-color: #fef3c7;
    color: #d97706;
  }

  .category-badge.category-logistics {
    background-color: #f3e8ff;
    color: #7c3aed;
  }

  .category-badge.category-legal {
    background-color: #fee2e2;
    color: #dc2626;
  }

  .category-badge.category-other {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  /* Data type display */
  .data-type-display {
    font-size: 0.875rem;
    color: var(--color-text, #1e293b);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* Enhanced delete button for attributes */
  .attribute-delete-button {
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

  .attribute-delete-button:hover:not(:disabled) {
    background-color: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
    transform: scale(1.05);
  }

  .attribute-delete-button.required {
    color: #f59e0b;
    border-color: #fbbf24;
  }

  .attribute-delete-button.required:hover:not(:disabled) {
    background-color: #fef3c7;
    border-color: #f59e0b;
  }

  .attribute-delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #9ca3af;
  }

  .attribute-delete-button.deleting {
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