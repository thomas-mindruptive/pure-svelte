<script lang="ts">
  // CategoryAssignment.svelte (Svelte 5 + Runes) - COMPACT LAYOUT
  //
  // PURPOSE:
  // A compact, single-row UI component for assigning existing categories
  // to a supplier. Replaces the larger form-block layout.
  //
  // WORKFLOW:
  // 1. Shows dropdown of available (unassigned) categories.
  // 2. User selects a category and clicks "Assign".
  // 3. Fires `onAssigned` event for the parent to handle the API call.

  import { log } from "$lib/utils/logger";
  import type { ProductCategory } from "$lib/domain/domainTypes";

  // === PROPS ====================================================================================

  export type CategoryAssignmentProps = {
    supplierId: number;
    availableCategories?: ProductCategory[];
    loading?: boolean;
    disabled?: boolean;
    assignCbk?: (category: ProductCategory) => void;
    onError?: (error: string) => void;
  }

  const {
    supplierId,
    availableCategories = [] as ProductCategory[],
    loading = false,
    disabled = false,
    assignCbk,
    onError,
  }:CategoryAssignmentProps = $props();

  // === STATE ====================================================================================

  let selectedCategoryId = $state<number | null>(null);
  let assigning = $state(false);

  // === DERIVED ==================================================================================

  const selectedCategory = $derived(
    selectedCategoryId ? availableCategories.find((cat: ProductCategory) => cat.category_id === selectedCategoryId) : null,
  );

  const canAssign = $derived(!loading && !disabled && !assigning && selectedCategoryId !== null && selectedCategory !== undefined);

  // === EVENTS ===================================================================================

  async function handleAssign() {
    if (!selectedCategory || !supplierId) {
      onError?.("Invalid selection - please select a category");
      return;
    }
    if (assigning) return;
    assigning = true;
    try {
      // The parent component is responsible for the API call.
      // This component's only job is to signal the user's intent.
      assignCbk?.(selectedCategory);
      selectedCategoryId = null; // Reset after assigning
    } catch (error) {
      log.error({ component: "CategoryAssignment", error }, "ASSIGNMENT_FAILED");
      onError?.(error instanceof Error ? error.message : "Assignment failed");
    } finally {
      assigning = false;
    }
  }

  function handleCategorySelect(event: Event) {
    const target = event.target as HTMLSelectElement;
    selectedCategoryId = target.value ? Number(target.value) : null;
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (canAssign) {
      handleAssign();
    }
  }
</script>

<!-- NEW, COMPACT LAYOUT -->
<div class="category-assignment-compact">
  <strong class="assignment-title">Assign Category:</strong>

  <form
    class="assignment-controls"
    onsubmit={handleSubmit}
  >
    <!-- 
      An explicit label is included for accessibility but visually hidden.
      The placeholder in the <select> serves as the visual cue.
    -->
    <label
      for="category-select-{supplierId}"
      class="visually-hidden"
    >
      Available Categories
    </label>

    <select
      id="category-select-{supplierId}"
      value={selectedCategoryId ?? ""}
      onchange={handleCategorySelect}
      disabled={disabled || assigning || availableCategories.length === 0}
      required
    >
      <option value="">
        {availableCategories.length === 0 ? "No categories available" : "Select a category..."}
      </option>
      {#each availableCategories as category (category.category_id)}
        <option value={category.category_id}>
          {category.name}
        </option>
      {/each}
    </select>

    <button
      type="submit"
      class="primary-button"
      disabled={!canAssign}
      aria-busy={assigning}
      title={canAssign ? `Assign ${selectedCategory?.name || "selected category"}` : "Select a category to assign"}
    >
      {#if assigning}
        <span
          class="pc-grid__spinner"
          aria-hidden="true"
        ></span>
      {/if}
      Assign
    </button>
  </form>
</div>

<style>
  /* --- NEW, COMPACT STYLES --- */
  .category-assignment-compact {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--color-background);
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
  }

  .assignment-title {
    font-weight: 600;
    color: var(--color-heading, #0f172a);
    font-size: 0.875rem;
  }

  .assignment-controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-grow: 1; /* Allow the form to take up remaining space */
  }

  /* Override the default 100% width from form-elements.css for inline layout */
  .assignment-controls select {
    width: auto;
    min-width: 250px;
  }

  .assignment-controls .primary-button {
    /* Ensure button has a consistent width */
    min-width: 100px;
    justify-content: center;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Accessibility helper to hide labels visually but keep them for screen readers */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
