<!-- src/lib/components/Breadcrumb.svelte - ENHANCED STYLING -->

<script module lang="ts">
  /**
   * Defines the structure of a single breadcrumb item.
   * This type is exported so other components can use it for type safety.
   */
  export type Crumb = {
    label: string;
    href?: string;
    active?: boolean;
  };
</script>

<script lang="ts">
  /**
   * Breadcrumb Component
   * @props
   * - items: Crumb[] - An array of crumb objects to display.
   */
  let { items = [] as Crumb[] } = $props();
</script>

<nav aria-label="Breadcrumb" class="breadcrumb-nav">
  <ol class="breadcrumb-list">
    {#each items as item, i}
      <li class="breadcrumb-item">
        {#if item.href && !item.active}
          <!-- Render as a link if it has an href and is not the active page -->
          <a href={item.href} class="breadcrumb-link">
            {item.label}
          </a>
        {:else}
          <!-- Render as plain text for the active page or items without a link -->
          <span
            class="breadcrumb-label"
            aria-current={item.active ? 'page' : undefined}
          >
            {item.label}
          </span>
        {/if}

        <!-- Add a separator after each item except the last one -->
        {#if i < items.length - 1}
          <span class="breadcrumb-separator" aria-hidden="true">/</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  .breadcrumb-nav {
    margin-bottom: 0.1rem;
    padding: 1rem 1rem;
  }

  .breadcrumb-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.875rem;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-muted, #64748b);
  }

  /* --- STYLING CHANGE 1: INACTIVE LINKS --- */
  /* Inactive links are now less prominent by default to emphasize the active trail. */
  .breadcrumb-link {
    color: var(--color-muted, #64748b);
    text-decoration: none;
    border-bottom: 1px dotted var(--color-border, #e2e8f0);
    transition: all 0.2s ease;
  }

  /* On hover, they become fully colored and underlined like standard links. */
  .breadcrumb-link:hover {
    color: var(--color-primary, #4f46e5);
    border-bottom-color: var(--color-primary, #4f46e5);
  }

  .breadcrumb-label {
    /* Base style for the current, active page label */
    font-weight: 500;
    color: var(--color-heading, #0f172a);
  }

  /* --- STYLING CHANGE 2: ACTIVE ITEM HIGHLIGHT --- */
  /* Use the accessibility attribute to style the active item. */
  .breadcrumb-label[aria-current="page"] {
    /* Add a solid underline in the primary color */
    text-decoration: underline;
    text-decoration-color: var(--color-primary, #4f46e5);
    text-decoration-thickness: 2px;
    
    /* Add some space between the text and the line for a cleaner look */
    text-underline-offset: 4px;
  }

  .breadcrumb-separator {
    user-select: none;
  }
</style>