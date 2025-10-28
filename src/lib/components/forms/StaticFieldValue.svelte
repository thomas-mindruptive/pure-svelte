<script lang="ts">
  /**
   * StaticFieldValue.svelte
   *
   * Displays a readonly calculated field value (e.g., server-enriched metadata).
   * Used in forms to show non-editable data like file hash, dimensions, etc.
   *
   * Usage:
   * ```svelte
   * <StaticFieldValue label="File Hash" value={data.image.file_hash} formatter={truncateHash} />
   * <StaticFieldValue label="File Size" value={data.image.file_size_bytes} formatter={formatFileSize} />
   * <StaticFieldValue label="Dimensions" value={{w: data.image.width_px, h: data.image.height_px}} formatter={formatDimensions} />
   * ```
   */

  type Props = {
    label: string;
    value: any;
    formatter?: (v: any) => string;
    class?: string; // For grid span classes (span-2, span-3, etc.)
    hint?: string; // Optional help text
  };

  const {
    label,
    value,
    formatter,
    class: className = '',
    hint,
  }: Props = $props();

  const displayValue = $derived(formatter ? formatter(value) : value ?? 'N/A');
</script>

<div class="static-field-group {className}">
  <div class="static-label">
    {label}
    {#if hint}
      <span class="field-hint">{hint}</span>
    {/if}
  </div>
  <div class="static-value">{displayValue}</div>
</div>

<style>
  .static-field-group {
    display: flex;
    flex-direction: column;
  }

  /* Grid span support (same as form-group) */
  .static-field-group.span-2 {
    grid-column: span 2;
  }

  .static-field-group.span-3 {
    grid-column: span 3;
  }

  .static-field-group.span-4 {
    grid-column: span 4;
  }

  .static-field-group.span-5 {
    grid-column: span 5;
  }

  .static-label {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--color-heading, #0f172a);
    font-size: 0.875rem;
  }

  .field-hint {
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--color-muted, #64748b);
    margin-left: 0.5rem;
  }

  .static-value {
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 4px;
    color: var(--color-muted, #64748b);
    font-size: 0.875rem;
    font-family: 'Courier New', monospace; /* Monospace for hashes/technical values */
    word-break: break-all; /* Allow long values to wrap */
    min-height: 2.25rem; /* Match input field height */
    display: flex;
    align-items: center;
  }
</style>
